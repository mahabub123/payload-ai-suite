/** Test-only fakes: in-memory Payload Local API, offering + order adapters. */
import type { Payload } from 'payload'
import type { Facets, Offering, OfferingAdapter, OfferingSummary, Order, OrderAdapter } from 'payload-ai-core'

type Doc = Record<string, any>

const get = (doc: unknown, path: string): unknown[] => {
  const parts = path.split('.')
  let cur: unknown[] = [doc]
  for (const p of parts) {
    cur = cur.flatMap((c) => {
      const v = (c as Doc | undefined)?.[p]
      return Array.isArray(v) && parts.indexOf(p) < parts.length - 1 ? v : [v]
    })
  }
  return cur
}

const matches = (doc: Doc, where: Doc | undefined): boolean => {
  if (!where) return true
  return Object.entries(where).every(([k, cond]) => {
    if (k === 'and') return (cond as Doc[]).every((w) => matches(doc, w))
    if (k === 'or') return (cond as Doc[]).some((w) => matches(doc, w))
    const values = get(doc, k)
    return Object.entries(cond as Doc).every(([op, v]) =>
      values.some((x) => {
        switch (op) {
          case 'equals':
            return x === v
          case 'in':
            return (v as unknown[]).includes(x)
          case 'greater_than':
            return String(x) > String(v)
          default:
            throw new Error(`stub: op ${op}`)
        }
      }),
    )
  })
}

export const createPayloadStub = (custom: Doc = {}) => {
  const store = new Map<string, Doc[]>()
  let seq = 0
  const col = (slug: string) => store.get(slug) ?? (store.set(slug, []), store.get(slug)!)
  const queued: Doc[] = []
  const payload = {
    config: { custom },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    store,
    queued,
    jobs: { queue: async (a: Doc) => void queued.push(a) },
    async find(a: Doc) {
      let docs = col(a.collection).filter((d) => matches(d, a.where))
      if (a.sort === '-createdAt') docs = [...docs].reverse()
      const limit = a.limit ?? 10
      const page = a.page ?? 1
      const slice = docs.slice((page - 1) * limit, page * limit)
      return { docs: slice, totalDocs: docs.length, hasNextPage: page * limit < docs.length }
    },
    async create(a: Doc) {
      const doc = { id: ++seq, createdAt: new Date(Date.now() + seq).toISOString(), ...a.data }
      col(a.collection).push(doc)
      return doc
    },
    async update(a: Doc) {
      const doc = col(a.collection).find((d) => d.id === a.id)
      Object.assign(doc!, a.data)
      return doc
    },
  }
  return payload as typeof payload & Payload
}

export const product = (id: string, title: string, o: Partial<Offering> = {}): Offering => ({
  id,
  title,
  price: { amount: 100000, currency: 'BDT' },
  inStock: true,
  categoryIds: [],
  attributes: {},
  images: [],
  status: 'published',
  ...o,
})

export const CATALOG: Offering[] = [
  product('p1', 'Red Silk Dress', { categoryIds: ['cat-dress'], attributes: { color: 'Red', size: 'M' }, price: { amount: 250000, currency: 'BDT' } }),
  product('p2', 'Blue Cotton Dress', { categoryIds: ['cat-dress'], attributes: { color: 'Blue', size: 'L' }, price: { amount: 450000, currency: 'BDT' } }),
  product('p3', 'Red Party Dress', { categoryIds: ['cat-dress'], attributes: { color: 'Red', size: 'S' }, price: { amount: 280000, currency: 'BDT' }, inStock: false }),
  product('p4', 'Graphic T-Shirt', { categoryIds: ['cat-tops'], attributes: { color: 'Black', size: 'M' }, price: { amount: 90000, currency: 'BDT' } }),
  product('p5', 'Leather Sandals', { categoryIds: ['cat-shoes'], attributes: { color: 'Brown', size: '40' }, price: { amount: 320000, currency: 'BDT' } }),
  product('p6', 'Silk Scarf', { categoryIds: ['cat-acc'], attributes: { color: 'Red' }, price: { amount: 120000, currency: 'BDT' } }),
]

const summary = (o: Offering): OfferingSummary => ({
  id: o.id,
  title: o.title,
  price: o.price,
  inStock: o.inStock,
  categoryIds: o.categoryIds,
  tags: o.tags,
})

export const FACETS: Facets = {
  categories: [
    { id: 'cat-dress', title: 'Dresses' },
    { id: 'cat-tops', title: 'Tops' },
    { id: 'cat-shoes', title: 'Shoes' },
    { id: 'cat-acc', title: 'Accessories' },
  ],
  attributes: { color: ['Red', 'Blue', 'Black', 'Brown'], size: ['S', 'M', 'L', '40'] },
  priceRange: { min: 90000, max: 450000, currency: 'BDT' },
}

export const createOfferingAdapter = (catalog: Offering[] = CATALOG): OfferingAdapter & { searches: unknown[] } => {
  const searches: unknown[] = []
  return {
    collection: 'products',
    fields: {},
    searches,
    async get(id) {
      return catalog.find((o) => o.id === id) ?? null
    },
    async search(q) {
      searches.push(q)
      const terms = (q.text ?? '').toLowerCase().split(/\s+/).filter(Boolean)
      const items = catalog
        .filter((o) => o.status !== 'draft')
        .filter((o) => !q.ids || q.ids.includes(o.id))
        .filter((o) => !terms.length || terms.some((t) => o.title.toLowerCase().includes(t)))
        .filter((o) => !q.categoryIds?.length || o.categoryIds.some((c) => q.categoryIds!.includes(c)))
        .filter((o) => q.priceMax === undefined || (o.price?.amount ?? 0) <= q.priceMax)
        .map(summary)
      return { items: items.slice(0, q.limit ?? 24), total: items.length }
    },
    async checkStock(id) {
      return { inStock: catalog.find((o) => o.id === id)?.inStock ?? false, stock: null }
    },
    async *iterate() {
      for (const o of catalog) if (o.status !== 'draft') yield o
    },
    toEmbeddingText: (o) => `${o.title}. ${Object.values(o.attributes).join(' ')}`,
    facets: async () => FACETS,
    fromDoc: (doc) => product(String(doc.id), String(doc.title ?? ''), { status: doc._status === 'draft' ? 'draft' : 'published' }),
  }
}

export const createOrderAdapter = (orders: Order[]): OrderAdapter => ({
  collection: 'orders',
  fields: {},
  async getForCustomer(id, ctx) {
    const o = orders.find((x) => x.id === id)
    return o && o.customerId === ctx.customerId ? o : null
  },
  async listForCustomer(ctx) {
    return orders.filter((o) => o.customerId === ctx.customerId)
  },
  findByNumberAndEmail: async () => null,
  async *iterate() {
    for (const o of orders) yield o
  },
  createReturnRequest: async () => ({ id: 'r1', status: 'requested' }),
})

export const order = (id: string, offeringIds: string[], customerId?: string): Order => ({
  id,
  status: 'paid',
  total: { amount: 0, currency: 'BDT' },
  createdAt: new Date().toISOString(),
  itemCount: offeringIds.length,
  customerId,
  items: offeringIds.map((offeringId) => ({ offeringId, title: offeringId, quantity: 1, price: { amount: 0, currency: 'BDT' } })),
})
