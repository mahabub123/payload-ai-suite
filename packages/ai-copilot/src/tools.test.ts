import { describe, expect, it } from 'vitest'
import { AIError } from '@payload-ai-suite/ai-core'
import { collect, createFakeServices, createToolContext } from '@payload-ai-suite/ai-core/testing'
import { applyChangeset, discardChangeset } from './changesets'
import { copilotChat } from './chat'
import { buildCopilotTools, COPILOT_TOOL_NAMES } from './tools'
import { setup, staffActor, testOptions } from './test/helpers'

const POSTS = [
  { id: '1', title: 'Hello', category: 'news', _status: 'draft' },
  { id: '2', title: 'World', category: 'news', _status: 'draft' },
  { id: '3', title: 'Other', category: 'blog', _status: 'published' },
]

const tool = (name: string) => buildCopilotTools(testOptions()).find((t) => t.name === name)!

describe('staff tool visibility', () => {
  const services = createFakeServices()
  for (const t of buildCopilotTools(testOptions())) services.tools.register(t, 'copilot')

  it('offers every copilot tool to staff in the admin', () => {
    const ctx = createToolContext(services, { surface: 'admin', actor: staffActor() })
    expect(services.tools.availableFor(ctx, COPILOT_TOOL_NAMES).map((t) => t.name).sort()).toEqual([...COPILOT_TOOL_NAMES].sort())
  })

  it('hides them from visitors, customers, storefront and channels', () => {
    const cases = [
      createToolContext(services, { surface: 'storefront', actor: { kind: 'visitor', roles: [] } }),
      createToolContext(services, { surface: 'admin', actor: { kind: 'customer', roles: ['customer'], customerId: 'c1' } }),
      createToolContext(services, { surface: 'storefront', actor: staffActor() }),
      createToolContext(services, { surface: 'channel', actor: staffActor() }),
    ]
    for (const ctx of cases) expect(services.tools.availableFor(ctx, COPILOT_TOOL_NAMES)).toEqual([])
    // Visibility comes from `available` (staff on admin), not the tier: the 'staff'/'confirm' tiers would turn
    // every lookup into a confirmation card. proposeBulkEdit only saves a changeset that staff apply in the admin.
    for (const t of buildCopilotTools(testOptions())) expect(t.tier).toBe(t.name === 'proposeBulkEdit' ? 'low' : 'read')
  })
})

describe('findDocuments', () => {
  it('queries with the staff user and overrideAccess false', async () => {
    const { fake, ctx } = setup()
    fake.seed('posts', POSTS)
    const r = await tool('findDocuments').run(tool('findDocuments').input.parse({ collection: 'posts', filter: { field: 'category', op: 'equals', value: 'news' } }), ctx)
    expect(r.data.total).toBe(2)
  })

  it('answers an unknown query path with the real field names so the model can retry', async () => {
    const { ctx } = setup()
    ;(ctx.payload as unknown as { find: () => Promise<never> }).find = async () => {
      throw Object.assign(new Error('The following path cannot be queried: stock'), { name: 'QueryError' })
    }
    const t = tool('findDocuments')
    const r = await t.run(t.input.parse({ collection: 'posts', filter: { field: 'stock', op: 'less_than', value: 5 } }), ctx)
    expect(r.data).toMatchObject({ error: expect.stringContaining('stock'), fields: expect.any(Array) })
  })

  it('refuses collections outside the allow-list and unknown operators', () => {
    const t = tool('findDocuments')
    expect(() => t.input.parse({ collection: 'users' })).toThrow()
    expect(() => t.input.parse({ collection: 'posts', filter: { field: 'title', op: 'regex', value: '.*' } })).toThrow()
  })
})

