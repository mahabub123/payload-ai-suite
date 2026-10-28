import { z } from 'zod'
import { AIError, defineTool } from 'payload-ai-core'
import type { AdapterContext, Order, ToolContext, ToolResult } from 'payload-ai-core'
import { findVerifiedIdentity, hasOrderIdentity, systemAdapterCtx, turnOf } from '../state'
import type { VerifiedIdentity } from '../state'

type OrderAccess =
  | { mode: 'customer'; customerId: string; adapterCtx: AdapterContext }
  | { mode: 'guest'; identity: Required<Pick<VerifiedIdentity, 'orderNumber' | 'email'>> & VerifiedIdentity }

/** Who may see which orders in this request. Confirm-time requests re-resolve the guest verification. */
/**
 * A customer proven by a one-time code (or a linked channel) has no Payload session, so the store's
 * access rules would refuse the read. Ownership is already proven and the adapter filters and re-checks
 * by customer id, so those reads run as system, scoped to that customer.
 */
const verifiedCustomerCtx = (ctx: ToolContext, customerId: string): AdapterContext => ({ ...systemAdapterCtx(ctx), customerId })

export const resolveOrderAccess = async (ctx: ToolContext): Promise<OrderAccess | null> => {
  if (ctx.actor.customerId) {
    const session = ctx.actor.kind === 'customer' && ctx.actor.user
    return { mode: 'customer', customerId: ctx.actor.customerId, adapterCtx: session ? ctx.adapterCtx : verifiedCustomerCtx(ctx, ctx.actor.customerId) }
  }
  const ident = turnOf(ctx)?.identity ?? (await findVerifiedIdentity(ctx, ctx.services))
  if (ident?.customerId) return { mode: 'customer', customerId: ident.customerId, adapterCtx: verifiedCustomerCtx(ctx, ident.customerId) }
  if (ident?.orderNumber && ident.email) return { mode: 'guest', identity: { ...ident, orderNumber: ident.orderNumber, email: ident.email } }
  return null
}

