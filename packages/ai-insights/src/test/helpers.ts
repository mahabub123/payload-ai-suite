import type { Payload } from 'payload'
import type { AdapterContext, AdapterSet, Cart, Order, OrderAdapter, CartAdapter } from 'payload-ai-core'

export const order = (id: string, createdAt: string, amount: number, opts: Partial<Order> = {}): Order => ({
  id,
  status: 'paid',
  total: { amount, currency: 'BDT' },
  createdAt,
  itemCount: opts.items?.length ?? 1,
  items: [{ offeringId: 'p1', title: 'Shirt', quantity: 1, price: { amount, currency: 'BDT' } }],
  ...opts,
})

export const fakeOrderAdapter = (orders: Order[], seen: AdapterContext[] = []): OrderAdapter => ({
  collection: 'orders',
  fields: {},
  getForCustomer: async () => null,
  listForCustomer: async () => [],
  findByNumberAndEmail: async () => null,
  createReturnRequest: async () => ({ id: 'r', status: 'open' }),
  async *iterate(opts, ctx) {
    seen.push(ctx)
    for (const o of orders) {
      const t = Date.parse(o.createdAt)
      if (opts.from && t < opts.from.getTime()) continue
      if (opts.to && t >= opts.to.getTime()) continue
      if (ctx.tenant !== undefined && (o as Order & { tenant?: string }).tenant !== ctx.tenant) continue
      yield o
    }
  },
})

export const fakeCartAdapter = (carts: Cart[], seen: AdapterContext[] = []): CartAdapter => ({
  collection: 'carts',
  fields: {},
  get: async () => null,
  addItem: async () => carts[0],
  listAbandoned: async (opts, ctx) => {
    seen.push(ctx)
    return carts.filter((c) => !c.updatedAt || Date.parse(c.updatedAt) < opts.olderThan.getTime())
  },
})

type Doc = Record<string, any>

/** Minimal in-memory Local API: find (equals / in / greater_than_equal / less_than / and), create, update. */
export const fakePayload = (opts: { collections?: string[]; tenantField?: string; data?: Record<string, Doc[]> } = {}) => {
  const store: Record<string, Doc[]> = { ...(opts.data ?? {}) }
  for (const c of opts.collections ?? []) store[c] ??= []
  const finds: { collection: string; where: unknown }[] = []
  const emails: any[] = []
  let seq = 0
  const match = (d: Doc, w: any): boolean => {
    if (!w) return true
    if (w.and) return w.and.every((x: any) => match(d, x))
    return Object.entries(w).every(([k, cond]: [string, any]) => {
      const v = d[k]
      if ('equals' in cond) return v === cond.equals
      if ('in' in cond) return cond.in.includes(v)
      if ('greater_than_equal' in cond) return String(v) >= String(cond.greater_than_equal)
      if ('less_than' in cond) return String(v) < String(cond.less_than)
      return true
    })
  }
  const payload = {
    config: { custom: { aiSuite: { coreInstalled: true, modules: [], options: opts.tenantField ? { tenant: { field: opts.tenantField } } : {} } } },
    collections: Object.fromEntries(Object.keys(store).map((k) => [k, { config: { slug: k } }])),
    logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
    async find({ collection, where, limit = 10, page = 1 }: any) {
      finds.push({ collection, where })
      const all = (store[collection] ?? []).filter((d) => match(d, where))
      const docs = all.slice((page - 1) * limit, page * limit)
      return { docs, hasNextPage: page * limit < all.length, totalDocs: all.length }
    },
    async create({ collection, data }: any) {
      const doc = { id: `doc_${++seq}`, createdAt: new Date().toISOString(), ...data }
      ;(store[collection] ??= []).push(doc)
      return doc
    },
    async update({ collection, id, data }: any) {
      const d = store[collection].find((x) => x.id === id)!
      Object.assign(d, data)
      return d
    },
    async sendEmail(m: any) {
      emails.push(m)
    },
  }
  return { payload: payload as unknown as Payload, store, finds, emails }
}

export const adapters = (orders: Order[], carts: Cart[] = [], seen: AdapterContext[] = []): AdapterSet => ({
  order: fakeOrderAdapter(orders, seen),
  cart: fakeCartAdapter(carts, seen),
})
