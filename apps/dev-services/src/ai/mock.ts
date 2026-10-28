import type { AIProvider, ChatRequest, ChatResult, StreamEvent } from '@payload-ai-suite/ai-suite'
import { createMockProvider } from '@payload-ai-suite/ai-core/testing'

const textOf = (content: ChatRequest['messages'][number]['content']): string =>
  typeof content === 'string' ? content : content.map((p) => (p.type === 'text' ? p.text : '')).join(' ')

const ORDER_RE = /\b(order|অর্ডার)\b|#?\b\d{4,}\b/i
const RETURN_RE = /\b(return|exchange|ফেরত)\b/i
const POLICY_RE = /\b(policy|shipping|delivery|refund|warranty|ডেলিভারি|নীতি)\b/i
const CART_RE = /\b(add to cart|buy|কার্টে)\b/i

/**
 * Deterministic "model" for AI_MOCK=1: picks a plausible tool for the shopper's message,
 * then summarises tool output. Good enough to click through every flow offline.
 */
export const mockReply = (req: ChatRequest): Partial<ChatResult> => {
  const last = req.messages[req.messages.length - 1]
  if (req.responseSchema) return { text: '{}', object: {} }
  if (!last) return { text: 'Hello! How can I help?' }
  if (last.role === 'tool') return { text: 'Here is what I found. Prices and stock are shown on the cards above.' }

  const msg = textOf(last.content)
  const tools = new Set((req.tools ?? []).map((t) => t.name))
  const call = (toolName: string, input: unknown): Partial<ChatResult> => ({
    text: '',
    toolCalls: [{ toolCallId: `call_${Date.now().toString(36)}`, toolName, input }],
  })
  const orderNo = msg.match(/\b[A-Z]{2,3}-\d{3,}\b/)?.[0]
  if ((RETURN_RE.test(msg) || ORDER_RE.test(msg)) && orderNo && tools.has('getOrderStatus')) return call('getOrderStatus', { order: orderNo })
  if (ORDER_RE.test(msg) && tools.has('listMyOrders')) return call('listMyOrders', { limit: 5 })
  if (POLICY_RE.test(msg) && tools.has('getPolicy')) return call('getPolicy', { topic: msg.slice(0, 120) })
  if (POLICY_RE.test(msg) && tools.has('searchKnowledge')) return call('searchKnowledge', { query: msg.slice(0, 200) })
  if (CART_RE.test(msg) && tools.has('searchOfferings')) return call('searchOfferings', { query: msg.slice(0, 200), limit: 3 })
  if (tools.has('searchOfferings')) return call('searchOfferings', { query: msg.slice(0, 200), limit: 6 })
  return { text: `(mock) ${msg.slice(0, 200)}` }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Mock provider; AI_MOCK_DELAY_MS adds a per-chunk delay so load tests see realistic stream durations. */
export const createDevMockProvider = (delayMs = Number(process.env.AI_MOCK_DELAY_MS ?? 0)): AIProvider => {
  const base = createMockProvider({ id: 'mock', fallback: mockReply, dims: 1536 })
  if (!delayMs) return base
  return {
    ...base,
    async *stream(req): AsyncIterable<StreamEvent> {
      await sleep(delayMs * 4) // time to first token
      for await (const ev of base.stream!(req)) {
        if (ev.type === 'text-delta') await sleep(delayMs)
        yield ev
      }
    },
  }
}
