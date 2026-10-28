import type { Payload } from 'payload'
import type { AIContext, CoreServices } from 'payload-ai-core'
import { AIError } from 'payload-ai-core'
import { INTERNAL, SLUGS, type TicketDoc, type TicketReply, type TicketStatus } from '../util'

export interface SupportReplyEvent {
  ticket: TicketDoc
  /** Plain text reply. */
  body: string
  /** Sanitized HTML version. */
  html: string
  auto: boolean
  tenant?: string | number
}

/** Return true when the listener delivered the reply (e.g. ai-channels sent it on WhatsApp). */
export type SupportReplyListener = (event: SupportReplyEvent, payload: Payload) => boolean | Promise<boolean>

const listeners = new WeakMap<Payload, SupportReplyListener[]>()

/**
 * The `ai-support-reply` hook: other modules (ai-channels) register here in their onInit to deliver
 * replies on the ticket's channel. When no listener handles it, the reply goes by email.
 */
export const onSupportReply = (payload: Payload, listener: SupportReplyListener): (() => void) => {
  const list = listeners.get(payload) ?? []
  list.push(listener)
  listeners.set(payload, list)
  return () => listeners.set(payload, (listeners.get(payload) ?? []).filter((l) => l !== listener))
}

export const hasReplyChannel = (payload: Payload, ticket: TicketDoc): boolean =>
  Boolean(ticket.customerEmail) || (listeners.get(payload)?.length ?? 0) > 0

/** Deliver a reply: channel listeners first, then email. Throws when the customer is unreachable. */
export const deliverReply = async (
  payload: Payload,
  services: CoreServices,
  ticket: TicketDoc,
  reply: { body: string; auto: boolean },
  ctx: Pick<AIContext, 'tenant'>,
): Promise<{ channel: TicketReply['channel']; html: string }> => {
  const html = services.guardrails.renderMarkdown(reply.body)
  const event: SupportReplyEvent = { ticket, body: reply.body, html, auto: reply.auto, tenant: ctx.tenant }
  for (const l of listeners.get(payload) ?? []) {
    if (await l(event, payload)) return { channel: 'hook', html }
  }
  if (!ticket.customerEmail) throw new AIError('conflict', 'No channel or email address to reply to')
  await payload.sendEmail({
    to: ticket.customerEmail,
    subject: ticket.subject ? `Re: ${ticket.subject}` : 'Re: your request',
    text: reply.body,
    html,
  })
  return { channel: 'email', html }
}

/** Append to ticket.replies and set status, without re-triggering our hooks. */
export const recordReply = async (
  payload: Payload,
  ticket: TicketDoc,
  reply: TicketReply,
  status: TicketStatus,
  extra: Record<string, unknown> = {},
): Promise<void> => {
  await payload.update({
    collection: SLUGS.tickets as never,
    id: ticket.id,
    data: { replies: [...(ticket.replies ?? []), reply], status, ...extra } as never,
    overrideAccess: true,
    context: { [INTERNAL]: true },
  })
}
