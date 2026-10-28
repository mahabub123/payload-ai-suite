import { z } from 'zod'
import type { Payload, TaskConfig } from 'payload'
import type { AIContext, CoreServices, Order } from '@payload-ai-suite/ai-core'
import { getAI } from '@payload-ai-suite/ai-core'
import type { ResolvedSupportOptions } from '../options'
import { PROMPTS } from '../prompts'
import { INTERNAL, MODULE, SLUGS, TASKS, latestCustomerMessage, relId, ticketThread, type TicketDoc } from '../util'
import { groundTicket } from './grounding'
import { deliverReply, hasReplyChannel, recordReply } from './reply'

export const triageSchema = (topics: [string, ...string[]]) =>
  z.object({
    topic: z.enum(topics),
    priority: z.enum(['low', 'normal', 'high', 'urgent']),
    sentiment: z.enum(['positive', 'neutral', 'negative']),
    language: z.string().min(2).max(16),
    orderNumber: z.string().max(64).nullable().optional(),
    confidence: z.number().min(0).max(1),
  })
export type Triage = z.infer<ReturnType<typeof triageSchema>>

export const answerSchema = z.object({
  answerable: z.boolean(),
  reply: z.string().max(4000),
  confidence: z.number().min(0).max(1),
})

export type AutoAnswerDecision =
  | { sent: true; channel: string }
  | { sent: false; reason: 'topic-not-allowed' | 'low-confidence' | 'not-grounded' | 'not-answerable' | 'output-check' | 'no-channel' | 'already-answered' | 'error' }

