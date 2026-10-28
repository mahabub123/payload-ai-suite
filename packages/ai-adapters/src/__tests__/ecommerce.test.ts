import type { AdapterContext } from 'payload-ai-core'
import { isAIError } from 'payload-ai-core'
import { describe, expect, it } from 'vitest'
import { createAdapters } from '../createAdapters'
import { ecommerceStore, users } from './fixtures'

const setup = (opts: { permissiveOrders?: boolean; overrides?: Parameters<typeof createAdapters>[0]['overrides'] } = {}) => {
  const store = ecommerceStore(opts)
  const provider = createAdapters({ preset: 'ecommerce', overrides: opts.overrides })
  const adapters = provider.build(store.payload)
  const visitor: AdapterContext = { payload: store.payload, user: null }
  const alice: AdapterContext = { payload: store.payload, user: users.alice as never }
  const bob: AdapterContext = { payload: store.payload, user: users.bob as never }
  const system: AdapterContext = { payload: store.payload, system: true }
  return { store, provider, adapters, visitor, alice, bob, system }
}

describe('ecommerce preset: config & validation', () => {
  it('zero-config validates against the real ecommerce plugin collections', () => {
    const { provider, store } = setup()
    const byConcept = Object.fromEntries(provider.validate(store.payload).map((r) => [r.concept, r]))
    for (const c of ['offering', 'category', 'customer', 'order', 'cart', 'knowledge', 'lead'] as const) {
      expect(byConcept[c].ok, `${c}: ${byConcept[c].problems.join('; ')}`).toBe(true)
    }
    expect(byConcept.offering.collection).toBe('products')
    expect(byConcept.knowledge.collection).toBe('pages,faqs')
    expect(byConcept.lead.collection).toBe('ai-tickets')
    // No reviews collection and no booking concept in this store: disabled with a reason.
    expect(byConcept.review.ok).toBe(false)
    expect(byConcept.review.problems[0]).toMatch(/reviews/)
    expect(byConcept.booking.ok).toBe(false)
    expect(byConcept.booking.problems[0]).toMatch(/not configured/)
  })

  it('maps currency-specific fields (priceIn<CODE>) by auto-detecting the plugin currency', () => {
    const { adapters } = setup()
    expect(adapters.offering!.fields.price).toBe('priceInBDT')
    expect(adapters.offering!.fields.image).toBe('gallery.0.image')
    expect(adapters.order!.fields).toMatchObject({ total: 'amount', customer: 'customer', items: 'items', itemOffering: 'product' })
  })

  it('mappedCollections works without a Payload instance', () => {
    const { provider } = setup()
    expect(provider.mappedCollections()).toMatchObject({
      offering: ['products', 'variants'],
      order: ['orders'],
      cart: ['carts'],
      knowledge: ['pages', 'posts', 'faqs', 'policies'],
    })
  })

  it('a broken map disables only that concept, with a clear problem', () => {
    const { provider, store } = setup({ overrides: { offering: { fields: { price: 'priceInXYZ' } } } })
    const results = provider.validate(store.payload)
    const offering = results.find((r) => r.concept === 'offering')!
    expect(offering.ok).toBe(false)
    expect(offering.problems.join()).toMatch(/price -> 'priceInXYZ' not found in 'products'/)
    expect(results.find((r) => r.concept === 'order')!.ok).toBe(true)
    const built = provider.build(store.payload)
    expect(built.offering).toBeUndefined()
    expect(built.order).toBeDefined()
    expect(built.cart).toBeDefined()
  })

  it('a missing explicit collection fails loudly', () => {
    const { provider, store } = setup({ overrides: { category: { collection: 'collections' } } })
    const cat = provider.validate(store.payload).find((r) => r.concept === 'category')!
    expect(cat.ok).toBe(false)
    expect(cat.problems[0]).toMatch(/'collections' not found/)
  })

  it('a concept can be switched off', () => {
    const { provider, store } = setup({ overrides: { cart: false } })
    expect(provider.build(store.payload).cart).toBeUndefined()
  })
})

