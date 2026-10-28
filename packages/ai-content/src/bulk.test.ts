import { describe, expect, it } from 'vitest'
import { createHarness } from '../test/setup'
import { runBulk } from './bulk'
import { BULK_RUNS, BULK_TASK, GENERATIONS } from './constants'

const rows = (h: Awaited<ReturnType<typeof createHarness>>, c: string) => [...(h.payload.store.get(c)?.values() ?? [])]

describe('bulk enrichment', () => {
  it('queues a job, writes only pending generations, and never touches the documents', async () => {
    const h = await createHarness()
    h.services.provider.enqueue('## Saree\n\nRed.', 'Kurti text', 'x')
    const r = await h.call('/ai/content/bulk', { collection: 'products', ids: ['p1', 'p2'], action: 'write', fields: ['description'], locale: 'en' })
    expect(r.status).toBe('queued')
    expect(r.reviewPath).toBe(`/ai-content/bulk/${r.runId}`)
    const queued = h.payload.calls.find((c) => c.op === 'queue')
    expect(queued?.args).toMatchObject({ task: BULK_TASK, input: { runId: r.runId } })

    const before = structuredClone(rows(h, 'products'))
    const res = await runBulk(h.payload, r.runId, {}, h.services)
    expect(res).toEqual({ processed: 2, failed: 0 })

    expect(h.payload.calls.filter((c) => c.op === 'update' && c.collection === 'products')).toHaveLength(0)
    expect(rows(h, 'products')).toEqual(before)
    const gens = rows(h, GENERATIONS)
    expect(gens).toHaveLength(2)
    expect(gens.every((g) => g.accepted === null && g.bulkRun === r.runId)).toBe(true)
    expect(rows(h, BULK_RUNS)[0]).toMatchObject({ status: 'review', processed: 2, failed: 0, usedBatch: false })

    // idempotent: re-running a reviewed run does nothing
    await runBulk(h.payload, r.runId, {}, h.services)
    expect(rows(h, GENERATIONS)).toHaveLength(2)
  })

  it('accept-all writes values as drafts (rich text converted to Lexical); published docs stay unchanged', async () => {
    const h = await createHarness()
    h.services.provider.enqueue('## Saree\n\nRed.', 'Kurti **text**')
    const { runId } = await h.call('/ai/content/bulk', { collection: 'products', ids: ['p1', 'p2'], action: 'write', fields: ['description'] })
    await runBulk(h.payload, runId, {}, h.services)

    const published = structuredClone(rows(h, 'products'))
    const r = await h.call('/ai/content/bulk/:runId/review', { decision: 'accept-all', params: { runId } })
    expect(r).toMatchObject({ accepted: 2, discarded: 0, failed: [], drafts: true, pending: 0 })

    const updates = h.payload.calls.filter((c) => c.op === 'update' && c.collection === 'products')
    expect(updates).toHaveLength(2)
    for (const u of updates) {
      expect(u.args.draft).toBe(true)
      expect(u.args.data._status).toBe('draft')
      expect(u.args.overrideAccess).toBe(false)
      expect(u.args.user).toMatchObject({ id: 'u1' })
    }
    expect(rows(h, 'products')).toEqual(published)
    const draft = h.payload.drafts.get('products:p1')!
    expect(draft.description.root.children[0].type).toBe('heading')
    expect(rows(h, GENERATIONS).every((g) => g.accepted === true && g.appliedAt)).toBe(true)
    expect(rows(h, BULK_RUNS)[0].status).toBe('done')
  })

  it('accept-each and discard only touch the chosen generations', async () => {
    const h = await createHarness()
    h.services.provider.enqueue('One', 'Two')
    const { runId } = await h.call('/ai/content/bulk', { collection: 'products', ids: ['p1', 'p2'], action: 'write', fields: ['summary'] })
    await runBulk(h.payload, runId, {}, h.services)
    const [g1, g2] = rows(h, GENERATIONS)

    await h.call('/ai/content/bulk/:runId/review', { items: [{ id: g1.id, accept: true }], params: { runId } })
    let byId = Object.fromEntries(rows(h, GENERATIONS).map((g) => [g.id, g]))
    expect(byId[g1.id].accepted).toBe(true)
    expect(byId[g2.id].accepted).toBeNull()
    expect(rows(h, BULK_RUNS)[0].status).toBe('review')

    const r = await h.call('/ai/content/bulk/:runId/review', { decision: 'discard-all', params: { runId } })
    expect(r.discarded).toBe(1)
    byId = Object.fromEntries(rows(h, GENERATIONS).map((g) => [g.id, g]))
    expect(byId[g2.id].accepted).toBe(false)
    expect(h.payload.drafts.get('products:p2')).toBeUndefined()
    expect(rows(h, BULK_RUNS)[0].status).toBe('done')

    const review = await h.call('/ai/content/bulk/:runId', { params: { runId } }, 'get')
    expect(review.items).toHaveLength(2)
    expect(review.run.drafts).toBe(true)
  })

  it('one structured call per document feeds several fields (SEO title + description)', async () => {
    const h = await createHarness()
    h.services.provider.enqueue({ object: { title: 'Red Jamdani Saree', description: 'Handwoven cotton.' } })
    const { runId } = await h.call('/ai/content/bulk', { collection: 'products', ids: ['p1'], action: 'seo', fields: ['meta.title', 'meta.description'] })
    await runBulk(h.payload, runId, {}, h.services)
    expect(h.services.provider.calls).toHaveLength(1)
    const out = Object.fromEntries(rows(h, GENERATIONS).map((g) => [g.field, g.output]))
    expect(out).toEqual({ 'meta.title': 'Red Jamdani Saree', 'meta.description': 'Handwoven cotton.' })
  })

  it('uses batch-mode calls when the route has a batch-capable model', async () => {
    const h = await createHarness()
    h.services.ai.resolveRoute = () => [{ ref: 'x:y', providerId: 'x', modelId: 'y', capabilities: ['chat', 'batch'], enabled: true }]
    const seen: unknown[] = []
    const orig = h.services.ai.generateText.bind(h.services.ai)
    h.services.ai.generateText = async (o, c) => {
      seen.push(o.needs)
      return orig(o, c)
    }
    const { runId } = await h.call('/ai/content/bulk', { collection: 'products', ids: ['p1', 'p2'], action: 'write', fields: ['summary'] })
    await runBulk(h.payload, runId, {}, h.services)
    expect(seen).toEqual([['batch'], ['batch']])
    expect(rows(h, BULK_RUNS)[0].usedBatch).toBe(true)
  })

  it('only staff admins can start bulk runs; unknown fields are rejected', async () => {
    const h = await createHarness()
    expect(h.endpoint('/ai/content/bulk').access).toEqual(['store-admin'])
    await expect(h.call('/ai/content/bulk', { collection: 'products', ids: ['p1'], action: 'write', fields: ['price'] })).rejects.toMatchObject({ code: 'validation' })
  })
})
