import { describe, expect, it, vi } from 'vitest'
import { chunkText, createKnowledgeService, hashContent, knowledgeTableSpec, KNOWLEDGE_TABLE } from './index'
import { createFakeServices, createTestContext } from '../testing'
import type { KnowledgeAdapter } from '../contracts'

const para = (n: number, word = 'lorem') => Array.from({ length: n }, (_, i) => `${word}${i}`).join(' ') + '.'

describe('chunkText', () => {
  it('starts a new chunk at every heading', () => {
    const text = `# Shipping\n\nWe ship in 2 days.\n\n# Returns\n\nReturns within 7 days.`
    const chunks = chunkText(text)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toContain('# Shipping')
    expect(chunks[1]).toMatch(/^# Returns/)
    expect(chunks[1]).not.toContain('Shipping')
  })

  it('respects the max size and carries overlap + heading into continuation chunks', () => {
    const text = ['## Policy', ...Array.from({ length: 12 }, (_, i) => para(40, `w${i}_`))].join('\n\n')
    const chunks = chunkText(text, { maxTokens: 200, overlapTokens: 20 })
    expect(chunks.length).toBeGreaterThan(2)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(200 * 4 + 4)
    for (const c of chunks.slice(1)) expect(c.startsWith('## Policy')).toBe(true)
    // overlap: some text from the end of chunk n appears in chunk n+1
    const tailWords = chunks[0].split(/\s+/).slice(-3).join(' ')
    expect(chunks[1]).toContain(tailWords)
  })

  it('hard-splits a single huge paragraph', () => {
    const chunks = chunkText('x'.repeat(5000), { maxTokens: 200 })
    expect(chunks.length).toBeGreaterThan(5)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(804)
  })

  it('hash is stable and content sensitive', () => {
    expect(hashContent('abc')).toBe(hashContent('abc'))
    expect(hashContent('abc')).not.toBe(hashContent('abd'))
    expect(hashContent('abc')).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('KnowledgeService', () => {
  const makeAdapter = (texts: Record<string, string>): KnowledgeAdapter => ({
    collections: ['pages'],
    async *iterate() {
      for (const [id, text] of Object.entries(texts)) yield { sourceCollection: 'pages', sourceId: id, title: id, text, visibility: 'public' }
    },
    toKnowledgeDoc: (collection, doc) =>
      doc._status === 'draft' ? null : { sourceCollection: collection, sourceId: String(doc.id), title: String(doc.title), text: String(doc.text), visibility: (doc.visibility as 'public') ?? 'public' },
  })

  it('re-embeds only changed chunks and removes stale ones', async () => {
    const services = createFakeServices({ adapters: { knowledge: makeAdapter({}) } })
    const svc = createKnowledgeService(() => services)
    const embed = vi.spyOn(services.ai, 'embed')
    const ctx = services.systemContext({} as never, { module: 'core' })
    const sections = (changed: string) =>
      [`# A\n\n${para(150, 'a')}`, `# B\n\n${para(150, changed)}`, `# C\n\n${para(150, 'c')}`].join('\n\n')

    const first = await svc.indexDoc('pages', { id: '1', title: 'Doc', text: sections('b') }, ctx)
    expect(first.chunks).toBe(3)
    expect(first.embedded).toBe(3)
    expect(embed).toHaveBeenCalledTimes(1)

    const same = await svc.indexDoc('pages', { id: '1', title: 'Doc', text: sections('b') }, ctx)
    expect(same.embedded).toBe(0)
    expect(embed).toHaveBeenCalledTimes(1)

    const edit = await svc.indexDoc('pages', { id: '1', title: 'Doc', text: sections('bb') }, ctx)
    expect(edit.embedded).toBe(1)
    expect((embed.mock.calls.at(-1)![0] as string[]).length).toBe(1)

    await svc.indexDoc('pages', { id: '1', title: 'Doc', text: `# A\n\n${para(150, 'a')}` }, ctx)
    expect(services.vectorTables.get(KNOWLEDGE_TABLE)!.size).toBe(1)

    await svc.indexDoc('pages', { id: '1', _status: 'draft', title: 'Doc', text: 'x' }, ctx)
    expect(services.vectorTables.get(KNOWLEDGE_TABLE)!.size).toBe(0)
    expect(knowledgeTableSpec.columns.hash).toBe('text')
  })

  it('keeps one index per locale: re-indexing English leaves Bangla alone, and search reads its own locale', async () => {
    const adapter: KnowledgeAdapter = {
      ...makeAdapter({}),
      toKnowledgeDoc: (collection, doc, actx) => ({ sourceCollection: collection, sourceId: String(doc.id), title: String(doc.title), text: String(doc.text), visibility: 'public', locale: actx.locale }),
    }
    const services = createFakeServices({ adapters: { knowledge: adapter } })
    const svc = createKnowledgeService(() => services)
    const en = services.systemContext({} as never, { module: 'core', locale: 'en' })
    const bn = services.systemContext({} as never, { module: 'core', locale: 'bn' })
    await svc.indexDoc('policies', { id: '2', title: 'Returns', text: 'Return within 7 days.' }, en)
    await svc.indexDoc('policies', { id: '2', title: 'ফেরত', text: '৭ দিনের মধ্যে ফেরত।' }, bn)
    expect(services.vectorTables.get(KNOWLEDGE_TABLE)!.size).toBe(2)
    await svc.indexDoc('policies', { id: '2', title: 'Returns', text: 'Return within 10 days.' }, en)
    expect(services.vectorTables.get(KNOWLEDGE_TABLE)!.size).toBe(2)
    const r = await svc.search('ফেরত', createTestContext({ module: 'assistant', locale: 'bn' }))
    expect(r.hits.map((h) => h.content)).toEqual(['৭ দিনের মধ্যে ফেরত।'])
  })

  it('filters by visibility and returns deduped citations', async () => {
    const services = createFakeServices({ adapters: { knowledge: makeAdapter({}) } })
    const svc = createKnowledgeService(() => services)
    const sys = services.systemContext({} as never, { module: 'core' })
    await svc.indexDoc('pages', { id: 'p', title: 'Returns policy', text: 'Returns accepted within 7 days.' }, sys)
    await svc.indexDoc('pages', { id: 's', title: 'Staff returns notes', text: 'Returns internal escalation.', visibility: 'staff' }, sys)
    const visitor = createTestContext({ module: 'assistant' })
    const r = await svc.search('returns', visitor)
    expect(r.hits.map((h) => h.sourceId)).toEqual(['p'])
    expect(r.citations).toEqual([{ title: 'Returns policy', url: undefined, sourceCollection: 'pages', sourceId: 'p' }])
    const staff = createTestContext({ module: 'copilot', actor: { kind: 'staff', roles: ['super-admin'] } })
    expect((await svc.search('returns', staff)).hits).toHaveLength(2)
  })
})