describe('ecommerce preset: offering', () => {
  it('maps fields: rich text, upload URL, categories, variants, minor-unit prices', async () => {
    const { adapters, visitor } = setup()
    const tee = await adapters.offering!.get('p1', visitor)
    expect(tee).toMatchObject({
      id: 'p1',
      title: 'Cotton Tee',
      slug: 'cotton-tee',
      url: '/products/cotton-tee',
      imageUrl: 'https://shop.test/media/tee.jpg',
      categoryIds: ['c1'],
      price: { amount: 150000, currency: 'BDT' },
      stock: 3,
      inStock: true,
      status: 'published',
    })
    expect(tee!.description).toBe('Soft cotton tee.\nCare')
    expect(tee!.variants).toEqual([
      { id: 'v1', title: 'Tee M', price: { amount: 150000, currency: 'BDT' }, stock: 3, inStock: true, options: { Size: 'M' } },
      { id: 'v2', title: 'Tee L', price: { amount: 160000, currency: 'BDT' }, stock: 0, inStock: false, options: { Size: 'L' } },
    ])
    expect(adapters.offering!.toEmbeddingText(tee!)).toContain('Size: M, L')
  })

  it('skips drafts in get, search and iterate', async () => {
    const { adapters, visitor, system } = setup()
    expect(await adapters.offering!.get('p3', visitor)).toBeNull()
    expect(await adapters.offering!.get('p3', system)).toBeNull()
    const res = await adapters.offering!.search({ text: 'hoodie' }, visitor)
    expect(res.items).toHaveLength(0)
    const ids: string[] = []
    for await (const o of adapters.offering!.iterate({}, system)) ids.push(o.id)
    expect(ids.sort()).toEqual(['p1', 'p2', 'p4'])
  })

  it('search filters by text, category, price (minor units), stock and sorts', async () => {
    const { adapters, visitor } = setup()
    expect((await adapters.offering!.search({ text: 'jeans' }, visitor)).items.map((i) => i.id)).toEqual(['p2'])
    expect((await adapters.offering!.search({ categoryIds: ['c1'] }, visitor)).items.map((i) => i.id)).toEqual(['p1'])
    const cheap = await adapters.offering!.search({ priceMax: 200000, sort: 'price-asc' }, visitor)
    expect(cheap.items.map((i) => i.id)).toEqual(['p4', 'p1'])
    const inStock = await adapters.offering!.search({ inStock: true, sort: 'price-desc' }, visitor)
    expect(inStock.items.map((i) => i.id)).toEqual(['p2', 'p1'])
  })

  it('checkStock for products and variants', async () => {
    const { adapters, visitor } = setup()
    expect(await adapters.offering!.checkStock('p1', 'v2', visitor)).toEqual({ inStock: false, stock: 0 })
    expect(await adapters.offering!.checkStock('p1', 'v1', visitor)).toEqual({ inStock: true, stock: 3 })
    expect(await adapters.offering!.checkStock('p2', undefined, visitor)).toEqual({ inStock: true, stock: 5 })
    expect(await adapters.offering!.checkStock('p3', undefined, visitor)).toEqual({ inStock: false, stock: 0 })
  })

  it('facets come from real catalog values', async () => {
    const { adapters, visitor } = setup()
    const facets = await adapters.offering!.facets(visitor)
    expect(facets.categories.map((c) => c.title)).toEqual(['Pants', 'Shirts'])
    expect(facets.attributes.Size).toEqual(['L', 'M'])
    expect(facets.priceRange).toEqual({ min: 50000, max: 320000, currency: 'BDT' })
  })

  it('uses overrideAccess:false with the caller user on shopper requests', async () => {
    const { adapters, alice, store } = setup()
    store.reset()
    await adapters.offering!.get('p1', alice)
    await adapters.offering!.search({ text: 'tee' }, alice)
    await adapters.offering!.checkStock('p1', 'v1', alice)
    await adapters.order!.listForCustomer(alice)
    await adapters.cart!.get(alice)
    await adapters.knowledge!.toKnowledgeDoc('faqs', { id: 'f1', question: 'q' }, alice)
    expect(store.calls.length).toBeGreaterThan(4)
    for (const call of store.calls) {
      expect(call.overrideAccess, `${call.op} ${call.collection}`).toBe(false)
      expect(call.user).toEqual(users.alice)
    }
  })

  it('scopes by tenant when ctx.tenant is set', async () => {
    const { adapters, visitor, store } = setup()
    const t1 = { ...visitor, tenant: 't1' }
    const res = await adapters.offering!.search({}, t1)
    expect(res.items.map((i) => i.id).sort()).toEqual(['p1', 'p2'])
    expect(await adapters.offering!.get('p4', t1)).toBeNull()
    expect(await adapters.offering!.get('p4', { ...visitor, tenant: 't2' })).not.toBeNull()
    expect(JSON.stringify(store.calls.at(-1)!.where)).toContain('"tenant":{"equals":"t2"}')
  })
})