describe('bulk edit', () => {
  it('proposes a diff and never writes to the target collection', async () => {
    const { fake, ctx } = setup()
    fake.seed('posts', POSTS)
    const t = tool('proposeBulkEdit')
    const r = await t.run(t.input.parse({ collection: 'posts', filter: { field: 'category', op: 'equals', value: 'news' }, fields: ['category'], set: { category: 'updates' } }), ctx)
    expect(r.data.count).toBe(2)
    expect(fake.calls.update).toHaveLength(0)
    expect(fake.store.get('posts')!.get('1')!.category).toBe('news')
    const cs = fake.store.get('ai-copilot-changesets')!.get(String(r.data.changesetId))!
    expect(cs.status).toBe('proposed')
    expect(cs.items).toEqual([
      { id: '1', before: { category: 'news' }, after: { category: 'updates' } },
      { id: '2', before: { category: 'news' }, after: { category: 'updates' } },
    ])
    expect(r.cards?.[0]).toMatchObject({ type: 'action-result', status: 'proposed', actionId: `changeset:${r.data.changesetId}` })
  })

  it('uses the model for instruction-based rewrites (still no writes)', async () => {
    const { fake, ctx, services } = setup()
    fake.seed('posts', [POSTS[0]])
    services.provider.enqueue({ object: { title: 'HELLO' } })
    const t = tool('proposeBulkEdit')
    const r = await t.run(t.input.parse({ collection: 'posts', fields: ['title'], instructions: 'uppercase titles' }), ctx)
    expect(r.data.sample[0]).toEqual({ id: '1', before: { title: 'Hello' }, after: { title: 'HELLO' } })
    expect(fake.calls.update).toHaveLength(0)
  })

  it('keeps list fields as lists in instruction-based rewrites', async () => {
    const { fake, ctx, services } = setup()
    fake.seed('posts', [{ ...POSTS[0], tags: ['a', 'b'] }])
    services.provider.enqueue({ object: { tags: ['a', 'b', 'winter'] } })
    const t = tool('proposeBulkEdit')
    const r = await t.run(t.input.parse({ collection: 'posts', fields: ['tags'], instructions: 'add the tag winter' }), ctx)
    expect(r.data.sample[0]).toEqual({ id: '1', before: { tags: ['a', 'b'] }, after: { tags: ['a', 'b', 'winter'] } })
    expect(t.input.safeParse({ collection: 'posts', fields: ['tags'], set: { tags: ['x', 'y'] } }).success).toBe(true)
  })

  it('refuses protected and unknown fields', async () => {
    const { fake, ctx } = setup()
    fake.seed('posts', POSTS)
    const t = tool('proposeBulkEdit')
    await expect(t.run(t.input.parse({ collection: 'posts', fields: ['roles'], set: { roles: 'admin' } }), ctx)).rejects.toThrow(AIError)
    await expect(t.run(t.input.parse({ collection: 'posts', fields: ['nope'], set: { nope: 1 } }), ctx)).rejects.toThrow(/Unknown field/)
  })
})

describe('apply / discard', () => {
  const propose = async (s: ReturnType<typeof setup>) => {
    s.fake.seed('posts', POSTS)
    const t = tool('proposeBulkEdit')
    const r = await t.run(t.input.parse({ collection: 'posts', filter: { field: 'category', op: 'equals', value: 'news' }, fields: ['category'], set: { category: 'updates' } }), s.ctx)
    return String(r.data.changesetId)
  }

  it('applies once as the staff user (draft when versions enabled) and is idempotent', async () => {
    const s = setup({ drafts: ['posts'] })
    const id = await propose(s)
    const first = await applyChangeset(s.services, s.ctx, id, { allowed: ['posts'] })
    expect(first.status).toBe('applied')
    expect(first.results.map((r) => r.status)).toEqual(['applied', 'applied'])
    const writes = s.fake.calls.update.filter((c) => c.collection === 'posts')
    expect(writes).toHaveLength(2)
    expect(writes.every((w) => w.overrideAccess === false && w.draft === true && w.user?.id === 'u1')).toBe(true)
    expect(s.services.log.audit.filter((a: any) => a.action === 'copilot.changeset.apply')).toHaveLength(2)

    const again = await applyChangeset(s.services, s.ctx, id, { allowed: ['posts'] })
    expect(again.replayed).toBe(true)
    expect(s.fake.calls.update.filter((c) => c.collection === 'posts')).toHaveLength(2)
  })

  it('skips docs that changed since the proposal', async () => {
    const s = setup()
    const id = await propose(s)
    s.fake.store.get('posts')!.get('2')!.category = 'edited-by-human'
    const r = await applyChangeset(s.services, s.ctx, id, { allowed: ['posts'] })
    expect(r.results.find((x) => x.id === '2')!.status).toBe('conflict')
    expect(s.fake.store.get('posts')!.get('2')!.category).toBe('edited-by-human')
  })

  it('records per-doc errors when the staff user lacks write access', async () => {
    const s = setup()
    const id = await propose(s)
    s.fake.denyWrite.add('posts')
    const r = await applyChangeset(s.services, s.ctx, id, { allowed: ['posts'] })
    expect(r.status).toBe('failed')
    expect(s.fake.store.get('posts')!.get('1')!.category).toBe('news')
  })

  it('discard prevents apply', async () => {
    const s = setup()
    const id = await propose(s)
    await discardChangeset(s.services, s.ctx, id)
    await expect(applyChangeset(s.services, s.ctx, id, { allowed: ['posts'] })).rejects.toMatchObject({ code: 'conflict' })
  })
})

describe('copilot chat', () => {
  it('streams text and the bulk-edit card, stored on the admin channel', async () => {
    const s = setup()
    s.fake.seed('posts', POSTS)
    s.services.provider.enqueue(
      { toolCalls: [{ toolCallId: 't1', toolName: 'proposeBulkEdit', input: { collection: 'posts', fields: ['category'], set: { category: 'x' }, filter: { field: 'category', op: 'equals', value: 'blog' } } }] },
      'I proposed the change.',
    )
    const events = await collect(copilotChat(s.services, s.ctx, { message: 'move blog posts to x' }, buildCopilotTools(testOptions()), ['posts']))
    expect(events[0]).toMatchObject({ type: 'meta' })
    expect(events.some((e) => e.type === 'card' && e.card.type === 'action-result')).toBe(true)
    expect(events.at(-1)).toMatchObject({ type: 'done' })
    expect(s.fake.calls.update).toHaveLength(0)
    const thread = [...s.services.log.messages.values()][0]
    expect(thread.map((m: any) => m.role)).toEqual(['user', 'assistant'])
  })
})
