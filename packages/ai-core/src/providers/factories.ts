import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogle } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import { createMistral } from '@ai-sdk/mistral'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { AIProvider, ProviderConfig, ProviderType } from '../contracts'
import { AIError } from '../contracts'
import { usdToMicros } from '../usage/cost'
import { createSdkProvider } from './sdk'
import type { SdkModels } from './sdk'

export interface BuildProviderDeps {
  /** Plain key (decrypted BYOK) — wins over env. */
  apiKey?: string
  env?: Record<string, string | undefined>
  fetch?: typeof fetch
}

/** Default env var per provider type when `apiKeyEnv` is not set. */
export const DEFAULT_KEY_ENV: Partial<Record<ProviderType, string>> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  azure: 'AZURE_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  groq: 'GROQ_API_KEY',
  xai: 'XAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  cohere: 'COHERE_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
}

/** OpenAI-compatible endpoints used when the vendor's own AI SDK package is not installed. */
const COMPAT_BASE: Partial<Record<ProviderType, string>> = {
  xai: 'https://api.x.ai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  cohere: 'https://api.cohere.ai/compatibility/v1',
}

const OPTIONAL_PACKAGES: Partial<Record<ProviderType, { pkg: string; factory: string }>> = {
  azure: { pkg: '@ai-sdk/azure', factory: 'createAzure' },
  bedrock: { pkg: '@ai-sdk/amazon-bedrock', factory: 'createAmazonBedrock' },
  xai: { pkg: '@ai-sdk/xai', factory: 'createXai' },
  deepseek: { pkg: '@ai-sdk/deepseek', factory: 'createDeepSeek' },
  cohere: { pkg: '@ai-sdk/cohere', factory: 'createCohere' },
}

const LIST_URL: Partial<Record<ProviderType, string>> = {
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ...COMPAT_BASE,
}

const importOptional = async (pkg: string): Promise<Record<string, unknown> | undefined> => {
  try {
    return (await import(/* @vite-ignore */ pkg)) as Record<string, unknown>
  } catch {
    return undefined
  }
}

/** Wrap a ProviderV4-style instance (callable or object) into the SdkModels shape. */
const models = (p: unknown, chat?: (id: string) => unknown): SdkModels => {
  const sdk = p as Record<string, (id: string) => unknown>
  return {
    languageModel: (id) => (chat ? chat(id) : sdk.languageModel(id)) as never,
    embeddingModel: typeof sdk.embeddingModel === 'function' ? (id) => sdk.embeddingModel(id) as never : typeof sdk.textEmbeddingModel === 'function' ? (id) => sdk.textEmbeddingModel(id) as never : undefined,
    imageModel: typeof sdk.imageModel === 'function' ? (id) => sdk.imageModel(id) as never : undefined,
  }
}

/** OpenRouter reports cost in USD at providerMetadata.openrouter.usage.cost. */
export const openRouterCost = (meta: unknown): number | undefined => {
  const cost = (meta as { openrouter?: { usage?: { cost?: number } } } | undefined)?.openrouter?.usage?.cost
  return typeof cost === 'number' && Number.isFinite(cost) ? usdToMicros(cost) : undefined
}