const norm = (s: string) => s.trim().replace(/^#/, '').toLowerCase()

/** Fetch one order the caller owns; null for anything else (never reveals other customers' orders). */
export const findOwnOrder = async (ref: string, ctx: ToolContext, access: OrderAccess): Promise<Order | null> => {
  const adapter = ctx.adapters.order
  if (!adapter) return null
  if (access.mode === 'guest') {
    const o = await adapter.findByNumberAndEmail(access.identity.orderNumber, access.identity.email, systemAdapterCtx(ctx))
    if (!o) return null
    return o.id === ref || (o.number && norm(o.number) === norm(ref)) ? o : null
  }
  let o = await adapter.getForCustomer(ref, access.adapterCtx)
  if (!o) {
    const list = await adapter.listForCustomer(access.adapterCtx, { limit: 50 })
    const hit = list.find((s) => s.id === ref || (s.number && norm(s.number) === norm(ref)))
    if (hit) o = await adapter.getForCustomer(hit.id, access.adapterCtx)
  }
  // Defence in depth: adapters must filter by customer, but never trust that alone.
  if (o?.customerId && o.customerId !== access.customerId) return null
  return o
}

const publicOrder = (o: Order): Order => {
  const { customerEmail: _e, customerId: _c, ...rest } = o
  return rest
}

const compactOrder = (o: Order) => ({
  id: o.id,
  number: o.number,
  status: o.status,
  paymentStatus: o.paymentStatus,
  total: o.total,
  createdAt: o.createdAt,
  shipping: o.shipping,
  items: o.items.slice(0, 20).map((i) => ({ offeringId: i.offeringId, variantId: i.variantId, title: i.title, quantity: i.quantity })),
})

const NOT_FOUND = { found: false, message: 'No matching order for this customer.' }

export const getOrderStatus = defineTool({
  name: 'getOrderStatus',
  description: 'Get status, items and shipping of one of the shopper\'s own orders by order number or id.',
  tier: 'read',
  requires: ['order'],
  available: hasOrderIdentity,
  input: z.object({ order: z.string().min(1).max(64).describe('order number or id') }),
  async run({ order }, ctx): Promise<ToolResult> {
    const access = await resolveOrderAccess(ctx)
    if (!access) return { data: NOT_FOUND }
    const o = await findOwnOrder(order, ctx, access)
    if (!o) return { data: NOT_FOUND }
    return { data: { found: true, ...compactOrder(o) }, cards: [{ type: 'order', order: publicOrder(o) }] }
  },
})

export const listMyOrders = defineTool({
  name: 'listMyOrders',
  description: 'List the shopper\'s recent orders.',
  tier: 'read',
  requires: ['order'],
  available: hasOrderIdentity,
  input: z.object({ limit: z.number().int().min(1).max(10).optional() }),
  async run({ limit }, ctx) {
    const access = await resolveOrderAccess(ctx)
    if (!access) return { data: { orders: [] } }
    if (access.mode === 'guest') {
      const o = await findOwnOrder(access.identity.orderNumber, ctx, access)
      const orders = o ? [{ id: o.id, number: o.number, status: o.status, total: o.total, createdAt: o.createdAt, itemCount: o.itemCount }] : []
      return { data: { orders }, cards: orders.length ? [{ type: 'orders', orders }] : [] }
    }
    const orders = await ctx.adapters.order!.listForCustomer(access.adapterCtx, { limit: limit ?? 5 })
    return { data: { orders }, cards: orders.length ? [{ type: 'orders', orders }] : [] }
  },
})

/** Offered instead of the order tools when the shopper is not identified yet. */
export const requestOrderVerification = defineTool({
  name: 'requestOrderVerification',
  description:
    'Shopper asks about an order, return or delivery but is not logged in or verified: show the verification form (order number + email, then a one-time code).',
  tier: 'read',
  requires: ['order'],
  available: (ctx) => !hasOrderIdentity(ctx),
  input: z.object({ reason: z.string().max(200).optional() }),
  async run({ reason }) {
    return {
      data: { status: 'verification_required' },
      cards: [{ type: 'verify', reason: reason ?? 'order-lookup', methods: ['login', 'order-email-otp'] }],
    }
  },
})

const returnInput = z.object({
  orderId: z.string().min(1).describe('order id or number'),
  items: z
    .array(z.object({ offeringId: z.string().min(1), variantId: z.string().optional(), quantity: z.number().int().min(1).max(100) }))
    .min(1)
    .max(50),
  reason: z.string().min(3).max(1000),
  kind: z.enum(['return', 'exchange']).default('return'),
})

export const proposeReturn = defineTool({
  name: 'proposeReturn',
  description:
    'Prepare a return or exchange request for items of the shopper\'s own order. The shopper must confirm it on a card before anything is submitted.',
  tier: 'confirm',
  requires: ['order'],
  available: hasOrderIdentity,
  input: returnInput,
  async describeAction(input, ctx) {
    let label = input.orderId
    let titles = new Map<string, string>()
    try {
      const access = await resolveOrderAccess(ctx)
      const o = access ? await findOwnOrder(input.orderId, ctx, access) : null
      if (o) {
        label = o.number ?? o.id
        titles = new Map(o.items.map((i) => [`${i.offeringId}:${i.variantId ?? ''}`, i.title]))
      }
    } catch {
      // The card still renders; ownership is enforced again in run().
    }
    const lines = input.items.map((i) => `${i.quantity} × ${titles.get(`${i.offeringId}:${i.variantId ?? ''}`) ?? i.offeringId}`)
    return {
      title: `${input.kind === 'exchange' ? 'Exchange' : 'Return'} request for order ${label}`,
      summary: `${lines.join(', ')}. Reason: ${input.reason}`,
    }
  },
  async run(input, ctx) {
    const access = await resolveOrderAccess(ctx)
    const order = access ? await findOwnOrder(input.orderId, ctx, access) : null
    if (!access || !order) throw new AIError('not_found', 'Order not found')
    for (const it of input.items) {
      const line = order.items.find((l) => l.offeringId === it.offeringId && (!it.variantId || l.variantId === it.variantId))
      if (!line || it.quantity > line.quantity) throw new AIError('validation', 'Item is not part of this order')
    }
    // Verified guests have no Payload session; the OTP proved ownership of exactly this order.
    const adapterCtx = access.mode === 'customer' ? access.adapterCtx : systemAdapterCtx(ctx)
    const res = await ctx.adapters.order!.createReturnRequest({ ...input, orderId: order.id }, adapterCtx)
    return { data: { returnId: res.id, status: res.status, orderId: order.id } }
  },
})
