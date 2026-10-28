import type { AIContext, Capability, ModelInfo, ProviderConfig, RouteConfig, RoutesOption, TaskClass } from '../contracts'
import { TASK_REQUIREMENTS } from '../contracts'

/** One row of the ai-routes collection, normalized. */
export interface RouteRow {
  task: TaskClass
  scope: 'global' | 'module' | 'tenant' | 'locale'
  /** Module key, locale code or tenant id depending on scope. */
  scopeValue?: string
  /** Owning tenant (multi-tenant field); rows with a tenant apply only to that tenant. */
  tenant?: string | number
  models: string[]
  timeoutMs?: number
  maxRetries?: number
}

export interface RouteSources {
  routes?: RoutesOption
  routeOverrides?: { module?: Record<string, RoutesOption>; locale?: Record<string, RoutesOption> }
  /** Default routes from the ai-settings global. */
  settingsRoutes?: RoutesOption
  dbRoutes?: RouteRow[]
}

type Scope = Pick<AIContext, 'module' | 'tenant' | 'locale'>

export const toRouteConfig = (v: string[] | RouteConfig | undefined): RouteConfig | undefined =>
  !v ? undefined : Array.isArray(v) ? (v.length ? { models: v } : undefined) : v.models?.length ? v : undefined

const same = (a: unknown, b: unknown) => a != null && b != null && String(a) === String(b)
const baseLang = (locale?: string) => (locale ?? '').split(/[-_]/)[0].toLowerCase()

/**
 * Pick the most specific route for a task. Specificity (low -> high): global < locale < module < tenant.
 * Within a level, code options < ai-settings defaults < ai-routes rows < tenant-owned ai-routes rows.
 */
export const resolveRouteConfig = (task: TaskClass, ctx: Scope, src: RouteSources): RouteConfig | undefined => {
  let winner: RouteConfig | undefined
  const take = (v: string[] | RouteConfig | undefined) => {
    const rc = toRouteConfig(v)
    if (rc) winner = rc
  }
  const rows = (src.dbRoutes ?? []).filter((r) => r.task === task && (r.tenant == null || same(r.tenant, ctx.tenant)))
  const fromRows = (pred: (r: RouteRow) => boolean) => {
    for (const r of rows.filter((x) => x.tenant == null && pred(x))) take(r)
    for (const r of rows.filter((x) => x.tenant != null && pred(x))) take(r)
  }
  const lang = baseLang(ctx.locale)

  take(src.routes?.[task])
  take(src.settingsRoutes?.[task])
  fromRows((r) => r.scope === 'global')

  if (ctx.locale) {
    if (lang && lang !== ctx.locale) {
      take(src.routeOverrides?.locale?.[lang]?.[task])
      fromRows((r) => r.scope === 'locale' && r.scopeValue?.toLowerCase() === lang)
    }
    take(src.routeOverrides?.locale?.[ctx.locale]?.[task])
    fromRows((r) => r.scope === 'locale' && r.scopeValue === ctx.locale)
  }

  take(src.routeOverrides?.module?.[ctx.module]?.[task])
  fromRows((r) => r.scope === 'module' && r.scopeValue === ctx.module)

  if (ctx.tenant != null) fromRows((r) => r.scope === 'tenant' && (same(r.scopeValue, ctx.tenant) || (r.scopeValue == null && same(r.tenant, ctx.tenant))))
  return winner
}

export const requiredCapabilities = (task: TaskClass, needs: readonly Capability[] = []): Capability[] => [
  ...new Set<Capability>([...TASK_REQUIREMENTS[task], ...needs]),
]

/** Is the model usable for this ctx (enabled, capable, provider exists and is visible to the tenant)? */
export const isUsable = (m: ModelInfo | undefined, caps: Capability[], provider: ProviderConfig | undefined, ctx: Scope, isMock = false): m is ModelInfo =>
  !!m && m.enabled !== false && caps.every((c) => m.capabilities.includes(c)) && (isMock || (!!provider && (provider.tenant == null || same(provider.tenant, ctx.tenant))))

/** Stable-sort models verified for the locale first (only if at least one is verified). */
export const preferLocale = (models: ModelInfo[], locale?: string): ModelInfo[] => {
  if (!locale) return models
  const lang = baseLang(locale)
  const ok = (m: ModelInfo) => (m.languagesVerified ?? []).some((l) => l === locale || baseLang(l) === lang)
  const verified = models.filter(ok)
  if (!verified.length || verified.length === models.length) return models
  return [...verified, ...models.filter((m) => !ok(m))]
}