describe('ecommerce preset: orders', () => {
  it('returns the own order with items priced from variants, in minor units', async () => {
    const { adapters, alice } = setup()
    const order = await adapters.order!.getForCustomer('ord1', alice)
    expect(order).toMatchObject({
      id: 'ord1',
      number: 'ord1',
      status: 'processing',
      total: { amount: 300000, currency: 'BDT' },
      customerId: 'u1',
      customerEmail: 'alice@example.com',
      itemCount: 2,
    })
    expect(order!.items).toEqual([
      { offeringId: 'p1', variantId: 'v1', title: 'Cotton Tee — Tee M', quantity: 2, price: { amount: 150000, currency: 'BDT' } },
    ])
  })

  it("never returns another customer's order, even if access control would allow it", async () => {
    const { adapters, alice, bob, visitor, system } = setup({ permissiveOrders: true })
    expect(await adapters.order!.getForCustomer('ord1', bob)).toBeNull()
    expect(await adapters.order!.getForCustomer('ord2', alice)).toBeNull()
    expect(await adapters.order!.getForCustomer('ord1', visitor)).toBeNull()
    expect(await adapters.order!.getForCustomer('ord1', system)).toBeNull()
    expect(await adapters.order!.getForCustomer('ord1', { ...system, customerId: 'u1' })).not.toBeNull()
    expect((await adapters.order!.listForCustomer(bob)).map((o) => o.id)).toEqual(['ord2'])
  })

  it('findByNumberAndEmail is system-only and checks the email', async () => {
    const { adapters, alice, system } = setup()
    await expect(adapters.order!.findByNumberAndEmail('ord1', 'alice@example.com', alice)).rejects.toMatchObject({ code: 'forbidden' })
    expect(await adapters.order!.findByNumberAndEmail('ord1', 'ALICE@example.com ', system)).toMatchObject({ id: 'ord1' })
    expect(await adapters.order!.findByNumberAndEmail('ord1', 'bob@example.com', system)).toBeNull()
  })

  it('iterates orders in a period', async () => {
    const { adapters, system } = setup()
    const ids: string[] = []
    for await (const o of adapters.order!.iterate({ from: new Date('2026-03-02T00:00:00Z') }, system)) ids.push(o.id)
    expect(ids).toEqual(['ord2'])
  })

  it('createReturnRequest files an ai-tickets document for the owner only', async () => {
    const { adapters, alice, bob, store } = setup()
    const res = await adapters.order!.createReturnRequest(
      { orderId: 'ord1', items: [{ offeringId: 'p1', variantId: 'v1', quantity: 1 }], reason: 'Too small', kind: 'exchange' },
      { ...alice, tenant: 't1' },
    )
    expect(res.status).toBe('open')
    const ticket = store.db.get('ai-tickets')![0]
    expect(ticket).toMatchObject({
      source: 'assistant',
      topic: 'exchange',
      customerId: 'u1',
      customerEmail: 'alice@example.com',
      linkedOrderId: 'ord1',
      status: 'open',
      tenant: 't1',
      subject: 'Exchange request for order #ord1',
    })
    expect(ticket.transcript).toMatchObject({ reason: 'Too small', items: [{ offeringId: 'p1', quantity: 1, title: 'Cotton Tee — Tee M' }] })
    // Ownership is verified with caller access first; ai-tickets (staff-only create) is then written as system.
    expect(store.calls.find((c) => c.op === 'create')!.overrideAccess).toBe(true)

    const err = await adapters.order!
      .createReturnRequest({ orderId: 'ord1', items: [{ offeringId: 'p1', quantity: 1 }], reason: 'x', kind: 'return' }, bob)
      .catch((e: unknown) => e)
    expect(isAIError(err) && err.code).toBe('not_found')
    await expect(
      adapters.order!.createReturnRequest({ orderId: 'ord1', items: [{ offeringId: 'p1', quantity: 5 }], reason: 'x', kind: 'return' }, alice),
    ).rejects.toMatchObject({ code: 'validation' })
  })
})

