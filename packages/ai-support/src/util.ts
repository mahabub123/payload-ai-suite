import type { Payload, PayloadRequest } from 'payload'
import { AIError } from '@payload-ai-suite/ai-core'

export const MODULE = 'support'

export const SLUGS = {
  tickets: 'ai-tickets',
  reviewInsights: 'ai-review-insights',
  reviewFlags: 'ai-review-flags',
} as const

export const TASKS = {
  triage: 'ai-support-triage',
  reviewInsights: 'ai-support-review-insights',
  reviewModerate: 'ai-support-review-moderate',
} as const

/** Request-context flag so our own ticket writes never re-trigger hooks. */
export const INTERNAL = 'aiSupportInternal'

export type TicketStatus = 'open' | 'pending' | 'solved' | 'closed'
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'
export type Sentiment = 'positive' | 'neutral' | 'negative'

export interface TicketReply {
  body: string
  html?: string
  channel: 'email' | 'hook'
  auto: boolean
  sentAt: string
  sentBy?: string
}

export interface TicketDoc {
  id: string | number
  source?: string
  subject?: string
  customerId?: string | null
  customerEmail?: string | null
  conversation?: unknown
  transcript?: unknown
  summary?: string | null
  topic?: string | null
  priority?: TicketPriority | null
  sentiment?: Sentiment | null
  language?: string | null
  linkedOrderId?: string | null
  status?: TicketStatus
  suggestedReply?: string | null
  replies?: TicketReply[] | null
  triagedAt?: string | null
  tenant?: unknown
}

export const relId = (v: unknown): string | undefined => {
  if (v === null || v === undefined || v === '') return undefined
  if (typeof v === 'object') return relId((v as { id?: unknown }).id)
  return String(v)
}

export const getPath = (doc: Record<string, unknown>, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o == null ? o : (o as Record<string, unknown>)[k]), doc)

/** Flatten the ticket subject + transcript (+ replies) to text, newest content kept when long. */
export const ticketThread = (t: TicketDoc, maxChars = 6000): string => {
  const lines: string[] = []
  if (t.subject) lines.push(`Subject: ${t.subject}`)
  const tr = t.transcript
  if (typeof tr === 'string') lines.push(tr)
  else if (Array.isArray(tr)) {
    for (const m of tr as Record<string, unknown>[]) {
      if (typeof m === 'string') {
        lines.push(m)
        continue
      }
      const role = String(m.role ?? m.from ?? 'customer')
      const text = m.text ?? m.content ?? m.body ?? m.message
      if (typeof text === 'string' && text.trim()) lines.push(`${role}: ${text}`)
    }
  }
  for (const r of t.replies ?? []) lines.push(`agent: ${r.body}`)
  const all = lines.join('\n')
  return all.length > maxChars ? all.slice(all.length - maxChars) : all
}

/** The latest customer message (or the subject) — what an answer must address. */
export const latestCustomerMessage = (t: TicketDoc): string => {
  const tr = Array.isArray(t.transcript) ? (t.transcript as Record<string, unknown>[]) : []
  for (let i = tr.length - 1; i >= 0; i--) {
    const m = tr[i]
    const role = String(m?.role ?? m?.from ?? 'customer')
    const text = m?.text ?? m?.content ?? m?.body ?? m?.message
    if (!['assistant', 'agent', 'staff', 'system', 'tool'].includes(role) && typeof text === 'string' && text.trim()) return text
  }
  return typeof t.transcript === 'string' ? t.transcript : t.subject ?? ''
}

export const paramId = (input: unknown, req: PayloadRequest | undefined): string => {
  const id = (input as { params?: { id?: unknown } } | undefined)?.params?.id ?? req?.routeParams?.id
  if (id === undefined || id === null || id === '') throw new AIError('validation', 'Missing id')
  return String(id)
}

export const queueJob = async (
  payload: Payload,
  task: string,
  input: Record<string, unknown>,
  opts: { waitUntil?: Date; req?: PayloadRequest } = {},
): Promise<void> => {
  const queue = payload.jobs.queue as unknown as (args: {
    task: string
    input: Record<string, unknown>
    waitUntil?: Date
    req?: PayloadRequest
  }) => Promise<unknown>
  await queue({ task, input, waitUntil: opts.waitUntil, req: opts.req })
}

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
