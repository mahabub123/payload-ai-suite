import { describe, expect, it } from 'vitest'
import { collect } from 'payload-ai-core/testing'
import { createFakeServices } from 'payload-ai-core/testing'
import { createHarness } from '../test/setup'
import { GENERATIONS } from './constants'

const gens = (h: Awaited<ReturnType<typeof createHarness>>) => [...(h.payload.store.get(GENERATIONS)?.values() ?? [])]

describe('generations', () => {
  it('records a pending generation with prompt, model and cost for JSON responses', async () => {
    const h = await createHarness()
    h.services.provider.enqueue('"Red jamdani saree"')
    const r = await h.call('/ai/content/generate', { action: 'shorten', collection: 'products', docId: 'p1', field: 'title', currentValue: 'Beautiful handwoven red jamdani saree' })
    expect(r.output).toBe('Red jamdani saree')
    const [g] = gens(h)
    expect(g).toMatchObject({
      targetCollection: 'products',
      targetId: 'p1',
      field: 'title',
      action: 'shorten',
      promptSlug: 'content.shorten',
      promptVersion: 0,
      accepted: null,
      model: 'mock:mock-chat',
      costMicros: 1,
      requestedBy: 'u1',
    })
    expect(r.generationId).toBe(g.id)
  })

  it('streams long text as SSE events and records the generation at the end', async () => {
    const h = await createHarness()
    h.services.provider.enqueue('Soft handwoven cotton. Perfect for festivals.')
    const it = await h.call('/ai/content/generate', { action: 'write', collection: 'products', docId: 'p1', field: 'summary' })
    const events = await collect(it as AsyncIterable<any>)
    expect(events.filter((e) => e.type === 'text').map((e) => e.delta).join('')).toBe('Soft handwoven cotton. Perfect for festivals.')
    const done = events.at(-1)
    expect(done.type).toBe('done')
    const [g] = gens(h)
    expect(done.messageId).toBe(g.id)
    expect(g.output).toBe('Soft handwoven cotton. Perfect for festivals.')
    expect(g.accepted).toBeNull()
  })

  it('accept / reject updates the acceptance flag; accept returns the field value', async () => {
    const h = await createHarness()
    h.services.provider.enqueue('## Title\n\nBody', 'Short title')
    const rich = await h.call('/ai/content/generate', { action: 'write', collection: 'products', docId: 'p1', field: 'description', stream: false })
    const plain = await h.call('/ai/content/generate', { action: 'write', collection: 'products', docId: 'p1', field: 'title' })

    const ok = await h.call('/ai/content/generations/:id', { accepted: true, params: { id: rich.generationId } }, 'patch')
    expect(ok.accepted).toBe(true)
    expect(ok.value.root.children[0].type).toBe('heading')

    const no = await h.call('/ai/content/generations/:id', { accepted: false, params: { id: plain.generationId } }, 'patch')
    expect(no.value).toBeUndefined()

    const byId = Object.fromEntries(gens(h).map((g) => [g.id, g]))
    expect(byId[rich.generationId].accepted).toBe(true)
    expect(byId[rich.generationId].decidedBy).toBe('u1')
    expect(byId[plain.generationId].accepted).toBe(false)
    // acceptance rate is derivable from the rows
    const decided = gens(h).filter((g) => g.accepted != null)
    expect(decided.filter((g) => g.accepted).length / decided.length).toBe(0.5)
  })

  it('refuses collections that are not AI-enabled', async () => {
    const h = await createHarness()
    await expect(h.call('/ai/content/generate', { action: 'write', collection: 'users', field: 'name' })).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('turns a budget stop into a clear message (stream error event)', async () => {
    const h = await createHarness()
    const broke = createFakeServices({ budgetExceeded: true, adapters: h.services.adapters })
    for (const p of h.def.prompts ?? []) broke.prompts.registerDefault(p, 'content')
    const e = h.endpoint('/ai/content/generate')
    const it = await e.handler({ ctx: h.ctx, services: broke, input: { action: 'write', collection: 'products', docId: 'p1', field: 'summary' }, req: {} as never })
    const events = await collect(it as AsyncIterable<any>)
    expect(events[0]).toMatchObject({ type: 'error', code: 'budget_exceeded' })
    expect(events[0].message).toMatch(/budget for content is used up/)
    expect(gens(h)).toHaveLength(0)
  })
})
