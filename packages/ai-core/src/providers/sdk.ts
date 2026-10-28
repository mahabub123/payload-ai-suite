import { embedMany, generateImage, generateText, jsonSchema, Output, streamText } from 'ai'
import type { EmbeddingModel, ImageModel, JSONSchema7, LanguageModel, SystemModelMessage } from 'ai'
import type { AIProvider, ChatRequest, ChatResult, ProviderType, StreamEvent, ToolCall, Usage } from '../contracts'
import { AIError } from '../contracts'
import { mapProviderError } from './errors'
import { fromFinishReason, fromUsage, parseJsonLoose, toModelMessages, toToolChoice, toToolSet } from './normalize'

/** The part of an AI SDK provider instance we use. */
export interface SdkModels {
  languageModel(modelId: string): LanguageModel
  embeddingModel?(modelId: string): EmbeddingModel
  imageModel?(modelId: string): ImageModel
}

export interface SdkProviderSpec {
  id: string
  type: ProviderType
  /** Lazily builds the SDK instance (may dynamic-import an optional package). */
  load: () => Promise<SdkModels> | SdkModels
  /** Extract gateway-reported cost (micro-USD) from providerMetadata. */
  reportedCost?: (providerMetadata: unknown) => number | undefined
  listModels?: () => Promise<string[]>
  /** Provider key used for providerOptions (prompt caching etc). */
  optionsKey?: string
}

type ToolCallLike = { toolCallId: string; toolName: string; input: unknown }

const addCost = (a: number | undefined, b: number | undefined) => (a == null && b == null ? undefined : (a ?? 0) + (b ?? 0))

/** Build an AIProvider on top of the Vercel AI SDK. Retries are disabled here; the router owns them. */
export const createSdkProvider = (spec: SdkProviderSpec): AIProvider => {
  let sdk: Promise<SdkModels> | undefined
  const models = () => (sdk ??= Promise.resolve().then(spec.load)).catch((e) => {
    sdk = undefined
    throw e
  })

  const system = (req: ChatRequest, hoisted: string[]): string | SystemModelMessage | undefined => {
    const text = [req.system, ...hoisted].filter(Boolean).join('\n\n')
    if (!text) return undefined
    if (req.cacheSystem && spec.type === 'anthropic') {
      return { role: 'system', content: text, providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } } }
    }
    return text
  }

  const common = async (req: ChatRequest) => {
    const m = await models()
    const { system: hoisted, messages } = toModelMessages(req.messages)
    const output = req.responseSchema
      ? Output.object({ schema: jsonSchema(req.responseSchema as JSONSchema7), name: req.responseSchemaName })
      : undefined
    return {
      model: m.languageModel(req.model),
      system: system(req, hoisted),
      messages,
      tools: toToolSet(req.tools),
      toolChoice: toToolChoice(req.toolChoice) as never,
      temperature: req.temperature,
      maxOutputTokens: req.maxOutputTokens,
      abortSignal: req.signal,
      maxRetries: 0,
      providerOptions: req.providerOptions as never,
      output: output as never,
    }
  }

  const toolCalls = (calls: ToolCallLike[]): ToolCall[] => calls.map((c) => ({ toolCallId: c.toolCallId, toolName: c.toolName, input: c.input }))

  const provider: AIProvider = {
    id: spec.id,
    type: spec.type,

    async chat(req) {
      try {
        const r = await generateText(await common(req))
        let cost: number | undefined
        for (const s of r.steps ?? []) cost = addCost(cost, spec.reportedCost?.(s.providerMetadata))
        if (cost == null) cost = spec.reportedCost?.(r.providerMetadata)
        const result: ChatResult = {
          text: r.text,
          toolCalls: toolCalls(r.toolCalls as ToolCallLike[]),
          finishReason: fromFinishReason(r.finishReason),
          usage: fromUsage(r.totalUsage ?? r.usage, cost),
        }
        if (req.responseSchema) {
          try {
            result.object = r.output
          } catch {
            try {
              result.object = parseJsonLoose(r.text)
            } catch {
              /* left undefined; the router validates and reports */
            }
          }
        }
        return result
      } catch (e) {
        throw mapProviderError(e, spec.id)
      }
    },

    async *stream(req): AsyncIterable<StreamEvent> {
      let result: ReturnType<typeof streamText>
      try {
        result = streamText({ ...(await common(req)), onError: () => undefined })
      } catch (e) {
        throw mapProviderError(e, spec.id)
      }
      let cost: number | undefined
      try {
        for await (const part of result.fullStream) {
          switch (part.type) {
            case 'text-delta':
              if (part.text) yield { type: 'text-delta', text: part.text }
              break
            case 'tool-call':
              yield { type: 'tool-call', toolCall: { toolCallId: part.toolCallId, toolName: part.toolName, input: part.input } }
              break
            case 'finish-step':
              cost = addCost(cost, spec.reportedCost?.(part.providerMetadata))
              break
            case 'finish':
              yield { type: 'finish', finishReason: fromFinishReason(part.finishReason), usage: fromUsage(part.totalUsage, cost) }
              break
            case 'error':
              throw part.error
            case 'abort':
              throw new AIError('timeout', `[${spec.id}] stream aborted`, { providerId: spec.id })
          }
        }
      } catch (e) {
        throw mapProviderError(e, spec.id)
      }
    },

    async embed(req) {
      const m = await models()
      if (!m.embeddingModel) throw new AIError('bad_request', `Provider ${spec.id} does not support embeddings`, { providerId: spec.id })
      try {
        const r = await embedMany({ model: m.embeddingModel(req.model), values: req.values, dimensions: req.dimensions, maxRetries: 0, abortSignal: req.signal })
        const usage: Usage = { inputTokens: r.usage?.tokens ?? 0, outputTokens: 0 }
        return { embeddings: r.embeddings, usage }
      } catch (e) {
        throw mapProviderError(e, spec.id)
      }
    },

    async image(req) {
      const m = await models()
      if (!m.imageModel) throw new AIError('bad_request', `Provider ${spec.id} does not support image generation`, { providerId: spec.id })
      try {
        let prompt: Parameters<typeof generateImage>[0]['prompt'] = req.prompt
        if (req.image?.data || req.image?.url) {
          const data = req.image.data
            ? req.image.data.replace(/^data:[^;]+;base64,/, '')
            : new Uint8Array(await (await fetch(req.image.url!, { signal: req.signal })).arrayBuffer())
          prompt = { images: [data], text: req.prompt }
        }
        const r = await generateImage({ model: m.imageModel(req.model), prompt, n: req.n, size: req.size, maxRetries: 0, abortSignal: req.signal })
        const usage: Usage = { inputTokens: 0, outputTokens: 0 }
        const cost = spec.reportedCost?.(r.providerMetadata)
        if (cost != null) usage.reportedCostMicros = cost
        return { images: r.images.map((i) => ({ base64: i.base64, mediaType: i.mediaType })), usage }
      } catch (e) {
        throw mapProviderError(e, spec.id)
      }
    },
  }
  if (spec.listModels) provider.listModels = spec.listModels
  return provider
}
