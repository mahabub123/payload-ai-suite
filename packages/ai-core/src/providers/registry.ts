import type { Payload } from 'payload'
import type { AIProvider, Capability, Crypto, ModelInfo, ModelInfoInput, ProviderConfig, ProviderType } from '../contracts'
import { AIError } from '../contracts'
import { SLUGS } from '../collections/slugs'
import { loose } from '../usage/db'
import { BUILTIN_CATALOG, defaultModelInfo, lookupCatalog } from './catalog'
import { buildProvider } from './factories'

export interface ProviderRegistryDeps {
  /** Code-configured providers (options.providers). */
  providers?: ProviderConfig[]
  /** Needed to decrypt BYOK keys stored in ai-providers. */
  crypto?: Crypto
  env?: Record<string, string | undefined>
  fetch?: typeof fetch
  /** When set, every route resolves to this provider (tests / offline dev). */
  mockProvider?: AIProvider
  /** Tenant relationship field on ai-providers (options.tenant.field). */
  tenantField?: string
  /** Include catalog models of each registered provider type in models(). Default true. */
  includeCatalog?: boolean
}

export interface ModelOverride extends Partial<ModelInfoInput> {
  providerId: string
  modelId: string
}

export interface ProviderRegistry {
  get(id: string): AIProvider | undefined
  /** Like get() but throws AIError('not_found'). */
  require(id: string): AIProvider
  config(id: string): ProviderConfig | undefined
  list(): ProviderConfig[]
  register(config: ProviderConfig, opts?: { apiKey?: string; encryptedKey?: string; source?: 'options' | 'db' }): void
  unregister(id: string): void
  /** All known models: configured + catalog + ai-models overrides. */
  models(): ModelInfo[]
  /** Model info for `providerId:modelId`; unknown ids get catalog/heuristic defaults if the provider exists. */
  model(ref: string): ModelInfo | undefined
  setModelOverrides(rows: ModelOverride[]): void
  /** (Re)load ai-providers and ai-models rows. DB providers win over code ones with the same id. */
  loadFromPayload(payload: Payload): Promise<void>
  /** The mock provider when options.mockProvider is set. */
  mock?: AIProvider
}

export const MOCK_MODELS = (providerId: string): ModelInfo[] => [
  { ref: `${providerId}:mock-chat`, providerId, modelId: 'mock-chat', capabilities: ['chat', 'streaming', 'tools', 'structuredOutput', 'vision', 'promptCaching', 'batch'], enabled: true },
  // 1536 = the committed vector migration's width, so mock mode can share a pgvector database with real models.
  { ref: `${providerId}:mock-embed`, providerId, modelId: 'mock-embed', capabilities: ['embeddings'], embedDims: 1536, enabled: true },
  { ref: `${providerId}:mock-image`, providerId, modelId: 'mock-image', capabilities: ['imageGeneration'], enabled: true },
]

export const splitRef = (ref: string): { providerId: string; modelId: string } => {
  const i = ref.indexOf(':')
  if (i <= 0) throw new AIError('bad_request', `Invalid model ref "${ref}" (expected providerId:modelId)`)
  return { providerId: ref.slice(0, i), modelId: ref.slice(i + 1) }
}

const relId = (v: unknown): string | number | undefined =>
  v == null ? undefined : typeof v === 'object' ? ((v as { id?: string | number }).id ?? undefined) : (v as string | number)

const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : (x as { value?: string })?.value)).filter((x): x is string => !!x) : []

const numOr = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

