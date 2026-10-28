import { describe, expect, it } from 'vitest'
import { createFakeServices, createTestContext } from '@payload-ai-suite/ai-core/testing'
import { createSearchEngine } from './engine'
import { indexOfferings } from './indexing'
import { analyzeEvents, runLearningReport } from './learning'
import { computeCooccurrence, cooccurrenceTask, getRecommendations, recsCacheControl } from './recs'
import { CATALOG, createOfferingAdapter, createOrderAdapter, createPayloadStub, order } from './test/helpers'

const ORDERS = [order('o1', ['p1', 'p6', 'p5'], 'cust-1'), order('o2', ['p1', 'p6']), order('o3', ['p1', 'p5']), order('o4', ['p1', 'p6', 'p6'])]

const setup = async () => {
  const adapter = createOfferingAdapter()
  const services = createFakeServices({ adapters: { offering: adapter, order: createOrderAdapter(ORDERS) } })
  const payload = createPayloadStub()
  const sys = services.systemContext(payload, { module: 'search' })
  await indexOfferings(services, adapter, CATALOG, sys)
  const engine = createSearchEngine(payload, services)
  const ctx = createTestContext({ payload, module: 'search', adapters: services.adapters })
  return { services, payload, engine, ctx, adapter, sys }
}

describe('co-occurrence', () => {
  it('counts each pair once per order and keeps top N', () => {
    const recs = computeCooccurrence(ORDERS, 12)
    expect(recs.get('p1')).toEqual([
      { id: 'p6', score: 3 },
      { id: 'p5', score: 2 },
    ])
    expect(recs.get('p5')).toEqual([
      { id: 'p1', score: 2 },
      { id: 'p6', score: 1 },
    ])
    expect(computeCooccurrence(ORDERS, 1).get('p1')).toEqual([{ id: 'p6', score: 3 }])
  })

  it('nightly job stores bought-together lists served by the recs endpoint', async () => {
    const { payload, services, engine, ctx } = await setup()
    const task = cooccurrenceTask({ days: 180, top: 12 })
    const handler = task.handler as (a: any) => Promise<{ output: { offerings: number } }>
    // the job resolves services through getAI(); register the fake for this payload
    const { setAI } = await import('@payload-ai-suite/ai-core')
    setAI(payload, services)
    const out = await handler({ input: {}, req: { payload } })
    expect(out.output.offerings).toBe(3)
    expect(payload.store.get('ai-recs')?.length).toBe(3)
    await handler({ input: {}, req: { payload } })
    expect(payload.store.get('ai-recs')?.length).toBe(3)

    const r = await getRecommendations(engine, { kind: 'bought-together', offering: 'p1' }, ctx)
    expect(r.items.map((i) => i.id)).toEqual(['p6', 'p5'])
  })
})

describe('recommendations', () => {
  it('similar = vector neighbours excluding the offering, stored for reuse', async () => {
    const { engine, ctx, payload } = await setup()
    const r = await getRecommendations(engine, { kind: 'similar', offering: 'p1', limit: 3 }, ctx)
    expect(r.kind).toBe('similar')
    expect(r.items.length).toBe(3)
    expect(r.items.map((i) => i.id)).not.toContain('p1')
    expect(payload.store.get('ai-recs')?.[0]).toMatchObject({ offeringId: 'p1', kind: 'similar' })
    const again = await getRecommendations(engine, { kind: 'similar', offering: 'p1', limit: 3 }, ctx)
    expect(again.items.map((i) => i.id)).toEqual(r.items.map((i) => i.id))
  })

  it('for-you blends session views and purchases, excluding seen items', async () => {
    const { engine, payload, services } = await setup()
    const ctx = createTestContext({ payload, module: 'search', adapters: services.adapters, actor: { kind: 'customer', roles: ['customer'], customerId: 'cust-1' } })
    await engine.recordEvent({ type: 'click', offeringId: 'p2', sessionId: 's1' }, ctx)
    const r = await getRecommendations(engine, { kind: 'for-you', sessionId: 's1', limit: 5 }, ctx)
    const ids = r.items.map((i) => i.id)
    expect(ids.length).toBeGreaterThan(0)
    for (const seen of ['p1', 'p2', 'p5', 'p6']) expect(ids).not.toContain(seen)
  })

  it('for-you without history is empty, and cache headers differ by kind', async () => {
    const { engine, ctx } = await setup()
    const r = await getRecommendations(engine, { kind: 'for-you' }, { ...ctx, actor: { kind: 'visitor', roles: [] } })
    expect(r.items).toEqual([])
    expect(recsCacheControl('similar')).toMatch(/public.*s-maxage/)
    expect(recsCacheControl('for-you')).toMatch(/^private/)
  })
})

describe('learning loop', () => {
  it('finds zero-result and low-click queries', () => {
    const ev = [
      { type: 'search', searchId: 's1', normalizedQuery: 'flip flops', zeroResults: true },
      { type: 'search', searchId: 's2', normalizedQuery: 'flip flops', zeroResults: true },
      ...[3, 4, 5, 6].map((i) => ({ type: 'search', searchId: `s${i}`, normalizedQuery: 'dress', zeroResults: false })),
      ...[7, 8, 9].map((i) => ({ type: 'search', searchId: `s${i}`, normalizedQuery: 'scarf', zeroResults: false })),
      { type: 'click', searchId: 's7' },
      { type: 'click', searchId: 's7' },
      { type: 'click', searchId: 's8' },
    ]
    const r = analyzeEvents(ev)
    expect(r.searches).toBe(9)
    expect(r.zeroResult).toEqual([{ query: 'flip flops', searches: 2, zeroResults: 2, clicks: 0, ctr: 0 }])
    expect(r.lowClick.map((q) => q.query)).toEqual(['dress'])
  })

  it('stores a report with pending AI suggestions; approval applies at query time', async () => {
    const { services, payload, engine, ctx } = await setup()
    const keywordEngine = createSearchEngine(payload, services, { hybrid: false })
    await keywordEngine.search({ q: 'flip flops' }, ctx)
    services.provider.enqueue({ object: { synonyms: [{ term: 'Flip Flops', synonyms: ['sandals'] }], missingProducts: [{ query: 'flip flops', suggestion: 'Stock rubber flip flops' }] } })
    const r = await runLearningReport(services, services.systemContext(payload, { module: 'search' }))
    expect(r).toMatchObject({ searches: 1, synonyms: 1, missing: 1 })
    const report = payload.store.get('ai-search-reports')![0]
    expect(report.synonyms).toEqual([{ term: 'flip flops', synonyms: 'sandals', status: 'pending' }])
    expect((await keywordEngine.search({ q: 'flip flops' }, ctx)).total).toBe(0)
    report.synonyms[0].status = 'approved'
    keywordEngine.invalidateSynonyms()
    expect((await keywordEngine.search({ q: 'flip flops' }, ctx)).items.map((i) => i.id)).toEqual(['p5'])
    void engine
  })

  it('still stores the report when the AI call fails', async () => {
    const { services, payload, ctx } = await setup()
    const keywordEngine = createSearchEngine(payload, services, { hybrid: false })
    await keywordEngine.search({ q: 'zzz' }, ctx)
    services.ai.generateObject = () => Promise.reject(new Error('budget'))
    const r = await runLearningReport(services, services.systemContext(payload, { module: 'search' }))
    expect(r.synonyms).toBe(0)
    expect(payload.store.get('ai-search-reports')![0].aiError).toBe('budget')
  })
})
