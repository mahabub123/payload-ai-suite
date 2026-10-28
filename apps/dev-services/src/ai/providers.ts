import type { ProviderConfig, RoutesOption, TaskClass } from '@payload-ai-suite/ai-suite'

const env = (k: string) => process.env[k]?.trim() || undefined

/**
 * Providers are enabled by the presence of their key env var (keys themselves never enter config).
 * Order in each route = preference; the router falls back down the list.
 */
export const providersFromEnv = (): { providers: ProviderConfig[]; routes: RoutesOption } => {
  const providers: ProviderConfig[] = []
  const routes: Record<TaskClass, string[]> = { fast: [], chat: [], write: [], reason: [], embed: [], image: [] }

  if (env('ANTHROPIC_API_KEY')) {
    providers.push({ id: 'anthropic', type: 'anthropic', apiKeyEnv: 'ANTHROPIC_API_KEY' })
    routes.fast.push('anthropic:claude-haiku-5-5')
    routes.chat.push('anthropic:claude-sonnet-5-5')
    routes.write.push('anthropic:claude-sonnet-5-5')
    routes.reason.push('anthropic:claude-opus-5-5')
  }
  if (env('OPENAI_API_KEY')) {
    providers.push({ id: 'openai', type: 'openai', apiKeyEnv: 'OPENAI_API_KEY' })
    routes.fast.push('openai:gpt-5-mini')
    routes.chat.push('openai:gpt-5-mini')
    routes.write.push('openai:gpt-5')
    routes.reason.push('openai:gpt-5')
    routes.embed.push('openai:text-embedding-3-small')
    routes.image.push('openai:gpt-image-1')
  }
  if (env('OPENROUTER_API_KEY')) {
    providers.push({ id: 'openrouter', type: 'openrouter', apiKeyEnv: 'OPENROUTER_API_KEY' })
    routes.fast.push('openrouter:meta-llama/llama-3.3-70b-instruct')
    routes.chat.push('openrouter:meta-llama/llama-3.3-70b-instruct')
    routes.write.push('openrouter:meta-llama/llama-3.3-70b-instruct')
  }
  const ollama = env('OLLAMA_BASE_URL')
  if (ollama) {
    const chat = env('OLLAMA_CHAT_MODEL') ?? 'llama3.1:8b'
    const embed = env('OLLAMA_EMBED_MODEL') ?? 'nomic-embed-text'
    providers.push({
      id: 'ollama',
      type: 'openai-compatible',
      baseURL: ollama,
      models: [
        { modelId: chat, capabilities: ['chat', 'streaming', 'tools'], inputPriceMicrosPerM: 0, outputPriceMicrosPerM: 0 },
        { modelId: embed, capabilities: ['embeddings'], embedDims: 768, inputPriceMicrosPerM: 0 },
      ],
    })
    for (const t of ['fast', 'chat', 'write', 'reason'] as const) routes[t].push(`ollama:${chat}`)
    routes.embed.push(`ollama:${embed}`)
  }

  // Explicit overrides: AI_ROUTE_CHAT=anthropic:claude-sonnet-5-5,openai:gpt-5-mini
  for (const t of Object.keys(routes) as TaskClass[]) {
    const o = env(`AI_ROUTE_${t.toUpperCase()}`)
    if (o) routes[t] = o.split(',').map((s) => s.trim()).filter(Boolean)
  }
  const nonEmpty = Object.fromEntries(Object.entries(routes).filter(([, v]) => v.length)) as RoutesOption
  return { providers, routes: nonEmpty }
}
