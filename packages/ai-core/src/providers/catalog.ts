import type { Capability, ModelInfoInput, ProviderType } from '../contracts'

/**
 * Built-in model catalog: sensible capability defaults and list prices (micro-USD per million tokens)
 * for well-known model ids. Prices change; override them via ProviderConfig.models or the ai-models
 * collection. Gateways (OpenRouter) report real cost, which always wins.
 */
const CHAT: Capability[] = ['chat', 'streaming', 'tools', 'structuredOutput']
const CHAT_V: Capability[] = [...CHAT, 'vision']
const M = (modelId: string, capabilities: Capability[], p: Partial<ModelInfoInput> = {}): ModelInfoInput => ({ modelId, capabilities, ...p })
const price = (i: number, o: number, c?: number) => ({ inputPriceMicrosPerM: i, outputPriceMicrosPerM: o, ...(c != null ? { cachedInputPriceMicrosPerM: c } : {}) })

const openai: ModelInfoInput[] = [
  M('gpt-5.5', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 400_000, maxOutput: 128_000, ...price(5_000_000, 30_000_000) }),
  M('gpt-5.4', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 400_000, maxOutput: 128_000, ...price(2_500_000, 15_000_000) }),
  M('gpt-5.4-mini', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 400_000, maxOutput: 128_000, ...price(750_000, 4_500_000) }),
  M('gpt-5.4-nano', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 400_000, maxOutput: 128_000, ...price(200_000, 1_250_000) }),
  M('gpt-5.2', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 400_000, maxOutput: 128_000, ...price(1_750_000, 14_000_000) }),
  M('gpt-5.1', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 400_000, maxOutput: 128_000, ...price(1_250_000, 10_000_000) }),
  M('gpt-5-nano', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 400_000, maxOutput: 128_000, ...price(50_000, 400_000, 5_000) }),
  M('gpt-5-mini', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 400_000, maxOutput: 128_000, ...price(250_000, 2_000_000, 25_000) }),
  M('gpt-5', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 400_000, maxOutput: 128_000, ...price(1_250_000, 10_000_000, 125_000) }),
  M('gpt-4.1-nano', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 1_047_576, maxOutput: 32_768, ...price(100_000, 400_000, 25_000) }),
  M('gpt-4.1-mini', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 1_047_576, maxOutput: 32_768, ...price(400_000, 1_600_000, 100_000) }),
  M('gpt-4.1', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 1_047_576, maxOutput: 32_768, ...price(2_000_000, 8_000_000, 500_000) }),
  M('gpt-4o-mini', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 128_000, maxOutput: 16_384, ...price(150_000, 600_000, 75_000) }),
  M('gpt-4o', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 128_000, maxOutput: 16_384, ...price(2_500_000, 10_000_000, 1_250_000) }),
  M('o4-mini', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 200_000, maxOutput: 100_000, ...price(1_100_000, 4_400_000, 275_000) }),
  M('o3', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 200_000, maxOutput: 100_000, ...price(2_000_000, 8_000_000, 500_000) }),
  M('text-embedding-3-small', ['embeddings', 'batch'], { embedDims: 1536, ...price(20_000, 0) }),
  M('text-embedding-3-large', ['embeddings', 'batch'], { embedDims: 3072, ...price(130_000, 0) }),
  M('gpt-image-1', ['imageGeneration'], { imagePriceMicros: 42_000 }),
  M('dall-e-3', ['imageGeneration'], { imagePriceMicros: 40_000 }),
]

