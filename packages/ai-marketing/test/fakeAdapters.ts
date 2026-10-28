import type { AdapterSet, Cart, Customer, Offering, Order } from 'payload-ai-core'

const DAY = 86_400_000
export const daysAgo = (n: number, now = Date.now()) => new Date(now - n * DAY).toISOString()

export interface FakeData {
  customers: Customer[]
  orders: Order[]
  offerings: Offering[]
  carts?: Cart[]
}

const order = (id: string, customerId: string, at: string, amount: number, offeringIds: string[]): Order => ({
  id,
  number: `#${id}`,
  status: 'completed',
  total: { amount, currency: 'USD' },
  createdAt: at,
  itemCount: offeringIds.length,
  customerId,
  items: offeringIds.map((o) => ({ offeringId: o, title: o, quantity: 1, price: { amount: 1000, currency: 'USD' } })),
})

const offering = (id: string, categoryIds: string[], extra: Partial<Offering> = {}): Offering => ({
  id,
  title: `Product ${id}`,
  url: `https://shop.test/p/${id}`,
  price: { amount: 2500, currency: 'USD' },
  inStock: true,
  categoryIds,
  attributes: {},
  images: [],
  ...extra,
})

export const sampleData = (): FakeData => ({
  customers: [
    { id: 'c1', email: 'alice@example.com', name: 'Alice', marketingOptIn: true, createdAt: daysAgo(400) },
    { id: 'c2', email: 'bob@example.com', name: 'Bob', marketingOptIn: true, createdAt: daysAgo(200) },
    { id: 'c3', email: 'carol@example.com', name: 'Carol', marketingOptIn: false, createdAt: daysAgo(100) },
    { id: 'c4', email: 'dan@example.com', name: 'Dan', marketingOptIn: true, createdAt: daysAgo(2) },
  ],
  orders: [
    order('o1', 'c1', daysAgo(10), 50_000, ['shoe-1']),
    order('o2', 'c1', daysAgo(40), 20_000, ['shirt-1']),
    order('o3', 'c2', daysAgo(120), 10_000, ['shoe-1']),
    order('o4', 'c3', daysAgo(5), 90_000, ['shirt-1', 'shoe-1']),
  ],
  offerings: [offering('shoe-1', ['shoes']), offering('shirt-1', ['shirts'])],
})

export const createFakeAdapters = (data: FakeData): AdapterSet => ({
  customer: {
    collection: 'customers',
    fields: {},
    current: async () => null,
    get: async (id) => data.customers.find((c) => c.id === id) ?? null,
    findByEmail: async (e) => data.customers.find((c) => c.email === e) ?? null,
    async *iterate() {
      yield* data.customers
    },
  },
  order: {
    collection: 'orders',
    fields: {},
    getForCustomer: async (id, ctx) => data.orders.find((o) => o.id === id && o.customerId === ctx.customerId) ?? null,
    listForCustomer: async () => [],
    findByNumberAndEmail: async () => null,
    async *iterate(opts) {
      for (const o of data.orders) {
        const t = Date.parse(o.createdAt)
        if (opts.from && t < opts.from.getTime()) continue
        if (opts.to && t > opts.to.getTime()) continue
        yield o
      }
    },
    createReturnRequest: async () => ({ id: 'r1', status: 'requested' }),
  },
  offering: {
    collection: 'products',
    fields: {},
    get: async (id) => data.offerings.find((o) => o.id === id) ?? null,
    search: async (q) => {
      const items = data.offerings.filter((o) => (!q.ids || q.ids.includes(o.id)) && (q.inStock ? o.inStock : true))
      return { items: items.slice(0, q.limit ?? 24), total: items.length }
    },
    checkStock: async () => ({ inStock: true, stock: null }),
    async *iterate() {
      yield* data.offerings
    },
    toEmbeddingText: (o) => o.title,
    facets: async () => ({ categories: [], attributes: {} }),
    fromDoc: (d) => d as unknown as Offering,
  },
  category: {
    collection: 'categories',
    fields: {},
    list: async () => [
      { id: 'shoes', title: 'Shoes' },
      { id: 'shirts', title: 'Shirts' },
    ],
    get: async () => null,
  },
  cart: {
    collection: 'carts',
    fields: {},
    get: async () => null,
    addItem: async () => {
      throw new Error('not used')
    },
    listAbandoned: async (opts) => (data.carts ?? []).filter((c) => !c.updatedAt || Date.parse(c.updatedAt) < opts.olderThan.getTime()),
  },
})
