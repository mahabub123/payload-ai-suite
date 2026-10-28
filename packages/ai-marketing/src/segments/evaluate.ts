import type { AdapterContext, AdapterSet, Customer, Order } from '@payload-ai-suite/ai-core'
import { AIError } from '@payload-ai-suite/ai-core'
import { DAY_MS, maskEmail, normEmail } from '../util'
import type { Comparison, SegmentCondition, SegmentDefinition } from './schema'

interface OrderFact {
  at: number
  total: number
  offeringIds: string[]
}

export interface SegmentMember {
  customerId: string
  email?: string
  name?: string
  marketingOptIn?: boolean
}

export interface SegmentSampleRow {
  customerId: string
  name?: string
  email?: string
}

export interface SegmentEvaluation {
  size: number
  sample: SegmentSampleRow[]
  members: SegmentMember[]
}

export const compare = (a: number, op: Comparison, b: number): boolean => {
  switch (op) {
    case 'gt':
      return a > b
    case 'gte':
      return a >= b
    case 'lt':
      return a < b
    case 'lte':
      return a <= b
    case 'eq':
      return a === b
  }
}

export type CategoryResolver = (offeringIds: string[]) => Promise<Map<string, string[]>>

const inWindow = (o: OrderFact, now: number, days?: number) => days === undefined || o.at >= now - days * DAY_MS

/** Pure evaluation of one condition against one customer's facts. */
export const matchCondition = (
  c: SegmentCondition,
  customer: Customer,
  orders: OrderFact[],
  now: number,
  categoriesOf: Map<string, string[]>,
): boolean => {
  switch (c.type) {
    case 'marketingOptIn':
      return (customer.marketingOptIn ?? false) === c.value
    case 'orderCount':
      return compare(orders.filter((o) => inWindow(o, now, c.withinDays)).length, c.op, c.value)
    case 'totalSpent':
      return compare(
        orders.filter((o) => inWindow(o, now, c.withinDays)).reduce((s, o) => s + o.total, 0),
        c.op,
        c.amount,
      )
    case 'lastOrderDaysAgo': {
      if (!orders.length) return false
      const last = Math.max(...orders.map((o) => o.at))
      return compare(Math.floor((now - last) / DAY_MS), c.op, c.value)
    }
    case 'signedUpDaysAgo': {
      if (!customer.createdAt) return false
      return compare(Math.floor((now - Date.parse(customer.createdAt)) / DAY_MS), c.op, c.value)
    }
    case 'purchasedOffering':
      return orders.some((o) => inWindow(o, now, c.withinDays) && o.offeringIds.some((id) => c.offeringIds.includes(id)))
    case 'purchasedCategory':
      return orders.some(
        (o) =>
          inWindow(o, now, c.withinDays) &&
          o.offeringIds.some((id) => (categoriesOf.get(id) ?? []).some((cat) => c.categoryIds.includes(cat))),
      )
  }
}

export const matchDefinition = (
  def: SegmentDefinition,
  customer: Customer,
  orders: OrderFact[],
  now: number,
  categoriesOf: Map<string, string[]>,
): boolean => {
  const results = def.conditions.map((c) => matchCondition(c, customer, orders, now, categoriesOf))
  return def.match === 'all' ? results.every(Boolean) : results.some(Boolean)
}

/** Category ids per offering via the offering adapter (batched, cached per evaluation). */
export const offeringCategoryResolver =
  (adapters: AdapterSet, ctx: AdapterContext): CategoryResolver =>
  async (ids) => {
    const out = new Map<string, string[]>()
    const offering = adapters.offering
    if (!offering || !ids.length) return out
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100)
      const { items } = await offering.search({ ids: chunk, limit: chunk.length }, ctx)
      for (const it of items) out.set(it.id, it.categoryIds ?? [])
    }
    return out
  }

/**
 * Evaluate a segment over customers + orders from the adapters (never SQL).
 * Orders are joined by customerId, falling back to email.
 */
export const evaluateSegment = async (
  def: SegmentDefinition,
  adapters: AdapterSet,
  ctx: AdapterContext,
  opts: { now?: Date; sampleSize?: number; resolveCategories?: CategoryResolver } = {},
): Promise<SegmentEvaluation> => {
  const { customer, order } = adapters
  if (!customer) throw new AIError('unavailable', 'Segments need the customer concept to be mapped')
  const now = (opts.now ?? new Date()).getTime()
  const needsOrders = def.conditions.some((c) => c.type !== 'marketingOptIn' && c.type !== 'signedUpDaysAgo')
  if (needsOrders && !order) throw new AIError('unavailable', 'This segment needs the order concept to be mapped')

  const byCustomer = new Map<string, OrderFact[]>()
  const byEmail = new Map<string, OrderFact[]>()
  const offeringIds = new Set<string>()
  if (needsOrders && order) {
    for await (const o of order.iterate({ batchSize: 200 }, ctx) as AsyncIterable<Order>) {
      const fact: OrderFact = {
        at: Date.parse(o.createdAt),
        total: o.total?.amount ?? 0,
        offeringIds: (o.items ?? []).map((i) => i.offeringId),
      }
      fact.offeringIds.forEach((id) => offeringIds.add(id))
      const push = (m: Map<string, OrderFact[]>, k: string) => m.set(k, [...(m.get(k) ?? []), fact])
      if (o.customerId) push(byCustomer, String(o.customerId))
      else if (o.customerEmail) push(byEmail, normEmail(o.customerEmail))
    }
  }

  const needsCategories = def.conditions.some((c) => c.type === 'purchasedCategory')
  const categoriesOf = needsCategories
    ? await (opts.resolveCategories ?? offeringCategoryResolver(adapters, ctx))([...offeringIds])
    : new Map<string, string[]>()

  const sampleSize = opts.sampleSize ?? 10
  const members: SegmentMember[] = []
  for await (const c of customer.iterate({ batchSize: 200 }, ctx)) {
    const facts = [...(byCustomer.get(String(c.id)) ?? []), ...(c.email ? byEmail.get(normEmail(c.email)) ?? [] : [])]
    if (matchDefinition(def, c, facts, now, categoriesOf)) {
      members.push({ customerId: String(c.id), email: c.email, name: c.name, marketingOptIn: c.marketingOptIn })
    }
  }
  return {
    size: members.length,
    members,
    sample: members.slice(0, sampleSize).map((m) => ({ customerId: m.customerId, name: m.name, email: maskEmail(m.email) })),
  }
}
