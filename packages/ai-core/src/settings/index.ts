import type { Payload } from 'payload'
import type { AICoreOptions, RouteConfig, RoutesOption, Settings, TaskClass } from '../contracts'
import { TASK_CLASSES } from '../contracts'
import { SLUGS } from '../collections/slugs'
import { loose } from '../usage/db'

/** Every module key the suite knows; the default for enabledModules when the global is empty. */
export const ALL_MODULES = ['content', 'search', 'assistant', 'marketing', 'support', 'channels', 'insights', 'media', 'copilot'] as const

/** Module keys that are always on (core endpoints). */
export const ALWAYS_ENABLED = new Set(['core'])

export const DEFAULT_SETTINGS: Settings = {
  enabledModules: [...ALL_MODULES],
  allowedDomains: [],
  limits: { visitorPerMinute: 20, visitorPerDay: 200, maxInputChars: 2000, maxOutputTokensShopper: 400 },
  retention: { shopperChatsDays: 90, staffChatsDays: 365, usageDays: 730, auditDays: 1095 },
  budgets: {},
}

/** Settings plus admin-configured default routes from the ai-settings global. */
export type LoadedSettings = Settings & { routes?: RoutesOption; noTraining?: boolean }

export interface SettingsLoaderDeps {
  options?: Partial<AICoreOptions>
  /** Modules installed in this app (default ALL_MODULES). */
  knownModules?: string[]
  /** Cache lifetime; the global's afterChange hook invalidates immediately. Default 5 min. */
  ttlMs?: number
}

export interface SettingsLoader {
  load(payload: Payload, tenant?: string | number): Promise<LoadedSettings>
  isModuleEnabled(module: string, payload: Payload, tenant?: string | number): Promise<boolean>
  invalidate(): void
}

const loaders = new Set<{ invalidate(): void }>()

/** Called from the ai-settings global afterChange hook. */
export const invalidateAllSettings = (): void => {
  for (const l of loaders) l.invalidate()
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const pickNum = (v: unknown, d: number) => (isNum(v) ? v : d)
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : (x as { value?: unknown })?.value)).filter((x): x is string => typeof x === 'string' && x.length > 0) : []

/** Map the stored global document onto Settings, with plugin options as defaults. */
export const mergeSettings = (global: Record<string, unknown> | null | undefined, deps: SettingsLoaderDeps = {}): LoadedSettings => {
  const g = global ?? {}
  const o = deps.options ?? {}
  const known = deps.knownModules ?? [...ALL_MODULES]
  const limits = (g.limits ?? {}) as Record<string, unknown>
  const retention = (g.retention ?? {}) as Record<string, unknown>
  const budgets = (g.budgets ?? {}) as Record<string, unknown>
  const d = DEFAULT_SETTINGS

  const perModule: Record<string, number> = { ...(o.budgets?.perModule ?? {}) }
  if (Array.isArray(budgets.perModule)) {
    for (const row of budgets.perModule as { module?: string; share?: number; limitMicros?: number }[]) {
      if (!row?.module) continue
      if (isNum(row.limitMicros) && row.limitMicros > 0) perModule[row.module] = row.limitMicros
      else if (isNum(row.share) && row.share > 0) perModule[row.module] = row.share
    }
  }

  let routes: RoutesOption | undefined
  if (Array.isArray(g.routes)) {
    for (const r of g.routes as { task?: string; models?: unknown; timeoutMs?: number; maxRetries?: number }[]) {
      const models = strings(r?.models)
      if (!r?.task || !TASK_CLASSES.includes(r.task as TaskClass) || !models.length) continue
      routes ??= {}
      const rc: RouteConfig = { models }
      if (isNum(r.timeoutMs)) rc.timeoutMs = r.timeoutMs
      if (isNum(r.maxRetries)) rc.maxRetries = r.maxRetries
      routes[r.task as TaskClass] = rc
    }
  }

  const enabled = strings(g.enabledModules)
  const domains = strings(g.allowedDomains)
  const monthly = isNum(budgets.monthlyMicros) && budgets.monthlyMicros > 0 ? budgets.monthlyMicros : o.budgets?.monthlyMicros

  return {
    enabledModules: Array.isArray(g.enabledModules) && g.enabledModules.length ? enabled : known,
    brandVoice: typeof g.brandVoice === 'string' && g.brandVoice.trim() ? g.brandVoice : undefined,
    allowedDomains: [...new Set([...(o.allowedDomains ?? []), ...domains])],
    limits: {
      visitorPerMinute: pickNum(limits.visitorPerMinute, d.limits.visitorPerMinute),
      visitorPerDay: pickNum(limits.visitorPerDay, d.limits.visitorPerDay),
      maxInputChars: pickNum(limits.maxInputChars, d.limits.maxInputChars),
      maxOutputTokensShopper: pickNum(limits.maxOutputTokensShopper, d.limits.maxOutputTokensShopper),
    },
    retention: {
      shopperChatsDays: pickNum(retention.shopperChatsDays, o.retention?.shopperChatsDays ?? d.retention.shopperChatsDays),
      staffChatsDays: pickNum(retention.staffChatsDays, o.retention?.staffChatsDays ?? d.retention.staffChatsDays),
      usageDays: pickNum(retention.usageDays, o.retention?.usageDays ?? d.retention.usageDays),
      auditDays: pickNum(retention.auditDays, o.retention?.auditDays ?? d.retention.auditDays),
    },
    budgets: { monthlyMicros: monthly, perModule: Object.keys(perModule).length ? perModule : undefined },
    routes,
    noTraining: g.noTraining === true ? true : undefined,
  }
}

/** Loads the ai-settings global merged with plugin options; cached per Payload instance. */
export const createSettingsLoader = (deps: SettingsLoaderDeps = {}): SettingsLoader => {
  const ttl = deps.ttlMs ?? 5 * 60_000
  let cache = new WeakMap<Payload, { at: number; value: Promise<LoadedSettings> }>()

  const loader: SettingsLoader = {
    load(payload) {
      const hit = cache.get(payload)
      if (hit && Date.now() - hit.at < ttl) return hit.value
      const value = loose(payload)
        .findGlobal({ slug: SLUGS.settings, depth: 0, overrideAccess: true })
        .catch((e: unknown) => {
          payload.logger?.warn?.(`[ai-suite] could not read ${SLUGS.settings}; using plugin options (${(e as Error)?.message ?? e})`)
          return null
        })
        .then((g) => mergeSettings(g, deps))
      cache.set(payload, { at: Date.now(), value })
      value.catch(() => cache.delete(payload))
      return value
    },
    async isModuleEnabled(module, payload, tenant) {
      if (deps.options?.disabled) return false
      if (ALWAYS_ENABLED.has(module)) return true
      return (await loader.load(payload, tenant)).enabledModules.includes(module)
    },
    invalidate() {
      cache = new WeakMap()
    },
  }
  loaders.add(loader)
  return loader
}
