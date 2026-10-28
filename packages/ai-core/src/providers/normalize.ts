import { jsonSchema, tool } from 'ai'
import type { JSONSchema7, LanguageModelUsage, ModelMessage, ToolSet } from 'ai'
import type { ChatMessage, FinishReason, MessagePart, ToolSpec, Usage } from '../contracts'

type Json = null | string | number | boolean | Json[] | { [k: string]: Json }

const toJson = (v: unknown): Json => (v === undefined ? null : (JSON.parse(JSON.stringify(v)) as Json))

/** AI SDK v7 file part (the old `image` part is deprecated); mediaType 'image' lets the provider detect the subtype. */
const imagePart = (p: Extract<MessagePart, { type: 'image' }>) => {
  const mediaType = p.mediaType ?? 'image'
  if (p.url) return { type: 'file' as const, data: { type: 'url' as const, url: new URL(p.url) }, mediaType }
  const data = (p.data ?? '').replace(/^data:[^;]+;base64,/, '')
  return { type: 'file' as const, data: { type: 'data' as const, data }, mediaType }
}

const toolOutput = (p: Extract<MessagePart, { type: 'tool-result' }>) => {
  if (p.isError) return typeof p.output === 'string' ? { type: 'error-text' as const, value: p.output } : { type: 'error-json' as const, value: toJson(p.output) }
  return typeof p.output === 'string' ? { type: 'text' as const, value: p.output } : { type: 'json' as const, value: toJson(p.output) }
}

/**
 * Normalized messages -> AI SDK ModelMessages. System messages are hoisted out (the SDK takes them as
 * instructions); tool-call parts outside assistant turns become plain text.
 */
export const toModelMessages = (messages: ChatMessage[]): { system: string[]; messages: ModelMessage[] } => {
  const system: string[] = []
  const out: ModelMessage[] = []
  for (const m of messages) {
    const parts: MessagePart[] = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content
    const asText = (p: MessagePart) =>
      p.type === 'text' ? p.text : p.type === 'tool-call' ? `[tool call ${p.toolName}] ${JSON.stringify(p.input)}` : p.type === 'tool-result' ? `[tool result ${p.toolName}] ${JSON.stringify(p.output)}` : ''
    switch (m.role) {
      case 'system':
        system.push(parts.map(asText).join('\n'))
        break
      case 'user':
        out.push({
          role: 'user',
          content: typeof m.content === 'string' ? m.content : parts.map((p) => (p.type === 'image' ? imagePart(p) : { type: 'text' as const, text: asText(p) })),
        })
        break
      case 'assistant':
        out.push({
          role: 'assistant',
          content:
            typeof m.content === 'string'
              ? m.content
              : parts.map((p) =>
                  p.type === 'tool-call'
                    ? { type: 'tool-call' as const, toolCallId: p.toolCallId, toolName: p.toolName, input: p.input }
                    : { type: 'text' as const, text: asText(p) },
                ),
        })
        break
      case 'tool': {
        const results = parts.filter((p): p is Extract<MessagePart, { type: 'tool-result' }> => p.type === 'tool-result')
        if (results.length)
          out.push({
            role: 'tool',
            content: results.map((p) => ({ type: 'tool-result' as const, toolCallId: p.toolCallId, toolName: p.toolName, output: toolOutput(p) })),
          })
        break
      }
    }
  }
  return { system, messages: out }
}

/** ToolSpecs -> AI SDK tools without execute (the agent runtime executes them, never the SDK). */
export const toToolSet = (tools: ToolSpec[] | undefined): ToolSet | undefined => {
  if (!tools?.length) return undefined
  const set: ToolSet = {}
  for (const t of tools) {
    const schema = (t.inputSchema && Object.keys(t.inputSchema).length ? t.inputSchema : { type: 'object', properties: {} }) as JSONSchema7
    set[t.name] = tool({ description: t.description, inputSchema: jsonSchema(schema) })
  }
  return set
}

export const toToolChoice = (c: 'auto' | 'none' | 'required' | { toolName: string } | undefined) =>
  c === undefined ? undefined : typeof c === 'string' ? c : { type: 'tool' as const, toolName: c.toolName }

export const fromUsage = (u: Partial<LanguageModelUsage> | undefined, reportedCostMicros?: number): Usage => {
  const usage: Usage = { inputTokens: u?.inputTokens ?? 0, outputTokens: u?.outputTokens ?? 0 }
  const cached = u?.inputTokenDetails?.cacheReadTokens
  if (cached) usage.cachedInputTokens = cached
  if (reportedCostMicros != null) usage.reportedCostMicros = reportedCostMicros
  return usage
}

export const fromFinishReason = (r: string | undefined): FinishReason =>
  r === 'stop' || r === 'length' || r === 'tool-calls' || r === 'content-filter' || r === 'error' ? r : 'other'

/** Lenient JSON extraction for structured output from models without native JSON mode. */
export const parseJsonLoose = (text: string): unknown => {
  const t = text.trim()
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(t)
  const body = fenced ? fenced[1] : t
  try {
    return JSON.parse(body)
  } catch {
    const start = body.search(/[[{]/)
    const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'))
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1))
    throw new Error('No JSON found in model output')
  }
}
