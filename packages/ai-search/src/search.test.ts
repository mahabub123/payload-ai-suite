import { describe, expect, it } from 'vitest'
import { AIError } from '@payload-ai-suite/ai-core'
import { createFakeServices, createTestContext, createToolContext } from '@payload-ai-suite/ai-core/testing'
import { createSearchEngine } from './engine'
import { indexOfferings, reindexAll } from './indexing'
import type { AiSearchOptions } from './options'
import { searchOfferingsTool } from './tools'
import { CATALOG, createOfferingAdapter, createPayloadStub, product } from './test/helpers'

const setup = async (options?: AiSearchOptions) => {
  const adapter = createOfferingAdapter()
  const services = createFakeServices({ adapters: { offering: adapter } })
  const payload = createPayloadStub()
  await indexOfferings(services, adapter, CATALOG, services.systemContext(payload, { module: 'search' }))
  const engine = createSearchEngine(payload, services, options)
  const ctx = createTestContext({ payload, module: 'search', adapters: services.adapters })
  const events = () => payload.store.get('ai-search-events') ?? []
  return { adapter, services, payload, engine, ctx, events }
}

describe('search pipeline', () => {
  it('runs hybrid retrieval, in-stock first, with facets and a searchId', async () => {
    const { engine, ctx } = await setup()
    const r = await engine.search({ q: 'red dress' }, ctx)
    expect(r.mode).toBe('hybrid')
    expect(r.searchId).toBeTruthy()
    expect(r.items.length).toBeGreaterThan(0)
    const firstOut = r.items.findIndex((i) => i.inStock === false)
    expect(r.items.slice(firstOut).every((i) => i.inStock === false)).toBe(true)
    expect(r.facets?.categories.find((c) => c.id === 'cat-dress')).toMatchObject({ title: 'Dresses' })
    expect(r.facets?.attributes.color?.length).toBeGreaterThan(0)
  })

  it('parses NL filters with the fast model, validates against facets, prices to minor units', async () => {
    const { engine, ctx, services } = await setup()
    services.provider.enqueue({ object: { text: 'dress', categoryIds: ['cat-dress', 'cat-bogus'], priceMax: 3000, color: 'red', size: 'XXL' } })
    const r = await engine.search({ q: 'red dress under 3,000 taka' }, ctx)
    expect(r.parsedFilters).toMatchObject({
      categoryIds: ['cat-dress'],
      priceMax: 300000,
      attributes: { color: ['Red'] },
      text: 'dress',
    })
    expect(r.parsedFilters?.dropped).toEqual(expect.arrayContaining(['category:cat-bogus', 'size:XXL']))
    expect(r.items.map((i) => i.id).sort()).toEqual(['p1', 'p3'])
    expect(r.items.every((i) => (i.price?.amount ?? 0) <= 300000)).toBe(true)
  })

  it('skips query understanding for short queries', async () => {
    const { engine, ctx, services } = await setup()
    await engine.search({ q: 'silk scarf' }, ctx)
    expect(services.provider.calls.length).toBe(0)
  })

  it('drops AI parsing on timeout but still answers', async () => {
    const { engine, ctx, services } = await setup({ queryUnderstanding: { minWords: 4, timeoutMs: 20 } })
    services.ai.generateObject = () => new Promise((resolve) => setTimeout(() => resolve({ object: { categoryIds: ['cat-dress'] } } as any), 500))
    const t0 = Date.now()
    const r = await engine.search({ q: 'something nice for a party' }, ctx)
    expect(Date.now() - t0).toBeLessThan(300)
    expect(r.parsedFilters?.parseSkipped).toBe('timeout')
    expect(r.parsedFilters?.categoryIds).toBeUndefined()
  })

  it('falls back to keyword mode when the embedding times out', async () => {
    const { engine, ctx, services } = await setup({ embedTimeoutMs: 20 })
    services.ai.embed = () => new Promise(() => undefined)
    const r = await engine.search({ q: 'leather sandals' }, ctx)
    expect(r.mode).toBe('keyword')
    expect(r.fallbackReason).toBe('embedding:timeout')
    expect(r.items[0].id).toBe('p5')
  })

  it('falls back to keyword mode when the AI budget is exhausted', async () => {
    const { engine, ctx, services } = await setup()
    const budget = () => Promise.reject(new AIError('budget_exceeded', 'Budget exhausted'))
    services.ai.embed = budget
    services.ai.generateObject = budget
    const r = await engine.search({ q: 'red silk dress for evening party' }, ctx)
    expect(r.mode).toBe('keyword')
    expect(r.fallbackReason).toBe('embedding:budget_exceeded')
    expect(r.parsedFilters?.parseSkipped).toBe('budget_exceeded')
    expect(r.items.map((i) => i.id)).toContain('p1')
  })

  it('uses the adapter when the vector store fails', async () => {
    const { engine, ctx, services, adapter } = await setup({ hybrid: false })
    services.vectors.query = () => Promise.reject(new Error('db down'))
    const r = await engine.search({ q: 'sandals' }, ctx)
    expect(r.mode).toBe('keyword')
    expect(adapter.searches.length).toBe(1)
    expect(r.items.map((i) => i.id)).toEqual(['p5'])
  })

  it('logs zero-result searches without raw session ids', async () => {
    const { engine, ctx, events } = await setup({ hybrid: false })
    const r = await engine.search({ q: 'zxqv', sessionId: 'raw-session-123' }, ctx)
    expect(r.total).toBe(0)
    const [row] = events()
    expect(row).toMatchObject({ type: 'search', query: 'zxqv', zeroResults: true, resultCount: 0, mode: 'keyword', searchId: r.searchId })
    expect(row.sessionId).toBeTruthy()
    expect(JSON.stringify(row)).not.toContain('raw-session-123')
    expect(typeof row.latencyMs).toBe('number')
  })

  it('paginates with an opaque cursor and logs only the first page', async () => {
    const { engine, ctx, events } = await setup({ pageSize: 2 })
    const p1 = await engine.search({ q: 'dress' }, ctx)
    expect(p1.items.length).toBe(2)
    expect(p1.total).toBe(CATALOG.length)
    const p2 = await engine.search({ q: 'dress', cursor: p1.nextCursor }, ctx)
    const p3 = await engine.search({ q: 'dress', cursor: p2.nextCursor }, ctx)
    expect(p3.nextCursor).toBeUndefined()
    const ids = [...p1.items, ...p2.items, ...p3.items].map((i) => i.id)
    expect(new Set(ids).size).toBe(CATALOG.length)
    expect(p2.searchId).toBe(p1.searchId)
    expect(events().length).toBe(1)
  })

  it('applies static and staff-approved synonyms', async () => {
    const { engine, ctx, payload } = await setup({ hybrid: false, synonyms: { tee: ['t-shirt'] } })
    const r = await engine.search({ q: 'tee' }, ctx)
    expect(r.items.map((i) => i.id)).toEqual(['p4'])

    await payload.create({ collection: 'ai-search-reports', data: { synonyms: [{ term: 'flip flops', synonyms: 'sandals', status: 'approved' }, { term: 'shawl', synonyms: 'scarf', status: 'pending' }] } })
    engine.invalidateSynonyms()
    expect((await engine.search({ q: 'flip flops' }, ctx)).items.map((i) => i.id)).toEqual(['p5'])
    expect((await engine.search({ q: 'shawl' }, ctx)).total).toBe(0)
  })

  it('caches query embeddings by normalised query', async () => {
    const { engine, ctx } = await setup()
    await engine.search({ q: 'Red Dress' }, ctx)
    await engine.search({ q: '  red   dress ' }, ctx)
    expect(engine.cacheStats().hits).toBe(1)
  })

  it('validates explicit filters and boosts', async () => {
    const { engine, ctx } = await setup({ hybrid: false, boosts: { p2: 100, p1: 0 } })
    const r = await engine.search({ q: 'dress', filters: JSON.stringify({ categoryIds: ['cat-dress', 'nope'] }) }, ctx)
    expect(r.items[0].id).toBe('p2')
    expect(r.items.map((i) => i.id)).not.toContain('p1')
    expect(r.parsedFilters?.categoryIds).toEqual(['cat-dress'])
  })
})

