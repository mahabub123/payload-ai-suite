import type { AdapterContext } from '@payload-ai-suite/ai-core'
import { describe, expect, it } from 'vitest'
import { createAdapters } from '../createAdapters'
import { createFakePayload } from '../testing/fakePayload'
import type { FakeCollection } from '../testing/fakePayload'
import { lexical } from './fixtures'

describe('content preset', () => {
  const collections: FakeCollection[] = [
    { slug: 'users', auth: true, fields: [{ name: 'name', type: 'text' }] },
    { slug: 'categories', fields: [{ name: 'title', type: 'text' }] },
    { slug: 'pages', versions: { drafts: true }, fields: [{ name: 'title', type: 'text' }, { name: 'slug', type: 'text' }, { name: 'content', type: 'richText' }] },
    { slug: 'posts', versions: { drafts: true }, fields: [{ name: 'title', type: 'text' }, { name: 'slug', type: 'text' }, { name: 'content', type: 'richText' }] },
    { slug: 'faqs', fields: [{ name: 'question', type: 'text' }, { name: 'answer', type: 'richText' }] },
    { slug: 'authors', fields: [{ name: 'name', type: 'text' }, { name: 'slug', type: 'text' }, { name: 'bio', type: 'textarea' }] },
  ]
  const store = createFakePayload({
    collections,
    data: {
      posts: [
        { id: 'po1', title: 'Hello', slug: 'hello', content: lexical('First post.'), _status: 'published' },
        { id: 'po2', title: 'WIP', slug: 'wip', content: lexical('Not yet.'), _status: 'draft' },
      ],
      authors: [{ id: 'a1', name: 'Rahim', slug: 'rahim', bio: 'Writes about tea.' }],
    },
  })
  const provider = createAdapters({ preset: 'content' })

  it('has no offering and indexes pages/posts/faqs/authors', async () => {
    const results = Object.fromEntries(provider.validate(store.payload).map((r) => [r.concept, r]))
    expect(results.offering.ok).toBe(false)
    expect(results.offering.problems[0]).toMatch(/not configured for preset 'content'/)
    expect(results.knowledge).toMatchObject({ ok: true, collection: 'pages,posts,faqs,authors' })
    const adapters = provider.build(store.payload)
    expect(adapters.offering).toBeUndefined()
    const docs = []
    for await (const d of adapters.knowledge!.iterate({}, { payload: store.payload, system: true })) docs.push(d)
    expect(docs).toEqual([
      expect.objectContaining({ sourceId: 'po1', title: 'Hello', text: 'First post.', url: '/posts/hello' }),
      expect.objectContaining({ sourceId: 'a1', title: 'Rahim', text: 'Writes about tea.', url: '/authors/rahim' }),
    ])
  })
})

describe('custom mapping', () => {
  const collections: FakeCollection[] = [
    { slug: 'media', upload: true, fields: [] },
    {
      slug: 'products',
      fields: [
        { name: 'name', type: 'text' },
        { name: 'priceBDT', type: 'number' },
        { name: 'gallery', type: 'upload', relationTo: 'media', hasMany: true },
        { name: 'details', type: 'group', fields: [{ type: 'row', fields: [{ name: 'material', type: 'text' }] }] },
      ],
    },
    { slug: 'enquiries', fields: [{ name: 'fullName', type: 'text' }, { name: 'email', type: 'email' }, { name: 'body', type: 'textarea' }] },
    { slug: 'pages', fields: [{ name: 'title', type: 'text' }, { name: 'content', type: 'richText' }] },
    { slug: 'faqs', fields: [{ name: 'question', type: 'text' }, { name: 'answer', type: 'richText' }] },
    { slug: 'policies', fields: [{ name: 'title', type: 'text' }, { name: 'text', type: 'richText' }] },
  ]
  const store = createFakePayload({
    collections,
    data: {
      media: [{ id: 'm1', url: 'https://cdn.test/a.jpg' }],
      products: [{ id: 'x1', name: 'Jamdani Saree', priceBDT: 1250000, gallery: ['m1'], details: { material: 'Cotton' } }],
    },
  })
  const ctx: AdapterContext = { payload: store.payload, user: null }

  it('the DESIGN §3 example maps offering fields and knowledge collections', async () => {
    const provider = createAdapters({
      preset: 'ecommerce',
      overrides: {
        offering: {
          collection: 'products',
          fields: { title: 'name', price: 'priceBDT', image: 'gallery.0' },
          currency: 'BDT',
          attributes: { material: 'details.material' },
        },
        knowledge: { collections: ['pages', 'faqs', 'policies'] },
      },
    })
    const r = Object.fromEntries(provider.validate(store.payload).map((x) => [x.concept, x]))
    expect(r.offering.ok).toBe(true)
    expect(r.knowledge.ok).toBe(true)
    const a = provider.build(store.payload)
    const p = await a.offering!.get('x1', ctx)
    expect(p).toMatchObject({
      title: 'Jamdani Saree',
      price: { amount: 1250000, currency: 'BDT' },
      imageUrl: 'https://cdn.test/a.jpg',
      attributes: { material: 'Cotton' },
      stock: null,
      inStock: true,
    })
    expect((await a.offering!.search({ attributes: { material: 'Cotton' } }, ctx)).total).toBe(1)
  })

  it("preset 'custom' builds only the concepts in the map; typos fail loudly", async () => {
    const provider = createAdapters({
      preset: 'custom',
      custom: {
        offering: { collection: 'products', fields: { title: 'name', price: 'priceBDT', image: 'galery.0' }, currency: 'BDT' },
        lead: { collection: 'enquiries', fields: { name: 'fullName', email: 'email', message: 'body' } },
      },
    })
    const r = Object.fromEntries(provider.validate(store.payload).map((x) => [x.concept, x]))
    expect(r.offering.ok).toBe(false)
    expect(r.offering.problems).toEqual(["offering: field image -> 'galery.0' not found in 'products'"])
    expect(r.lead.ok).toBe(true)
    expect(r.customer.problems[0]).toMatch(/not configured/)
    const a = provider.build(store.payload)
    expect(Object.keys(a)).toEqual(['lead'])
    await a.lead!.create({ name: 'Sumi', email: 's@example.com', message: 'Price for 10?', source: 'assistant' }, ctx)
    expect(store.db.get('enquiries')![0]).toMatchObject({ fullName: 'Sumi', email: 's@example.com', body: 'Price for 10?' })
  })

  it('requires a map for preset custom', () => {
    expect(() => createAdapters({ preset: 'custom' })).toThrow(/custom/)
  })
})