const anthropic: ModelInfoInput[] = [
  M('claude-haiku-5-5', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 200_000, maxOutput: 64_000, ...price(100_000, 500_000) }),
  M('claude-sonnet-5-5', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 200_000, maxOutput: 64_000, ...price(2_000_000, 10_000_000) }),
  M('claude-opus-5-5', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 200_000, maxOutput: 64_000, ...price(4_000_000, 20_000_000) }),
  M('claude-fable-5-1', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 200_000, maxOutput: 64_000, ...price(10_000_000, 50_000_000) }),
  M('claude-sonnet-5', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 200_000, maxOutput: 64_000, ...price(2_000_000, 10_000_000) }),
  M('claude-opus-5', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 200_000, maxOutput: 64_000, ...price(5_000_000, 25_000_000) }),
  M('claude-fable-5', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 200_000, maxOutput: 64_000, ...price(10_000_000, 50_000_000) }),
  M('claude-sonnet-4-6', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 200_000, maxOutput: 64_000, ...price(3_000_000, 15_000_000, 300_000) }),
  M('claude-sonnet-4-5', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 200_000, maxOutput: 64_000, ...price(3_000_000, 15_000_000, 300_000) }),
  M('claude-opus-4-8', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 200_000, maxOutput: 64_000, ...price(5_000_000, 25_000_000, 500_000) }),
  M('claude-opus-4-7', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 200_000, maxOutput: 64_000, ...price(5_000_000, 25_000_000, 500_000) }),
  M('claude-opus-4-6', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 200_000, maxOutput: 64_000, ...price(5_000_000, 25_000_000, 500_000) }),
  M('claude-3-5-haiku', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 200_000, maxOutput: 8_192, ...price(800_000, 4_000_000, 80_000) }),
  M('claude-haiku-4-5', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 200_000, maxOutput: 64_000, ...price(1_000_000, 5_000_000, 100_000) }),
  M('claude-sonnet-4', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 200_000, maxOutput: 64_000, ...price(3_000_000, 15_000_000, 300_000) }),
  M('claude-3-7-sonnet', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 200_000, maxOutput: 64_000, ...price(3_000_000, 15_000_000, 300_000) }),
  M('claude-opus-4-5', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 200_000, maxOutput: 64_000, ...price(5_000_000, 25_000_000, 500_000) }),
  M('claude-opus-4', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 200_000, maxOutput: 32_000, ...price(15_000_000, 75_000_000, 1_500_000) }),
]

const google: ModelInfoInput[] = [
  M('gemini-3.5-flash', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 1_048_576, maxOutput: 65_536, ...price(1_500_000, 9_000_000) }),
  M('gemini-3.5-flash-lite', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 1_048_576, maxOutput: 65_536, ...price(300_000, 2_500_000) }),
  M('gemini-3.1-pro', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 1_048_576, maxOutput: 65_536, ...price(2_000_000, 12_000_000) }),
  M('gemini-3.1-flash-lite', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 1_048_576, maxOutput: 65_536, ...price(250_000, 1_500_000) }),
  M('gemini-3-flash', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 1_048_576, maxOutput: 65_536, ...price(500_000, 3_000_000) }),
  M('gemini-2.5-flash-lite', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 1_048_576, maxOutput: 65_536, ...price(100_000, 400_000, 25_000) }),
  M('gemini-2.5-flash', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 1_048_576, maxOutput: 65_536, ...price(300_000, 2_500_000, 75_000) }),
  M('gemini-2.5-pro', [...CHAT_V, 'promptCaching', 'batch'], { contextWindow: 1_048_576, maxOutput: 65_536, ...price(1_250_000, 10_000_000, 310_000) }),
  M('gemini-2.0-flash', CHAT_V, { contextWindow: 1_048_576, maxOutput: 8_192, ...price(100_000, 400_000, 25_000) }),
  M('gemini-embedding-001', ['embeddings', 'batch'], { embedDims: 3072, ...price(150_000, 0) }),
  M('text-embedding-004', ['embeddings'], { embedDims: 768, ...price(0, 0) }),
  M('imagen-4', ['imageGeneration'], { imagePriceMicros: 40_000 }),
]

const mistral: ModelInfoInput[] = [
  M('mistral-small', CHAT_V, { contextWindow: 128_000, ...price(100_000, 300_000) }),
  M('mistral-medium', CHAT_V, { contextWindow: 128_000, ...price(400_000, 2_000_000) }),
  M('mistral-large', CHAT, { contextWindow: 128_000, ...price(2_000_000, 6_000_000) }),
  M('mistral-embed', ['embeddings'], { embedDims: 1024, ...price(100_000, 0) }),
]

