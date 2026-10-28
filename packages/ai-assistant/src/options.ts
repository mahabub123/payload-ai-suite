import type { Payload } from 'payload'

export type AssistantToolGroup = 'catalog' | 'cart' | 'orders' | 'returns' | 'leads' | 'booking' | 'knowledge'

export const ALL_TOOL_GROUPS: readonly AssistantToolGroup[] = ['catalog', 'cart', 'orders', 'returns', 'leads', 'booking', 'knowledge']

export interface AiAssistantOptions {
  /** Tool groups the assistant may use. Default: all groups whose concepts are mapped. */
  tools?: AssistantToolGroup[]
  /** Hand-off target. `false` disables the handOff tool and the fallback ticket. Default 'support'. */
  handoff?: 'support' | false
  /** Shown to the shopper on hand-off, e.g. "within 2 hours". */
  expectedReplyTime?: string
  /** First message shown by the widget / used as a prompt hint. */
  greeting?: string
  /** Agent loop limit. Default 5. */
  maxSteps?: number
  /** Guest order verification (order number + email -> one-time code). */
  otp?: { ttlMinutes?: number; sendVia?: 'email'; maxAttempts?: number }
  /** Contact options offered when the assistant is busy or a hand-off happens. */
  contact?: { email?: string; phone?: string; whatsapp?: string; hours?: string }
  /** Minutes without activity before a conversation counts as idle for outcome tagging. Default 30. */
  idleMinutes?: number
}

export interface ResolvedAssistantOptions {
  tools: AssistantToolGroup[]
  handoff: 'support' | false
  expectedReplyTime: string
  greeting?: string
  maxSteps: number
  otp: { ttlMinutes: number; sendVia: 'email'; maxAttempts: number }
  contact: { email?: string; phone?: string; whatsapp?: string; hours?: string }
  idleMinutes: number
}

export const resolveOptions = (o: AiAssistantOptions = {}): ResolvedAssistantOptions => ({
  tools: o.tools?.length ? [...new Set(o.tools)] : [...ALL_TOOL_GROUPS],
  handoff: o.handoff === false ? false : 'support',
  expectedReplyTime: o.expectedReplyTime ?? 'within one business day',
  greeting: o.greeting,
  maxSteps: Math.max(1, Math.min(o.maxSteps ?? 5, 10)),
  otp: {
    ttlMinutes: o.otp?.ttlMinutes ?? 10,
    sendVia: 'email',
    maxAttempts: o.otp?.maxAttempts ?? 5,
  },
  contact: o.contact ?? {},
  idleMinutes: o.idleMinutes ?? 30,
})

const byPayload = new WeakMap<Payload, ResolvedAssistantOptions>()

export const setAssistantOptions = (payload: Payload, o: ResolvedAssistantOptions): void => {
  byPayload.set(payload, o)
}

export const getAssistantOptions = (payload: Payload): ResolvedAssistantOptions => byPayload.get(payload) ?? resolveOptions()
