/**
 * Provider layer contracts (design doc §7.1).
 * Modules never import a vendor SDK; they ask the router for a task class.
 */

export type TaskClass = 'fast' | 'chat' | 'write' | 'reason' | 'embed' | 'image'

export const TASK_CLASSES: readonly TaskClass[] = ['fast', 'chat', 'write', 'reason', 'embed', 'image']

export type Capability =
  | 'chat'
  | 'streaming'
  | 'tools'
  | 'structuredOutput'
  | 'vision'
  | 'embeddings'
  | 'imageGeneration'
  | 'promptCaching'
  | 'batch'

/** Capabilities each task class requires from a model at minimum. */
export const TASK_REQUIREMENTS: Record<TaskClass, Capability[]> = {
  fast: ['chat'],
  chat: ['chat'],
  write: ['chat'],
  reason: ['chat'],
  embed: ['embeddings'],
  image: ['imageGeneration'],
}

export type NativeProviderType =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'azure'
  | 'bedrock'
  | 'mistral'
  | 'groq'
  | 'xai'
  | 'deepseek'
  | 'cohere'
  | 'openrouter'

export type ProviderType = NativeProviderType | 'openai-compatible' | 'custom'

export interface ProviderConfig {
  /** Unique id used in route refs: `${id}:${modelId}` */
  id: string
  type: ProviderType
  /** Name of the env var holding the API key (never the key itself). */
  apiKeyEnv?: string
  baseURL?: string
  headers?: Record<string, string>
  /** For type 'custom': a provider instance or factory. */
  adapter?: AIProvider | ((config: ProviderConfig) => AIProvider)
  /** Optional model registrations; otherwise defaults from the built-in catalog or ai-models. */
  models?: ModelInfoInput[]
  /** Vendor-specific options passed through to the SDK factory. */
  options?: Record<string, unknown>
  /** Tenant that owns this provider (BYOK); undefined = global. */
  tenant?: string | number
}

export interface ModelInfoInput {
  modelId: string
  capabilities: Capability[]
  contextWindow?: number
  maxOutput?: number
  embedDims?: number
  /** Price in micro-USD per million input tokens (e.g. $0.15/M = 150_000). */
  inputPriceMicrosPerM?: number
  outputPriceMicrosPerM?: number
  /** Price for cached (prompt-cache read) input tokens; defaults to 50% of the input price. */
  cachedInputPriceMicrosPerM?: number
  /** Micro-USD per generated image. */
  imagePriceMicros?: number
  /** Locales that passed the language eval, e.g. ['en', 'bn']. */
  languagesVerified?: string[]
  enabled?: boolean
}

export interface ModelInfo extends ModelInfoInput {
  /** `${providerId}:${modelId}` */
  ref: string
  providerId: string
  enabled: boolean
}

/* ---------- Normalized message format ---------- */

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'image'; url?: string; data?: string; mediaType?: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown; isError?: boolean }

export interface ChatMessage {
  role: ChatRole
  content: string | MessagePart[]
}

/** Provider-level tool spec (JSON schema). The agent runtime converts Zod tools to this. */
export interface ToolSpec {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface ChatRequest {
  /** Provider-local model id (router fills this in). */
  model: string
  system?: string
  messages: ChatMessage[]
  tools?: ToolSpec[]
  toolChoice?: 'auto' | 'none' | 'required' | { toolName: string }
  temperature?: number
  maxOutputTokens?: number
  /** JSON schema for structured output. */
  responseSchema?: Record<string, unknown>
  responseSchemaName?: string
  /** Mark the system prompt cacheable where supported. */
  cacheSystem?: boolean
  signal?: AbortSignal
  timeoutMs?: number
  providerOptions?: Record<string, unknown>
}

export interface Usage {
  inputTokens: number
  outputTokens: number
  cachedInputTokens?: number
  /** Cost reported by a gateway (e.g. OpenRouter), micro-USD. Takes precedence over price table. */
  reportedCostMicros?: number
}

export type FinishReason = 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'error' | 'other'

export interface ToolCall {
  toolCallId: string
  toolName: string
  input: unknown
}

export interface ChatResult {
  text: string
  toolCalls: ToolCall[]
  finishReason: FinishReason
  usage: Usage
  /** Parsed object when responseSchema was used. */
  object?: unknown
}

export type StreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; toolCall: ToolCall }
  | { type: 'finish'; finishReason: FinishReason; usage: Usage }
  | { type: 'error'; error: unknown }

export interface EmbedRequest {
  model: string
  values: string[]
  dimensions?: number
  signal?: AbortSignal
}

export interface EmbedResult {
  embeddings: number[][]
  usage: Usage
}

export interface ImageRequest {
  model: string
  prompt: string
  /** Source image for edits/variations (base64 or URL). */
  image?: { data?: string; url?: string; mediaType?: string }
  size?: `${number}x${number}`
  n?: number
  signal?: AbortSignal
}

export interface ImageResult {
  images: { base64: string; mediaType: string }[]
  usage: Usage
}

/** One interface for native, OpenAI-compatible and custom providers. */
export interface AIProvider {
  id: string
  type: ProviderType
  chat(req: ChatRequest): Promise<ChatResult>
  stream?(req: ChatRequest): AsyncIterable<StreamEvent>
  embed?(req: EmbedRequest): Promise<EmbedResult>
  image?(req: ImageRequest): Promise<ImageResult>
  listModels?(): Promise<string[]>
}

export interface RouteConfig {
  /** Ordered fallback list of `providerId:modelId`. */
  models: string[]
  timeoutMs?: number
  maxRetries?: number
}

/** routes option: task class -> ordered list (or full RouteConfig). */
export type RoutesOption = Partial<Record<TaskClass, string[] | RouteConfig>>
