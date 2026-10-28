import type { AIProvider, ChatRequest, ChatResult, StreamEvent } from 'payload-ai-suite'
import { createMockProvider } from 'payload-ai-core/testing'

const textOf = (content: ChatRequest['messages'][number]['content']): string =>
  typeof content === 'string' ? content : content.map((p) => (p.type === 'text' ? p.text : '')).join(' ')

const ORDER_RE = /\b(order|অর্ডার)\b|\b[A-Z]{2,3}-\d{3,}\b/i
const RETURN_RE = /\b(return|exchange|ফেরত)\b/i
const POLICY_RE = /\b(policy|shipping|delivery|refund|warranty|ডেলিভারি|নীতি)\b/i
const CART_RE = /\badd\b.*\bcart\b|\bbuy\b|কার্টে/i
const HUMAN_RE = /\b(human|person|agent|someone|staff)\b|মানুষ/i

type ToolResultPart = Extract<Exclude<ChatRequest['messages'][number]['content'], string>[number], { type: 'tool-result' }>
type Loose = Record<string, any>

const lastUserText = (req: ChatRequest): string => {
  for (let i = req.messages.length - 1; i >= 0; i--) if (req.messages[i].role === 'user') return textOf(req.messages[i].content)
  return ''
}

const toolResults = (m: ChatRequest['messages'][number]): ToolResultPart[] =>
  typeof m.content === 'string' ? [] : (m.content.filter((p) => p.type === 'tool-result') as ToolResultPart[])

/** Untrusted-data wrappers around retrieved text are dropped for display. */
const unquote = (s: string) => s.replace(/<\/?[a-z_-]+(\s[^>]*)?>/gi, '').trim()

/** What a model would say after a tool ran: a plain summary of the tool data (never invented facts). */
/** Tool output reaches the model as JSON inside an untrusted-data tag; unwrap it like a model would read it. */
const parseOutput = (output: unknown): Loose => {
  if (typeof output !== 'string') return (output ?? {}) as Loose
  const inner = output.replace(/^\s*<[^>]+>\s*/, '').replace(/\s*<\/[^>]+>\s*$/, '')
  try {
    return JSON.parse(inner) as Loose
  } catch {
    return { text: inner }
  }
}

const afterTool = (r: ToolResultPart, userText: string, tools: Set<string>): Partial<ChatResult> => {
  const out = parseOutput(r.output)
  if (r.isError || out.error) return { text: "Sorry, I couldn't check that right now. I can pass this to a teammate if you like." }
  switch (r.toolName) {
    case 'searchOfferings': {
      const first = out.items?.[0]
      if (first && CART_RE.test(userText) && tools.has('addToCart')) return call('addToCart', { offeringId: String(first.id), quantity: 1 })
      return { text: out.items?.length ? `I found ${out.items.length} matching product(s); see the cards above.` : 'I could not find a matching product.' }
    }
    case 'addToCart':
      return { text: `Done, it's in your cart (${out.itemCount ?? 1} item(s)).` }
    case 'getOrderStatus': {
      if (!out.found) return { text: 'I could not find that order on your account.' }
      const sh = (out.shipping ?? {}) as Loose
      const track = sh.trackingNumber ? ` with ${sh.carrier ?? 'the courier'}, tracking number ${sh.trackingNumber}` : ''
      return { text: `Order ${out.number} is ${out.status}${sh.status ? ` (${sh.status})` : ''}${track}.` }
    }
    case 'listMyOrders':
      return { text: out.orders?.length ? `Your recent orders: ${out.orders.map((o: Loose) => `${o.number} (${o.status})`).join(', ')}.` : 'I could not find any orders on your account.' }
    case 'getPolicy':
    case 'searchKnowledge': {
      // A model reads every result; pick the one sharing the most words with the question.
      const words = new Set(userText.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])
      const overlap = (h: Loose) => (`${h.title} ${h.content}`.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter((w) => words.has(w)).length
      const hit = [...(out.results ?? [])].sort((a: Loose, b: Loose) => overlap(b) - overlap(a))[0]
      return { text: hit ? `${hit.title}: ${unquote(String(hit.content)).slice(0, 400)}` : 'I could not find that in our policies.' }
    }
    case 'requestOrderVerification':
      return { text: 'Please verify the order first: enter the order number and the email on the order, and we will send you a one-time code.' }
    case 'handOff':
      return { text: `I've passed this to our team. They reply ${out.expectedReply ?? 'soon'}.` }
    default:
      return { text: 'Here is what I found; see the cards above.' }
  }
}

const call = (toolName: string, input: unknown): Partial<ChatResult> => ({
  text: '',
  toolCalls: [{ toolCallId: `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, toolName, input }],
})

/**
 * Deterministic "model" for AI_MOCK=1: picks a plausible tool for the shopper's message,
 * then summarises the tool output. Good enough to click through every flow offline.
 */
export const mockReply = (req: ChatRequest): Partial<ChatResult> => {
  const last = req.messages[req.messages.length - 1]
  // Structured calls: fall through with no object so the core mock fills in a schema-valid sample.
  if (req.responseSchema) return { text: '' }
  if (!last) return { text: 'Hello! How can I help?' }
  const tools = new Set((req.tools ?? []).map((t) => t.name))
  if (last.role === 'tool') {
    const r = toolResults(last).at(-1)
    return r ? afterTool(r, lastUserText(req), tools) : { text: 'Here is what I found; see the cards above.' }
  }

  const msg = textOf(last.content)
  const orderNo = msg.match(/\b[A-Z]{2,3}-\d{3,}\b/)?.[0]
  if (HUMAN_RE.test(msg) && tools.has('handOff')) return call('handOff', { reason: msg.slice(0, 200) })
  if ((RETURN_RE.test(msg) || ORDER_RE.test(msg)) && tools.has('requestOrderVerification')) return call('requestOrderVerification', { reason: msg.slice(0, 200) })
  if ((RETURN_RE.test(msg) || ORDER_RE.test(msg)) && orderNo && tools.has('getOrderStatus')) return call('getOrderStatus', { order: orderNo })
  if (ORDER_RE.test(msg) && tools.has('listMyOrders')) return call('listMyOrders', { limit: 5 })
  if (POLICY_RE.test(msg) && tools.has('getPolicy')) return call('getPolicy', { topic: msg.slice(0, 120) })
  if (POLICY_RE.test(msg) && tools.has('searchKnowledge')) return call('searchKnowledge', { query: msg.slice(0, 200) })
  if (CART_RE.test(msg) && tools.has('searchOfferings')) return call('searchOfferings', { query: msg.replace(/\b(add|this|to|my|cart|please)\b/gi, ' ').trim().slice(0, 200) || msg, limit: 3 })
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
