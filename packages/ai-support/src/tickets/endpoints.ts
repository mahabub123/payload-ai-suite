import { z } from 'zod'
import type { PayloadRequest } from 'payload'
import type { AIContext, AIEndpointDefinition } from 'payload-ai-core'
import { AIError } from 'payload-ai-core'
import { PROMPTS } from '../prompts'
import { INTERNAL, MODULE, SLUGS, latestCustomerMessage, paramId, ticketThread, type TicketDoc } from '../util'
import { groundTicket, orderFacts } from './grounding'
import { deliverReply, recordReply } from './reply'

const idParams = z.object({ id: z.union([z.string(), z.number()]).transform(String) }).optional()

/** Read with the caller's access (tenant scoping, role checks) before any AI work. */
const loadTicket = async (ctx: AIContext, id: string, req: PayloadRequest | undefined): Promise<TicketDoc> => {
  const t = (await ctx.payload
    .findByID({ collection: SLUGS.tickets as never, id, depth: 0, req, overrideAccess: !req })
    .catch(() => null)) as unknown as TicketDoc | null
  if (!t) throw new AIError('not_found', 'Ticket not found')
  return t
}

export const suggestSchema = z.object({
  reply: z.string().min(1).max(4000),
  summary: z.string().min(1).max(800),
})

const suggestInput = z.object({ params: idParams, instructions: z.string().max(1000).optional() })

export const suggestEndpoint: AIEndpointDefinition<z.infer<typeof suggestInput>> = {
  path: '/ai/support/tickets/:id/suggest',
  method: 'post',
  module: MODULE,
  access: ['support'],
  surface: 'admin',
  input: suggestInput,
  async handler({ ctx, services, input, req }) {
    const ticket = await loadTicket(ctx, paramId(input, req), req)
    const question = latestCustomerMessage(ticket)
    const grounding = await groundTicket(question, ticket, ctx, services)
    const prompt = await services.prompts.render(
      PROMPTS.suggest,
      {
        language: ticket.language ?? ctx.locale,
        policy: services.guardrails.systemPolicy(ctx),
        ticket: services.guardrails.quote('ticket', ticketThread(ticket)),
        grounding: `${grounding.text}${input.instructions ? `\n\nAgent instructions: ${input.instructions}` : ''}`,
      },
      ctx,
    )
    const { object } = await services.ai.generateObject(
      { task: 'write', system: prompt.system, prompt: prompt.user ?? question, schema: suggestSchema, schemaName: 'SuggestedReply', promptRef: { slug: prompt.slug, version: prompt.version } },
      ctx,
    )
    const checked = services.guardrails.checkOutput(object.reply, ctx, { toolResults: [grounding.order, grounding.hits] })
    await ctx.payload.update({
      collection: SLUGS.tickets as never,
      id: ticket.id,
      data: { suggestedReply: checked.text, summary: object.summary } as never,
      overrideAccess: true,
      context: { [INTERNAL]: true },
    })
    return {
      suggestedReply: checked.text,
      summary: object.summary,
      citations: grounding.citations,
      order: grounding.order ? orderFacts(grounding.order) : null,
      warnings: checked.issues,
    }
  },
}

const replyInput = z.object({
  params: idParams,
  body: z.string().trim().min(1).max(8000),
  status: z.enum(['pending', 'solved', 'closed']).default('pending'),
})

/** Agent edits the suggestion and sends it. */
export const replyEndpoint: AIEndpointDefinition<z.infer<typeof replyInput>> = {
  path: '/ai/support/tickets/:id/reply',
  method: 'post',
  module: MODULE,
  access: ['support'],
  surface: 'admin',
  budget: false,
  input: replyInput,
  async handler({ ctx, services, input, req }) {
    const ticket = await loadTicket(ctx, paramId(input, req), req)
    const { channel, html } = await deliverReply(ctx.payload, services, ticket, { body: input.body, auto: false }, ctx)
    const sentBy = req?.user?.id !== undefined ? String(req.user.id) : undefined
    await recordReply(ctx.payload, ticket, { body: input.body, html, channel, auto: false, sentAt: new Date().toISOString(), sentBy }, input.status)
    await services.audit.log(
      {
        action: 'support.reply',
        target: { collection: SLUGS.tickets, id: ticket.id },
        before: { status: ticket.status },
        after: { status: input.status, channel, usedSuggestion: Boolean(ticket.suggestedReply && ticket.suggestedReply.trim() === input.body.trim()) },
      },
      ctx,
    )
    return { ok: true, channel, status: input.status }
  },
}