const groq: ModelInfoInput[] = [
  M('llama-3.1-8b-instant', CHAT, { contextWindow: 131_072, ...price(50_000, 80_000) }),
  M('llama-3.3-70b-versatile', CHAT, { contextWindow: 131_072, ...price(590_000, 790_000) }),
  M('openai/gpt-oss-20b', CHAT, { contextWindow: 131_072, ...price(100_000, 500_000) }),
  M('openai/gpt-oss-120b', CHAT, { contextWindow: 131_072, ...price(150_000, 750_000) }),
]

const xai: ModelInfoInput[] = [
  M('grok-3-mini', CHAT, { contextWindow: 131_072, ...price(300_000, 500_000) }),
  M('grok-4', CHAT_V, { contextWindow: 256_000, ...price(3_000_000, 15_000_000) }),
]

const deepseek: ModelInfoInput[] = [
  M('deepseek-chat', [...CHAT, 'promptCaching'], { contextWindow: 128_000, ...price(270_000, 1_100_000, 70_000) }),
  M('deepseek-reasoner', ['chat', 'streaming', 'promptCaching'], { contextWindow: 128_000, ...price(550_000, 2_190_000, 140_000) }),
]

const cohere: ModelInfoInput[] = [
  M('command-r-plus', CHAT, { contextWindow: 128_000, ...price(2_500_000, 10_000_000) }),
  M('command-r', CHAT, { contextWindow: 128_000, ...price(150_000, 600_000) }),
  M('command-a', CHAT, { contextWindow: 256_000, ...price(2_500_000, 10_000_000) }),
  M('embed-multilingual-v3.0', ['embeddings'], { embedDims: 1024, ...price(100_000, 0) }),
  M('embed-english-v3.0', ['embeddings'], { embedDims: 1024, ...price(100_000, 0) }),
]

export const BUILTIN_CATALOG: Partial<Record<ProviderType, ModelInfoInput[]>> = {
  openai,
  azure: openai,
  anthropic,
  bedrock: anthropic,
  google,
  mistral,
  groq,
  xai,
  deepseek,
  cohere,
}

const ALL = Object.values(BUILTIN_CATALOG).flat()

/** Version dots and dashes are interchangeable across vendors and gateways: claude-haiku-5.5 = claude-haiku-5-5. */
const norm = (id: string) => id.toLowerCase().replace(/(\d)\.(\d)/g, '$1-$2')

/** Longest catalog id that the model id starts with (handles dated snapshots like gpt-4o-2024-08-06). */
const bestMatch = (list: ModelInfoInput[], modelId: string) => {
  const id = norm(modelId)
  let best: ModelInfoInput | undefined
  for (const m of list) {
    const c = norm(m.modelId)
    if ((id === c || id.startsWith(`${c}-`) || id.startsWith(`${c}@`) || id.startsWith(`${c}:`)) && (!best || m.modelId.length > best.modelId.length)) best = m
  }
  return best
}

/** Heuristic capabilities for a model id no catalog knows. */
export const inferCapabilities = (modelId: string): Capability[] => {
  const id = modelId.toLowerCase()
  if (/embed/.test(id)) return ['embeddings']
  if (/dall-e|gpt-image|imagen|flux|stable-diffusion|sdxl|image-gen/.test(id)) return ['imageGeneration']
  return CHAT
}

/**
 * Catalog defaults for a model. Gateway ids (`openai/gpt-4o-mini`, `anthropic.claude-...`) are matched by
 * their vendor-less suffix against the whole catalog.
 */
export const lookupCatalog = (type: ProviderType, modelId: string): ModelInfoInput | undefined => {
  const own = BUILTIN_CATALOG[type]
  const direct = own ? bestMatch(own, modelId) : undefined
  if (direct) return { ...direct, modelId }
  const bare = modelId.replace(/^[a-z0-9-]+[/.]/i, '').replace(/^(us|eu|apac)\./, '')
  const any = bestMatch(ALL, modelId) ?? bestMatch(ALL, bare)
  return any ? { ...any, modelId } : undefined
}

/** Catalog entry or a heuristic default for an arbitrary model id. */
export const defaultModelInfo = (type: ProviderType, modelId: string): ModelInfoInput =>
  lookupCatalog(type, modelId) ?? { modelId, capabilities: inferCapabilities(modelId) }
