import { describe, expect, it } from 'vitest'
import type { Config } from 'payload'
import { createFakeServices } from '@payload-ai-suite/ai-core/testing'
import { aiSearch, searchModuleDefinition } from './plugin'
import { indexOfferings } from './indexing'
import { createOfferingAdapter, createPayloadStub, product } from './test/helpers'

const baseConfig = (): Config =>
  ({
    collections: [{ slug: 'products', fields: [], hooks: { afterChange: [() => undefined] } }, { slug: 'pages', fields: [] }],
    custom: {
      aiSuite: {
        coreInstalled: true,
        modules: [],
        options: { adapters: { mappedCollections: () => ({ offering: ['products'] }) } },
      },
    },
  }) as unknown as Config

describe('aiSearch plugin', () => {
  it('adds own collections, endpoints, tasks and preserves existing hooks', () => {
    const config = aiSearch()(baseConfig()) as Config
    const slugs = config.collections!.map((c) => c.slug)
    expect(slugs).toEqual(expect.arrayContaining(['ai-search-events', 'ai-recs', 'ai-search-reports']))
    const products = config.collections!.find((c) => c.slug === 'products')!
    expect(products.hooks?.afterChange?.length).toBe(2)
    expect(products.hooks?.afterDelete?.length).toBe(1)
    expect(config.collections!.find((c) => c.slug === 'pages')!.hooks).toBeUndefined()
    expect(config.endpoints!.map((e) => `${e.method} ${e.path}`)).toEqual(['get /ai/search', 'post /ai/search/events', 'get /ai/recs'])
    expect(config.jobs!.tasks!.map((t) => t.slug)).toEqual(
      expect.arrayContaining(['ai-search-index-offering', 'ai-search-reindex', 'ai-search-learning-report', 'ai-search-recs-cooccurrence']),
    )
    const events = config.collections!.find((c) => c.slug === 'ai-search-events')!
    expect(events.admin?.group).toBe('AI Suite')
  })

  it('recommendations: false removes recs pieces', () => {
    const def = searchModuleDefinition({ recommendations: false })
    expect(def.endpoints!.map((e) => e.path)).not.toContain('/ai/recs')
    expect(def.tools!.map((t) => t.name)).toEqual(['searchOfferings'])
    expect(def.tasks!.map((t) => t.slug)).not.toContain('ai-search-recs-cooccurrence')
    expect(def.collections!.map((c) => c.slug)).not.toContain('ai-recs')
  })

  it('declares the module contract', () => {
    const def = searchModuleDefinition()
    expect(def.slug).toBe('search')
    expect(def.requires).toEqual(['offering'])
    expect(def.tools!.map((t) => t.name)).toEqual(['searchOfferings', 'recommendOfferings'])
    const search = def.endpoints!.find((e) => e.path === '/ai/search')!
    expect(search).toMatchObject({ access: 'anyone', budget: false, method: 'get' })
    expect(def.schedules!.map((s) => s.task)).toEqual(['ai-search-reindex', 'ai-search-recs-cooccurrence', 'ai-search-learning-report'])
  })

  it('afterChange queues indexing for published docs only', async () => {
    const config = aiSearch()(baseConfig()) as Config
    const hook = config.collections!.find((c) => c.slug === 'products')!.hooks!.afterChange![1]
    const payload = createPayloadStub()
    const args = (doc: Record<string, unknown>, previousDoc: Record<string, unknown> = {}) =>
      ({ doc, previousDoc, req: { payload }, collection: { slug: 'products' }, context: {}, operation: 'update' }) as any
    await hook(args({ id: 1, _status: 'draft' }))
    expect(payload.queued.length).toBe(0)
    await hook(args({ id: 1, _status: 'published' }))
    await hook(args({ id: 1, _status: 'draft' }, { id: 1, _status: 'published' }))
    expect(payload.queued.map((q) => q.task)).toEqual(['ai-search-index-offering', 'ai-search-index-offering'])
  })
})

describe('indexing', () => {
  it('skips unchanged offerings by content hash and removes drafts', async () => {
    const adapter = createOfferingAdapter()
    const services = createFakeServices({ adapters: { offering: adapter } })
    const ctx = services.systemContext(createPayloadStub(), { module: 'search' })
    const items = [product('a', 'Alpha'), product('b', 'Beta')]
    expect(await indexOfferings(services, adapter, items, ctx)).toEqual({ embedded: 2, skipped: 0, removed: 0 })
    expect(await indexOfferings(services, adapter, items, ctx)).toEqual({ embedded: 0, skipped: 2, removed: 0 })
    const changed = [product('a', 'Alpha v2'), product('b', 'Beta', { status: 'draft' })]
    expect(await indexOfferings(services, adapter, changed, ctx)).toEqual({ embedded: 1, skipped: 0, removed: 1 })
    expect([...services.vectorTables.get('ai_offerings')!.keys()]).toEqual([':a'])
  })
})