/** Build an AIProvider for a config. Throws AIError('bad_request') for unusable config; missing keys fail at call time. */
export const buildProvider = (config: ProviderConfig, deps: BuildProviderDeps = {}): AIProvider => {
  const env = deps.env ?? process.env
  const doFetch = deps.fetch ?? globalThis.fetch
  const { id, type } = config

  if (type === 'custom') {
    if (!config.adapter) throw new AIError('bad_request', `[ai-suite] Provider "${id}" has type 'custom' but no adapter`)
    const p = typeof config.adapter === 'function' ? config.adapter(config) : config.adapter
    return p
  }

  const keyEnv = config.apiKeyEnv ?? DEFAULT_KEY_ENV[type]
  const key = () => {
    const k = deps.apiKey ?? (keyEnv ? env[keyEnv] : undefined)
    if (!k && type !== 'openai-compatible' && type !== 'bedrock') {
      throw new AIError('auth', `[ai-suite] Provider "${id}": no API key. Set env ${keyEnv ?? '(apiKeyEnv)'} or store a tenant key.`, { providerId: id })
    }
    return k
  }
  const opts = (config.options ?? {}) as Record<string, unknown>
  const base = { apiKey: undefined as string | undefined, baseURL: config.baseURL, headers: config.headers, fetch: deps.fetch }

  const compat = (baseURL: string | undefined, extra: Record<string, unknown> = {}) => {
    if (!baseURL) throw new AIError('bad_request', `[ai-suite] Provider "${id}" (${type}) needs a baseURL`, { providerId: id })
    return models(
      createOpenAICompatible({
        name: id,
        baseURL,
        apiKey: key(),
        headers: config.headers,
        fetch: deps.fetch,
        includeUsage: true,
        queryParams: opts.queryParams as Record<string, string> | undefined,
        supportsStructuredOutputs: opts.supportsStructuredOutputs as boolean | undefined,
        ...extra,
      }),
    )
  }

  const listViaModels = (baseURL: string | undefined, authHeaders: () => Record<string, string>) =>
    baseURL
      ? async () => {
          const res = await doFetch(`${baseURL.replace(/\/$/, '')}/models`, { headers: { ...authHeaders(), ...config.headers } })
          if (!res.ok) throw new AIError(res.status === 401 || res.status === 403 ? 'auth' : 'unavailable', `[${id}] GET /models -> ${res.status}`, { providerId: id })
          const body = (await res.json()) as { data?: { id: string }[]; models?: { id?: string; name?: string }[] }
          return (body.data ?? body.models ?? []).map((m) => (m as { id?: string }).id ?? String((m as { name?: string }).name ?? '').replace(/^models\//, '')).filter(Boolean)
        }
      : undefined
  const bearer = () => {
    const k = key()
    return k ? { authorization: `Bearer ${k}` } : ({} as Record<string, string>)
  }

  let load: () => Promise<SdkModels> | SdkModels
  let listModels: (() => Promise<string[]>) | undefined
  switch (type) {
    case 'openai':
      load = () => models(createOpenAI({ ...base, apiKey: key(), organization: opts.organization as string | undefined, project: opts.project as string | undefined }))
      listModels = listViaModels(config.baseURL ?? LIST_URL.openai, bearer)
      break
    case 'anthropic':
      load = () => models(createAnthropic({ ...base, apiKey: key() }))
      listModels = listViaModels(config.baseURL ?? 'https://api.anthropic.com/v1', () => ({ 'x-api-key': key() ?? '', 'anthropic-version': '2023-06-01' }))
      break
    case 'google':
      load = () => models(createGoogle({ ...base, apiKey: key() }))
      listModels = async () => {
        const url = `${(config.baseURL ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '')}/models`
        const res = await doFetch(url, { headers: { 'x-goog-api-key': key() ?? '', ...config.headers } })
        if (!res.ok) throw new AIError(res.status === 401 || res.status === 403 ? 'auth' : 'unavailable', `[${id}] GET /models -> ${res.status}`, { providerId: id })
        const body = (await res.json()) as { models?: { name: string }[] }
        return (body.models ?? []).map((m) => m.name.replace(/^models\//, ''))
      }
      break
    case 'mistral':
      load = () => models(createMistral({ ...base, apiKey: key() }))
      listModels = listViaModels(config.baseURL ?? LIST_URL.mistral, bearer)
      break
    case 'groq':
      load = () => models(createGroq({ ...base, apiKey: key() }))
      listModels = listViaModels(config.baseURL ?? LIST_URL.groq, bearer)
      break
    case 'openrouter':
      load = () => {
        const sdk = createOpenRouter({
          apiKey: key(),
          baseURL: config.baseURL,
          headers: config.headers,
          compatibility: 'strict',
          appName: opts.appName as string | undefined,
          appUrl: opts.appUrl as string | undefined,
          fetch: deps.fetch,
        })
        return models(sdk, (mid) => sdk.chat(mid, { usage: { include: true } }))
      }
      listModels = listViaModels(config.baseURL ?? LIST_URL.openrouter, bearer)
      break
    case 'openai-compatible':
      load = () => compat(config.baseURL)
      listModels = listViaModels(config.baseURL, bearer)
      break
    case 'azure':
    case 'bedrock':
    case 'xai':
    case 'deepseek':
    case 'cohere': {
      const opt = OPTIONAL_PACKAGES[type]!
      load = async () => {
        const mod = await importOptional(opt.pkg)
        const factory = mod?.[opt.factory] as ((o: Record<string, unknown>) => unknown) | undefined
        if (factory) {
          const settings: Record<string, unknown> = { ...opts, headers: config.headers, fetch: deps.fetch }
          if (config.baseURL) settings.baseURL = config.baseURL
          if (type !== 'bedrock') settings.apiKey = key()
          else if (deps.apiKey) settings.apiKey = deps.apiKey
          return models(factory(settings))
        }
        if (type === 'azure') {
          // Azure OpenAI exposes an OpenAI-compatible surface; it authenticates with an `api-key` header.
          return compat(config.baseURL, { apiKey: undefined, headers: { 'api-key': key() ?? '', ...config.headers }, queryParams: { 'api-version': String(opts.apiVersion ?? '2024-10-21'), ...(opts.queryParams as Record<string, string> | undefined) } })
        }
        const fallbackBase = config.baseURL ?? COMPAT_BASE[type]
        if (!fallbackBase) {
          throw new AIError('bad_request', `[ai-suite] Provider "${id}" (${type}) needs the optional package ${opt.pkg} (not installed) or a baseURL to an OpenAI-compatible gateway.`, { providerId: id })
        }
        return compat(fallbackBase)
      }
      listModels = listViaModels(config.baseURL ?? LIST_URL[type], bearer)
      break
    }
    default:
      throw new AIError('bad_request', `[ai-suite] Unknown provider type "${type as string}" for provider "${id}"`)
  }

  return createSdkProvider({ id, type, load, listModels, reportedCost: type === 'openrouter' ? openRouterCost : undefined })
}