describe('ecommerce preset: cart, customer, knowledge, lead', () => {
  it('adds items to the customer cart, requiring a variant for variant products', async () => {
    const { adapters, alice, store } = setup()
    await expect(adapters.cart!.addItem({ offeringId: 'p1', quantity: 1 }, alice)).rejects.toMatchObject({ code: 'validation' })
    await expect(adapters.cart!.addItem({ offeringId: 'p1', variantId: 'v2', quantity: 1 }, alice)).rejects.toMatchObject({ code: 'conflict' })
    await expect(adapters.cart!.addItem({ offeringId: 'p3', quantity: 1 }, alice)).rejects.toMatchObject({ code: 'not_found' })
    const c1 = await adapters.cart!.addItem({ offeringId: 'p1', variantId: 'v1', quantity: 1 }, alice)
    const c2 = await adapters.cart!.addItem({ offeringId: 'p1', variantId: 'v1', quantity: 2 }, alice)
    expect(c2.id).toBe(c1.id)
    expect(c2.items).toEqual([
      { offeringId: 'p1', variantId: 'v1', title: 'Cotton Tee — Tee M', quantity: 3, price: { amount: 150000, currency: 'BDT' } },
    ])
    const stored = store.db.get('carts')![0]
    expect(stored).toMatchObject({ customer: 'u1', currency: 'BDT', items: [{ product: 'p1', variant: 'v1', quantity: 3 }] })
    expect((await adapters.cart!.get(alice))!.id).toBe(c1.id)
    expect(await adapters.cart!.get({ ...alice, user: users.bob as never, cartId: c1.id })).toBeNull()
  })

  it('customer.current resolves the logged-in customer', async () => {
    const { adapters, alice, visitor } = setup()
    expect(await adapters.customer!.current(alice)).toMatchObject({ id: 'u1', email: 'alice@example.com', name: 'Alice' })
    expect(await adapters.customer!.current(visitor)).toBeNull()
  })

  it('customer iteration excludes staff (role filter)', async () => {
    const { adapters, system } = setup()
    const ids: string[] = []
    for await (const c of adapters.customer!.iterate({}, system)) ids.push(c.id)
    expect(ids).toEqual(['u1', 'u2'])
  })

  it('knowledge: published only, Lexical + blocks flattened, localized title, visibility', async () => {
    const { adapters, system } = setup()
    const docs = []
    for await (const d of adapters.knowledge!.iterate({}, { ...system, locale: 'bn' })) docs.push(d)
    expect(docs.map((d) => d.sourceId)).toEqual(['pg1', 'pg3', 'f1'])
    expect(docs[0]).toMatchObject({
      sourceCollection: 'pages',
      title: 'শিপিং নীতি',
      text: 'We ship in 3 days.\n\nFree returns within 7 days',
      url: '/shipping',
      visibility: 'public',
    })
    expect(docs[1].visibility).toBe('staff')
    expect(docs[2]).toMatchObject({ title: 'Do you ship abroad?', text: 'Not yet.' })
    expect(adapters.knowledge!.toKnowledgeDoc('pages', { id: 'x', _status: 'draft', title: 'Draft' }, system)).toBeNull()
  })

  it('lead.create files an ai-tickets lead', async () => {
    const { adapters, visitor, store } = setup()
    await adapters.lead!.create({ email: 'lead@example.com', message: 'Bulk order?', source: 'assistant' }, visitor)
    expect(store.db.get('ai-tickets')![0]).toMatchObject({
      topic: 'lead',
      status: 'open',
      subject: 'Bulk order?',
      customerEmail: 'lead@example.com',
      source: 'assistant',
    })
  })
})