describe('localized catalogs', () => {
  it('indexes one row per locale and answers in the caller\'s locale', async () => {
    const titles: Record<string, string> = { en: 'Red Jamdani Saree', bn: 'লাল জামদানি শাড়ি' }
    const adapter = {
      ...createOfferingAdapter([]),
      async *iterate(_o: unknown, actx: { locale?: string }) {
        yield product('1', titles[actx.locale ?? 'en'])
      },
    }
    const services = createFakeServices({ adapters: { offering: adapter } })
    const payload = createPayloadStub()
    ;(payload.config as { localization?: unknown }).localization = { localeCodes: ['en', 'bn'], defaultLocale: 'en' }
    const r = await reindexAll(services, services.systemContext(payload, { module: 'search' }))
    expect(r).toMatchObject({ seen: 1, embedded: 2 })
    expect([...services.vectorTables.get('ai_offerings')!.values()].map((x) => x.id).sort()).toEqual(['1:bn', '1:en'])
    const engine = createSearchEngine(payload, services)
    const bn = await engine.search({ q: 'জামদানি' }, createTestContext({ payload, module: 'search', adapters: services.adapters, locale: 'bn' }))
    expect(bn.items.map((i) => [i.id, i.title])).toEqual([['1', 'লাল জামদানি শাড়ি']])
    const en = await engine.search({ q: 'jamdani' }, createTestContext({ payload, module: 'search', adapters: services.adapters, locale: 'en' }))
    expect(en.items.map((i) => i.title)).toEqual(['Red Jamdani Saree'])
  })
})

describe('searchOfferings tool', () => {
  it('returns compact data and a products card', async () => {
    const { services, payload } = await setup()
    const ctx = createToolContext(services, { payload, module: 'assistant' })
    const res = await searchOfferingsTool.run(searchOfferingsTool.input.parse({ query: 'dress', maxPrice: 3000, limit: 2 }), ctx)
    expect(res.data.items.length).toBeLessThanOrEqual(2)
    for (const item of res.data.items) {
      expect(Object.keys(item).sort()).toEqual(['id', 'inStock', 'price', 'title'])
      expect(item.price).toMatch(/^BDT /)
    }
    expect(res.data.items.every((i) => ['p1', 'p3', 'p4', 'p6'].includes(i.id))).toBe(true)
    expect(res.cards?.[0]).toMatchObject({ type: 'products' })
    expect((res.cards?.[0] as { items: unknown[] }).items.length).toBe(res.data.items.length)
  })

  it('rejects limit above 8', () => {
    expect(searchOfferingsTool.input.safeParse({ query: 'x', limit: 9 }).success).toBe(false)
  })
})
