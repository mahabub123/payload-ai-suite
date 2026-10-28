import { getSuiteState } from '@payload-ai-suite/ai-core'
import type { AICoreOptions, AIContext, Card, CoreServices } from '@payload-ai-suite/ai-core'
import { MODULE, TICKETS, truncate, turnOf } from './state'

export interface HandoffInput {
  conversationId: string
  reason?: string
  contactEmail?: string
  contactName?: string
  expectedReplyTime: string
}

const transcriptOf = async (cid: string, ctx: AIContext, services: CoreServices) => {
  const mem = services.memory
  if (mem.messages) {
    const msgs = await mem.messages(cid, ctx, { limit: 100 })
    return msgs.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, text: m.text, at: m.createdAt }))
  }
  const { messages } = await mem.context(cid, ctx, { lastTurns: 50 })
  return messages.map((m) => ({
    role: m.role,
    text: typeof m.content === 'string' ? m.content : m.content.map((p) => (p.type === 'text' ? p.text : '')).join(''),
  }))
}

/**
 * Create (or reuse) the open hand-off ticket for a conversation and mark the conversation handed off.
 * Works without any model call so it is safe in the "AI unavailable" path.
 */
export const createHandoff = async (ctx: AIContext, services: CoreServices, input: HandoffInput): Promise<Card> => {
  const { payload } = ctx
  const existing = await payload.find({
    collection: TICKETS as never,
    where: { and: [{ conversation: { equals: input.conversationId } }, { status: { equals: 'open' } }] } as never,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  let ticketId = (existing.docs[0] as { id?: string | number } | undefined)?.id
  if (ticketId == null) {
    const transcript = await transcriptOf(input.conversationId, ctx, services)
    const { summary } = await services.memory.context(input.conversationId, ctx, { lastTurns: 0 }).catch(() => ({ summary: undefined }))
    const lastUser = [...transcript].reverse().find((m) => m.role === 'user')?.text
    let customerEmail = input.contactEmail ?? turnOf(ctx)?.identity?.email
    if (!customerEmail && ctx.actor.customerId && ctx.adapters.customer) {
      customerEmail = (await ctx.adapters.customer.current(ctx.adapterCtx).catch(() => null))?.email
    }
    const data: Record<string, unknown> = {
      source: 'handoff',
      subject: truncate(input.reason || lastUser || 'Assistant hand-off', 120),
      customerId: ctx.actor.customerId,
      customerEmail,
      conversation: input.conversationId,
      transcript,
      summary: [summary, input.reason && `Reason: ${input.reason}`, input.contactName && `Name: ${input.contactName}`]
        .filter(Boolean)
        .join('\n') || truncate(lastUser, 500),
      status: 'open',
    }
    const tenantField = (getSuiteState(payload.config)?.options as AICoreOptions | undefined)?.tenant?.field
    if (tenantField && ctx.tenant != null) data[tenantField] = ctx.tenant
    const doc = await payload.create({ collection: TICKETS as never, data: data as never, overrideAccess: true })
    ticketId = (doc as { id: string | number }).id
    await services.audit.log({ action: 'assistant.handoff', target: { collection: TICKETS, id: ticketId }, meta: { conversationId: input.conversationId } }, ctx)
  }
  await services.memory.update(input.conversationId, { handedOff: true, status: 'handed-off', outcome: 'handed_off' }, ctx)
  return { type: 'handoff', ticketId: String(ticketId), expectedReply: input.expectedReplyTime }
}