export const createProviderRegistry = (deps: ProviderRegistryDeps = {}): ProviderRegistry => {
  const entries = new Map<string, { config: ProviderConfig; apiKey?: string; encryptedKey?: string; source: 'options' | 'db'; instance?: AIProvider }>()
  let overrides: ModelOverride[] = []
  let modelCache: Map<string, ModelInfo> | undefined
  const mock = deps.mockProvider

  const buildModels = () => {
    const map = new Map<string, ModelInfo>()
    const put = (providerId: string, m: ModelInfoInput) => {
      const ref = `${providerId}:${m.modelId}`
      const prev = map.get(ref)
      map.set(ref, { ...prev, ...m, ref, providerId, enabled: m.enabled ?? prev?.enabled ?? true })
    }
    if (mock) for (const m of MOCK_MODELS(mock.id)) map.set(m.ref, m)
    for (const { config } of entries.values()) {
      if (deps.includeCatalog !== false) for (const m of BUILTIN_CATALOG[config.type] ?? []) put(config.id, m)
      for (const m of config.models ?? []) put(config.id, { ...lookupCatalog(config.type, m.modelId), ...m })
    }
    for (const o of overrides) {
      const type = entries.get(o.providerId)?.config.type ?? ('openai-compatible' as ProviderType)
      const ref = `${o.providerId}:${o.modelId}`
      const base = map.get(ref) ?? { ...defaultModelInfo(type, o.modelId), ref, providerId: o.providerId, enabled: true }
      const clean = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
      map.set(ref, { ...base, ...clean, ref, providerId: o.providerId, enabled: o.enabled ?? base.enabled } as ModelInfo)
    }
    return map
  }

  const reg: ProviderRegistry = {
    mock,
    get(id) {
      if (mock && id === mock.id) return mock
      const e = entries.get(id)
      if (!e) return undefined
      if (!e.instance) {
        let apiKey = e.apiKey
        if (!apiKey && e.encryptedKey) {
          if (!deps.crypto) throw new AIError('unavailable', `[ai-suite] Provider "${id}" has a stored key but no crypto service was given`)
          apiKey = deps.crypto.decrypt(e.encryptedKey)
        }
        e.instance = buildProvider(e.config, { apiKey, env: deps.env, fetch: deps.fetch })
      }
      return e.instance
    },
    require(id) {
      const p = reg.get(id)
      if (!p) throw new AIError('not_found', `Unknown AI provider "${id}"`)
      return p
    },
    config: (id) => entries.get(id)?.config,
    list: () => [...entries.values()].map((e) => e.config),
    register(config, opts = {}) {
      if (!config.id || config.id.includes(':')) throw new AIError('bad_request', `Invalid provider id "${config.id}"`)
      entries.set(config.id, { config, apiKey: opts.apiKey, encryptedKey: opts.encryptedKey, source: opts.source ?? 'options' })
      modelCache = undefined
    },
    unregister(id) {
      entries.delete(id)
      modelCache = undefined
    },
    models: () => [...(modelCache ??= buildModels()).values()],
    model(ref) {
      const cache = (modelCache ??= buildModels())
      const hit = cache.get(ref)
      if (hit) return hit
      const { providerId, modelId } = splitRef(ref)
      const e = entries.get(providerId)
      if (!e) {
        if (mock && providerId === mock.id) return { ref, providerId, modelId, capabilities: ['chat', 'streaming', 'tools', 'structuredOutput'], enabled: true }
        return undefined
      }
      const info: ModelInfo = { ...defaultModelInfo(e.config.type, modelId), ref, providerId, enabled: true }
      cache.set(ref, info)
      return info
    },
    setModelOverrides(rows) {
      overrides = rows
      modelCache = undefined
    },
    async loadFromPayload(payload) {
      const p = loose(payload)
      const ctx = { aiInternal: true }
      const [providers, models] = await Promise.all([
        p.find({ collection: SLUGS.providers, pagination: false, depth: 0, overrideAccess: true, context: ctx }),
        p.find({ collection: SLUGS.models, pagination: false, depth: 0, overrideAccess: true, context: ctx }),
      ])
      for (const [id, e] of entries) if (e.source === 'db') entries.delete(id)
      for (const row of providers.docs) {
        if (row.enabled === false || typeof row.providerId !== 'string' || typeof row.type !== 'string') continue
        const headers: Record<string, string> = {}
        for (const h of (row.headers as { name?: string; value?: string }[] | undefined) ?? []) if (h?.name) headers[h.name] = h.value ?? ''
        const config: ProviderConfig = {
          id: row.providerId,
          type: row.type as ProviderType,
          apiKeyEnv: (row.keyEnv as string) || undefined,
          baseURL: (row.baseURL as string) || undefined,
          headers: Object.keys(headers).length ? headers : undefined,
          options: (row.options as Record<string, unknown>) ?? undefined,
          tenant: deps.tenantField ? relId(row[deps.tenantField]) : undefined,
        }
        if (config.type === 'custom') {
          const codeAdapter = entries.get(config.id)?.config.adapter
          if (!codeAdapter) continue
          config.adapter = codeAdapter
        }
        entries.set(config.id, { config, encryptedKey: (row.encryptedKey as string) || undefined, source: 'db' })
      }
      overrides = models.docs
        .filter((r) => typeof r.providerId === 'string' && typeof r.modelId === 'string')
        .map((r) => ({
          providerId: r.providerId as string,
          modelId: r.modelId as string,
          capabilities: strList(r.capabilities).length ? (strList(r.capabilities) as Capability[]) : undefined,
          contextWindow: numOr(r.contextWindow),
          maxOutput: numOr(r.maxOutput),
          embedDims: numOr(r.embedDims),
          inputPriceMicrosPerM: numOr(r.inputPriceMicrosPerM),
          outputPriceMicrosPerM: numOr(r.outputPriceMicrosPerM),
          cachedInputPriceMicrosPerM: numOr(r.cachedInputPriceMicrosPerM),
          imagePriceMicros: numOr(r.imagePriceMicros),
          languagesVerified: strList(r.languagesVerified).length ? strList(r.languagesVerified) : undefined,
          enabled: r.enabled === false ? false : true,
        }))
      modelCache = undefined
    },
  }
  for (const c of deps.providers ?? []) reg.register(c)
  return reg
}
