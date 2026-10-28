import { createHmac } from 'node:crypto'
import type { CollectionConfig } from 'payload'
import { setAI } from 'payload-ai-core'
import type { AIContext, AdapterSet, Order, Review } from 'payload-ai-core'
import { createFakeServices, createTestContext, fakeEmbedding, type FakeServices } from 'payload-ai-core/testing'
import { reviewFlagsCollection, reviewInsightsCollection } from '../src/collections'
import { resolveOptions, type AiSupportOptions } from '../src/options'
import { supportPrompts } from '../src/prompts'
import { createFakePayload, type FakePayload } from './fakePayload'

/** Stand-in for the core-owned collection (only what the tests need). */
export const ticketsCollection = (): CollectionConfig => ({
  slug: 'ai-tickets',
  fields: [
    { name: 'subject', type: 'text' },
    { name: 'status', type: 'select', options: ['open', 'pending', 'solved', 'closed'] },
  ],
})

export const order: Order = {
  id: 'ord-1',
  number: '1001',
  status: 'shipped',
  total: { amount: 450000, currency: 'BDT' },
  createdAt: '2026-10-20T10:00:00Z',
  itemCount: 1,
  customerId: 'cust-1',
  customerEmail: 'rina@example.com',
  items: [{ offeringId: 'p1', title: 'Saree', quantity: 1, price: { amount: 450000, currency: 'BDT' } }],
  shipping: { status: 'in transit', carrier: 'Pathao', trackingNumber: 'PX1', eta: '2026-10-30' },
}

export const setup = (opts: AiSupportOptions = {}, reviews: Review[] = []) => {
  const held: Record<string, boolean> = {}
  const adapters: AdapterSet = {
    order: {
      collection: 'orders',
      fields: {},
      getForCustomer: async (id, ctx) => (id === order.id && ctx.customerId === order.customerId ? order : null),
      listForCustomer: async () => [],
      findByNumberAndEmail: async (n, e) => (n === order.number && e === order.customerEmail ? order : null),
      async *iterate() {
        yield order
      },
      createReturnRequest: async () => ({ id: 'r', status: 'x' }),
    },
    review: {
      collection: 'reviews',
      fields: { body: 'comment', offeringId: 'product' },
      listForOffering: async () => reviews,
      async *iterate() {
        yield* reviews
      },
      setHeld: async (id, h) => {
        held[id] = h
      },
    },
  }
  const services: FakeServices = createFakeServices({ adapters })
  services.crypto = { ...services.crypto, hashId: (s) => createHmac('sha256', 'k').update(s).digest('hex') }
  for (const p of supportPrompts) services.prompts.registerDefault(p, 'support')
  const options = resolveOptions(opts)
  const payload: FakePayload = createFakePayload([ticketsCollection(), reviewInsightsCollection, reviewFlagsCollection], ['reviews'])
  setAI(payload, services)

  const addPolicy = async (id: string, title: string, content: string) =>
    services.vectors.upsert('ai_knowledge', [{ id, content, embedding: fakeEmbedding(content), fields: { title, sourceCollection: 'policies', sourceId: id } }], { model: 'mock' })

  const createTicket = async (data: Record<string, unknown>) =>
    (await payload.create({ collection: 'ai-tickets' as never, data: { status: 'open', source: 'form', ...data } as never })) as unknown as { id: string }

  const ticket = (id: string) => payload.db_.get('ai-tickets')!.get(String(id))!

  const staff = (id = 'agent-1'): AIContext =>
    createTestContext({ payload, module: 'support', surface: 'admin', adapters, actor: { kind: 'staff', roles: ['support'], user: { id, collection: 'users' } as never } })
  const req = (userId: string, routeParams: Record<string, unknown> = {}) => ({ payload, user: { id: userId, collection: 'users' }, routeParams }) as never

  return { adapters, services, options, payload, held, addPolicy, createTicket, ticket, staff, req }
}
