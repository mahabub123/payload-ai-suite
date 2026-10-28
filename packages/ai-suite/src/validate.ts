import type { RoutesOption } from '@payload-ai-suite/ai-core'
import { MODULE_ORDER, type AISuiteOptions, type SuiteModuleKey } from './options'

export class AISuiteConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`[ai-suite] Invalid aiSuite() options:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
    this.name = 'AISuiteConfigError'
  }
}

const isOn = (v: unknown): boolean => v !== undefined && v !== false && v !== null

export const enabledModules = (options: Pick<AISuiteOptions, 'modules'>): SuiteModuleKey[] =>
  MODULE_ORDER.filter((k) => isOn(options.modules?.[k]))

const distance = (a: string, b: string): number => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

const closest = (key: string): string | undefined => {
  const best = [...MODULE_ORDER].sort((x, y) => distance(key, x) - distance(key, y))[0]
  return distance(key, best) <= 3 ? best : undefined
}

const routeRefs = (routes: RoutesOption | undefined): string[] =>
  Object.values(routes ?? {}).flatMap((r) => (Array.isArray(r) ? r : (r?.models ?? [])))

/**
 * Checks option combinations up front so a wrong setup fails at boot with an actionable message
 * instead of a confusing runtime error deep inside a module. Returns non-fatal warnings.
 */
export const validateSuiteOptions = (options: AISuiteOptions): { warnings: string[] } => {
  if (!options || typeof options !== 'object') throw new AISuiteConfigError(['aiSuite() needs an options object.'])
  const problems: string[] = []
  const warnings: string[] = []
  const on = new Set(enabledModules(options))

  if (!options.preset && !options.adapters) {
    problems.push(`"preset" is required (one of 'ecommerce', 'services', 'content', 'custom'), or pass a built "adapters" provider.`)
  }
  if (options.preset === 'custom' && !options.custom && !options.overrides && !options.adapters) {
    problems.push(`preset 'custom' needs "custom" adapters or "overrides" mapping your collections to concepts.`)
  }

  if (!options.mockProvider && !options.providers?.length) {
    problems.push(
      `"providers" is empty. Add at least one, e.g. { id: 'openai', type: 'openai', apiKeyEnv: 'OPENAI_API_KEY' }, or set "mockProvider" for tests/offline dev.`,
    )
  }
  const ids = new Set<string>()
  for (const p of options.providers ?? []) {
    if (!p.id) problems.push(`A provider is missing "id".`)
    else if (ids.has(p.id)) problems.push(`Duplicate provider id "${p.id}".`)
    else ids.add(p.id)
    if (p.type === 'openai-compatible' && !p.baseURL) problems.push(`Provider "${p.id}" (openai-compatible) needs "baseURL".`)
    if (p.type === 'custom' && !p.adapter) problems.push(`Provider "${p.id}" (custom) needs "adapter".`)
    if ((p as { apiKey?: unknown }).apiKey !== undefined) {
      problems.push(`Provider "${p.id}" has "apiKey": never put keys in config. Use "apiKeyEnv" with the env var name.`)
    }
  }
  if (!options.mockProvider) {
    const allRefs = [
      ...routeRefs(options.routes),
      ...Object.values(options.routeOverrides?.module ?? {}).flatMap(routeRefs),
      ...Object.values(options.routeOverrides?.locale ?? {}).flatMap(routeRefs),
    ]
    for (const ref of allRefs) {
      const sep = ref.indexOf(':')
      if (sep <= 0) problems.push(`Route model "${ref}" must be "providerId:modelId".`)
      else if (!ids.has(ref.slice(0, sep)))
        warnings.push(`Route model "${ref}" refers to provider "${ref.slice(0, sep)}" which is not in "providers" (ok only if it is defined in ai-providers).`)
    }
  }

  const known = new Set<string>(MODULE_ORDER)
  for (const key of Object.keys(options.modules ?? {})) {
    if (!known.has(key)) {
      const hint = closest(key)
      problems.push(`Unknown module "${key}".${hint ? ` Did you mean "${hint}"?` : ''} Known: ${MODULE_ORDER.join(', ')}.`)
    }
  }
  if (on.has('channels') && !on.has('assistant')) {
    problems.push(`modules.channels needs modules.assistant: channels deliver the same assistant on WhatsApp/Messenger/email.`)
  }
  if (options.modules?.channels === true) {
    warnings.push(`modules.channels is true without channel settings; no channel will be connected until configured.`)
  }

  if (options.allowTenantKeys && !options.tenant) {
    problems.push(`allowTenantKeys needs "tenant" (Multi-Tenant integration), e.g. tenant: { field: 'tenant' }.`)
  }
  if (options.tenant && !options.tenant.field) problems.push(`tenant.field is required (the tenant field name, usually 'tenant').`)

  if (options.locales?.length && options.defaultLocale && !options.locales.includes(options.defaultLocale)) {
    problems.push(`defaultLocale "${options.defaultLocale}" is not in locales [${options.locales.join(', ')}].`)
  }

  const b = options.budgets
  if (b?.monthlyMicros !== undefined && (!Number.isInteger(b.monthlyMicros) || b.monthlyMicros < 0)) {
    problems.push(`budgets.monthlyMicros must be a non-negative integer (micro-USD, 100_000_000 = $100).`)
  }
  if (b?.perModule) {
    let sum = 0
    for (const [m, share] of Object.entries(b.perModule)) {
      if (!known.has(m)) problems.push(`budgets.perModule has unknown module "${m}".`)
      else if (!on.has(m as SuiteModuleKey)) warnings.push(`budgets.perModule.${m} is set but module "${m}" is not enabled.`)
      if (typeof share !== 'number' || share < 0 || share > 1) problems.push(`budgets.perModule.${m} must be a share between 0 and 1.`)
      else sum += share
    }
    if (sum > 1 + 1e-9) problems.push(`budgets.perModule shares add up to ${sum.toFixed(2)}; they must not exceed 1.`)
  }

  if (problems.length) throw new AISuiteConfigError(problems)
  return { warnings }
}