const findOrder = async (number: string, ticket: TicketDoc, ctx: AIContext): Promise<Order | null> => {
  const adapter = ctx.adapters.order
  if (!adapter || !ticket.customerEmail) return null
  const candidates = [...new Set([number.trim(), number.trim().replace(/^#/, '')])].filter(Boolean)
  for (const n of candidates) {
    const o = await adapter.findByNumberAndEmail(n, ticket.customerEmail, { ...ctx.adapterCtx, system: true }).catch(() => null)
    if (o) return o
  }
  return null
}

/** Auto-answer only when topic is allow-listed AND confidence >= bar AND the answer is grounded. */
export const maybeAutoAnswer = async (
  payload: Payload,
  services: CoreServices,
  options: ResolvedSupportOptions,
  ticket: TicketDoc,
  triage: Triage,
  order: Order | null,
  ctx: AIContext,
): Promise<AutoAnswerDecision> => {
  if (!options.autoAnswerTopics.includes(triage.topic)) return { sent: false, reason: 'topic-not-allowed' }
  if (triage.confidence < options.autoAnswerConfidence) return { sent: false, reason: 'low-confidence' }
  if ((ticket.replies ?? []).length) return { sent: false, reason: 'already-answered' }
  if (!hasReplyChannel(payload, ticket)) return { sent: false, reason: 'no-channel' }

  const question = latestCustomerMessage(ticket)
  const grounding = await groundTicket(question, ticket, ctx, services, { order: order ?? undefined })
  if (!grounding.hits.length && !grounding.order) return { sent: false, reason: 'not-grounded' }

  const prompt = await services.prompts.render(
    PROMPTS.answer,
    { language: triage.language, policy: services.guardrails.systemPolicy(ctx), ticket: services.guardrails.quote('ticket', ticketThread(ticket)), grounding: grounding.text },
    ctx,
  )
  const { object } = await services.ai.generateObject(
    { task: 'write', system: prompt.system, prompt: prompt.user ?? question, schema: answerSchema, schemaName: 'AutoAnswer', promptRef: { slug: prompt.slug, version: prompt.version } },
    ctx,
  )
  if (!object.answerable || !object.reply.trim()) return { sent: false, reason: 'not-answerable' }
  if (object.confidence < options.autoAnswerConfidence) return { sent: false, reason: 'low-confidence' }
  const checked = services.guardrails.checkOutput(object.reply, ctx, { toolResults: [grounding.order, grounding.hits] })
  if (!checked.ok) return { sent: false, reason: 'output-check' }
  const moderation = await services.guardrails.moderate(checked.text, ctx)
  if (!moderation.ok) return { sent: false, reason: 'output-check' }

  const { channel, html } = await deliverReply(payload, services, ticket, { body: checked.text, auto: true }, ctx)
  await recordReply(payload, ticket, { body: checked.text, html, channel, auto: true, sentAt: new Date().toISOString() }, 'pending', { autoAnswered: true })
  await services.audit.log(
    { action: 'support.auto-answer', target: { collection: SLUGS.tickets, id: ticket.id }, after: { topic: triage.topic, confidence: triage.confidence, channel } },
    ctx,
  )
  return { sent: true, channel }
}

export interface TriageResult {
  skipped?: string
  triage?: Triage
  linkedOrderId?: string
  autoAnswer?: AutoAnswerDecision
}

export const triageTicket = async (
  payload: Payload,
  services: CoreServices,
  options: ResolvedSupportOptions,
  input: { ticketId: string; tenant?: string | number; force?: boolean },
): Promise<TriageResult> => {
  const ticket = (await payload
    .findByID({ collection: SLUGS.tickets as never, id: input.ticketId, depth: 0, overrideAccess: true })
    .catch(() => null)) as unknown as TicketDoc | null
  if (!ticket) return { skipped: 'not-found' }
  if (ticket.triagedAt && !input.force) return { skipped: 'already-triaged' }
  const tenant = input.tenant ?? relId(ticket.tenant)
  if (!(await services.isModuleEnabled(MODULE, payload, tenant))) return { skipped: 'module-disabled' }
  const ctx = services.systemContext(payload, { module: MODULE, tenant })

  const prompt = await services.prompts.render(
    PROMPTS.triage,
    { topics: options.topics.join(', '), ticket: services.guardrails.quote('ticket', ticketThread(ticket)) },
    ctx,
  )
  const { object: triage } = await services.ai.generateObject(
    { task: 'fast', system: prompt.system, prompt: prompt.user ?? ticketThread(ticket), schema: triageSchema(options.topics), schemaName: 'Triage', promptRef: { slug: prompt.slug, version: prompt.version } },
    ctx,
  )

  const order = !ticket.linkedOrderId && triage.orderNumber ? await findOrder(triage.orderNumber, ticket, ctx) : null
  const linkedOrderId = ticket.linkedOrderId ?? order?.id
  const updated = (await payload.update({
    collection: SLUGS.tickets as never,
    id: ticket.id,
    data: {
      topic: triage.topic,
      priority: triage.priority,
      sentiment: triage.sentiment,
      language: triage.language,
      ...(linkedOrderId ? { linkedOrderId: String(linkedOrderId) } : {}),
      triageConfidence: triage.confidence,
      triagedAt: new Date().toISOString(),
    } as never,
    overrideAccess: true,
    context: { [INTERNAL]: true },
  })) as unknown as TicketDoc

  let autoAnswer: AutoAnswerDecision = { sent: false, reason: 'topic-not-allowed' }
  if (!updated.status || updated.status === 'open') {
    try {
      autoAnswer = await maybeAutoAnswer(payload, services, options, updated, triage, order, ctx)
    } catch (e) {
      // Triage is saved; a failed automatic answer just leaves the ticket for a person.
      payload.logger.warn(`[ai-support] auto-answer failed for ticket ${String(ticket.id)}: ${(e as Error).message}`)
      autoAnswer = { sent: false, reason: 'error' }
    }
  }
  return { triage, linkedOrderId: linkedOrderId ? String(linkedOrderId) : undefined, autoAnswer }
}

export const triageTask = (options: ResolvedSupportOptions): TaskConfig<any> => ({
  slug: TASKS.triage,
  label: 'AI support: triage ticket',
  retries: { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
  async handler({ input, req }) {
    const out = await triageTicket(req.payload, getAI(req.payload), options, input as { ticketId: string; tenant?: string | number })
    return { output: { skipped: out.skipped ?? null, topic: out.triage?.topic ?? null, autoAnswered: out.autoAnswer?.sent ?? false } }
  },
})
