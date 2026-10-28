import { TICKETS_COLLECTION } from '../presets'
import type { AdapterContext, Order, OrderAdapter, OrderSummary } from '@payload-ai-suite/ai-core'
import { AIError } from '@payload-ai-suite/ai-core'
import type { Where } from 'payload'
import { create, find, findOne, iterateDocs, ownerId } from '../local'
import type { Doc } from '../mapping/values'
import { getPath, relDoc, relId, setPath, toIso, toStr } from '../mapping/values'
import type { Resolution, ResolveEnv } from '../resolve'
import type { ReturnsConfig } from '../types'
import type { PriceSpec } from './common'
import { clampLimit, money, orNull, reader } from './common'
import { lineItems } from './lineItems'
import type { OfferingInternals } from './offering'

export const createOrderAdapter = (env: ResolveEnv, r: Resolution, deps: { offering?: OfferingInternals } = {}): OrderAdapter => {
  const t = r.main!
  const f = t.fields
  const rt = r.extra.returns
  const o = r.options as { currency: string; priceUnit?: 'minor' | 'major'; currencyDecimals?: number; returns?: ReturnsConfig }
  const price: PriceSpec = { currency: o.currency, unit: o.priceUnit ?? 'minor', decimals: o.currencyDecimals ?? 2 }

  const customerIdOf = (doc: Doc) => relId(getPath(doc, f.customer))

  const fromDoc = (doc: Doc, ctx: AdapterContext): Order => {
    const read = reader(env, t, ctx)
    const currency = read(doc, 'currency')
    const items = lineItems(env, t, doc, ctx, price, deps.offering, currency)
    const customer = relDoc(read(doc, 'customer'))
    const shipping = {
      status: toStr(read(doc, 'shippingStatus')),
      carrier: toStr(read(doc, 'carrier')),
      trackingNumber: toStr(read(doc, 'trackingNumber')),
      trackingUrl: toStr(read(doc, 'trackingUrl')),
      eta: toIso(read(doc, 'eta')),
    }
    const hasShipping = Object.values(shipping).some((v) => v !== undefined)
    return {
      id: String(doc.id),
      number: toStr(read(doc, 'number')) ?? String(doc.id),
      status: toStr(read(doc, 'status')) ?? 'unknown',
      total: money(read(doc, 'total'), price, currency) ?? { amount: 0, currency: toStr(currency) || price.currency },
      createdAt: toIso(read(doc, 'createdAt') ?? doc.createdAt) ?? '',
      itemCount: items.reduce((s, i) => s + i.quantity, 0),
      customerId: customerIdOf(doc),
      customerEmail: toStr(read(doc, 'customerEmail')) ?? toStr(customer?.email),
      items: items.map((i) => ({ ...i, price: i.price ?? { amount: 0, currency: price.currency } })),
      paymentStatus: toStr(read(doc, 'paymentStatus')),
      shipping: hasShipping ? shipping : undefined,
    }
  }

  const summary = (ord: Order): OrderSummary => ({
    id: ord.id,
    number: ord.number,
    status: ord.status,
    total: ord.total,
    createdAt: ord.createdAt,
    itemCount: ord.itemCount,
  })

  const adapter: OrderAdapter = {
    collection: t.collection,
    fields: { ...f },

    async getForCustomer(orderId, ctx) {
      const owner = ownerId(ctx)
      if (!owner || !orderId) return null
      const doc = await orNull(findOne(t, orderId, ctx, { depth: 1, where: { [f.customer]: { equals: owner } } }))
      // Explicit ownership check on top of access control and the query filter.
      if (!doc || customerIdOf(doc) !== owner) return null
      return fromDoc(doc, ctx)
    },

    async listForCustomer(ctx, opts) {
      const owner = ownerId(ctx)
      if (!owner) return []
      const res = await find(t, ctx, {
        where: { [f.customer]: { equals: owner } },
        sort: `-${f.createdAt ?? 'createdAt'}`,
        limit: clampLimit(opts?.limit, 10),
        depth: 1,
      })
      return res.docs.filter((d) => customerIdOf(d) === owner).map((d) => summary(fromDoc(d, ctx)))
    },

    async findByNumberAndEmail(number, email, ctx) {
      if (!ctx.system) throw new AIError('forbidden', 'findByNumberAndEmail is a system-only lookup')
      const num = number.trim().replace(/^#/, '')
      const wanted = email.trim().toLowerCase()
      if (!num || !wanted) return null
      const where: Where = f.number ? { [f.number]: { equals: num } } : { id: { equals: num } }
      const res = await orNull(find(t, ctx, { where, limit: 5, depth: 1 }))
      for (const doc of res?.docs ?? []) {
        const ord = fromDoc(doc, ctx)
        if (ord.customerEmail?.toLowerCase() === wanted) return ord
      }
      return null
    },

    async *iterate(opts, ctx) {
      const field = f.createdAt ?? 'createdAt'
      const range: Record<string, string> = {}
      if (opts.from) range.greater_than_equal = opts.from.toISOString()
      if (opts.to) range.less_than = opts.to.toISOString()
      for await (const doc of iterateDocs(t, ctx, {
        where: Object.keys(range).length ? { [field]: range } : undefined,
        batchSize: opts.batchSize,
        depth: 1,
        sort: field,
      }))
        yield fromDoc(doc, ctx)
    },

    async createReturnRequest(input, ctx) {
      const order = await adapter.getForCustomer(input.orderId, ctx)
      if (!order) throw new AIError('not_found', 'Order not found')
      if (!input.items?.length) throw new AIError('validation', 'Select at least one item')
      for (const it of input.items) {
        const line = order.items.find((i) => i.offeringId === it.offeringId && (!it.variantId || i.variantId === it.variantId))
        if (!line) throw new AIError('validation', `Item ${it.offeringId} is not part of order ${order.number}`)
        if (!(it.quantity >= 1) || it.quantity > line.quantity)
          throw new AIError('validation', `Invalid quantity for ${line.title}`)
      }
      if (!rt) throw new AIError('unavailable', 'Return requests are not configured')
      const cfg = o.returns ?? {}
      let data: Doc
      if (cfg.toData) data = cfg.toData(input, order, ctx)
      else {
        const label = input.kind === 'exchange' ? 'Exchange' : 'Return'
        const values: Record<string, unknown> = {
          source: 'assistant',
          subject: `${label} request for order #${order.number}`,
          customerId: order.customerId,
          customerEmail: order.customerEmail,
          linkedOrderId: order.id,
          topic: input.kind,
          transcript: {
            kind: input.kind,
            reason: input.reason,
            orderNumber: order.number,
            items: input.items.map((it) => ({
              ...it,
              title: order.items.find((i) => i.offeringId === it.offeringId)?.title,
            })),
          },
          status: 'open',
        }
        data = {}
        for (const [key, path] of Object.entries(rt.fields)) if (values[key] !== undefined) setPath(data, path, values[key])
        Object.assign(data, cfg.data)
      }
      // ai-tickets only allows staff to create; ownership is verified above, so default to system there.
      const createAs = cfg.createAs ?? (rt.collection === TICKETS_COLLECTION ? 'system' : 'caller')
      const doc = await create(rt, data, ctx, { asSystem: createAs === 'system' })
      return { id: String(doc.id), status: toStr(rt.fields.status ? getPath(doc, rt.fields.status) : undefined) ?? 'open' }
    },
  }
  return adapter
}
