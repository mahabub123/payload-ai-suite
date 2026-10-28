import type { AIContext, Citation, CoreServices, KnowledgeHit, Order } from 'payload-ai-core'
import type { TicketDoc } from '../util'

export interface Grounding {
  hits: KnowledgeHit[]
  citations: Citation[]
  order: Order | null
  /** Quoted text block for the prompt. */
  text: string
}

/** Compact, model-safe order facts (no addresses/payment details). */
export const orderFacts = (o: Order) => ({
  number: o.number ?? o.id,
  status: o.status,
  createdAt: o.createdAt,
  total: o.total,
  paymentStatus: o.paymentStatus,
  shipping: o.shipping,
  items: o.items.map((i) => ({ title: i.title, quantity: i.quantity })),
})

/** The linked order, looked up in system context but scoped to the ticket's customer. */
export const loadLinkedOrder = async (ticket: TicketDoc, ctx: AIContext): Promise<Order | null> => {
  const adapter = ctx.adapters.order
  if (!adapter || !ticket.linkedOrderId || !ticket.customerId) return null
  return adapter
    .getForCustomer(ticket.linkedOrderId, { ...ctx.adapterCtx, system: true, customerId: String(ticket.customerId) })
    .catch(() => null)
}

/** Policies (knowledge search, public/customer visibility) + the linked order. */
export const groundTicket = async (
  question: string,
  ticket: TicketDoc,
  ctx: AIContext,
  services: CoreServices,
  opts: { order?: Order | null } = {},
): Promise<Grounding> => {
  const { hits, citations } = question.trim()
    ? await services.knowledge.search(question, ctx, { k: 5, visibility: ['public', 'customers'] })
    : { hits: [], citations: [] }
  const order = opts.order !== undefined ? opts.order : await loadLinkedOrder(ticket, ctx)
  const parts: string[] = []
  hits.forEach((h, i) => parts.push(services.guardrails.quote(`policy ${i + 1}: ${h.title}`, h.content)))
  if (order) parts.push(services.guardrails.quote('order', JSON.stringify(orderFacts(order))))
  return { hits, citations, order, text: parts.length ? parts.join('\n\n') : '(no policies or order data found)' }
}
