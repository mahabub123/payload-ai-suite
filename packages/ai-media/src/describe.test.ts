import { describe, expect, it } from 'vitest'
import { createFakeServices } from 'payload-ai-core/testing'
import { createMediaHarness } from '../test/setup'
import { SKIP_CONTEXT_KEY } from './constants'
import { describeMedia } from './describe'

const doc = (h: ReturnType<typeof createMediaHarness>, id: string) => h.payload.store.get('media')!.get(id)!
const updates = (h: ReturnType<typeof createMediaHarness>) => h.payload.calls.filter((c) => c.op === 'update')

describe('ai-media-describe job', () => {
  it('fills empty alt text (and tags) using a vision call', async () => {
    const h = createMediaHarness()
    h.services.provider.enqueue({ object: { alt: 'Photo of a red jamdani saree with gold border, folded', tags: ['Saree', 'red', 'saree'] } })
    const r = await describeMedia(h.payload, { collection: 'media', id: 'm1' }, {}, h.services)
    expect(r.status).toBe('described')
    expect(doc(h, 'm1').alt).toBe('a red jamdani saree with gold border, folded')
    expect(doc(h, 'm1').aiTags).toEqual(['saree', 'red'])
    const req = h.services.provider.calls[0]
    const parts = req.messages[0].content as { type: string; url?: string }[]
    expect(parts[1]).toMatchObject({ type: 'image', url: 'http://localhost:3000/api/media/file/saree.jpg' })
    expect(updates(h)[0].args.context).toEqual({ [SKIP_CONTEXT_KEY]: true })
  })

  it('never overwrites existing alt text by default', async () => {
    const h = createMediaHarness()
    h.services.provider.enqueue({ object: { alt: 'AI alt', tags: ['kurti'] } })
    await describeMedia(h.payload, { collection: 'media', id: 'm2' }, {}, h.services)
    expect(doc(h, 'm2').alt).toBe('Staff-written alt')
    expect(doc(h, 'm2').aiTags).toEqual(['kurti'])
    expect(updates(h)[0].args.data).toEqual({ aiTags: ['kurti'] })
  })

  it('overwrites alt only when overwriteAlt is set', async () => {
    const h = createMediaHarness()
    h.services.provider.enqueue({ object: { alt: 'Blue cotton kurti', tags: [] } })
    await describeMedia(h.payload, { collection: 'media', id: 'm2' }, { overwriteAlt: true }, h.services)
    expect(doc(h, 'm2').alt).toBe('Blue cotton kurti')
  })

  it('skips when nothing is missing, aiExclude docs and non-images, without a model call', async () => {
    const h = createMediaHarness()
    h.payload.store.get('media')!.set('m4', { id: 'm4', filename: 'a.jpg', mimeType: 'image/jpeg', url: '/a.jpg', alt: 'x', aiTags: ['y'] })
    expect((await describeMedia(h.payload, { collection: 'media', id: 'm4' }, {}, h.services)).status).toBe('skipped')
    expect((await describeMedia(h.payload, { collection: 'media', id: 'm3' }, {}, h.services)).status).toBe('excluded')
    expect((await describeMedia(h.payload, { collection: 'media', id: 'pdf' }, {}, h.services)).status).toBe('not-image')
    expect(h.services.provider.calls).toHaveLength(0)
  })

  it('writes alt per locale when alt is localized (Bangla wording in the prompt)', async () => {
    const h = createMediaHarness({ localizedAlt: true })
    // The fake store is not locale-aware: the bn locale still has no alt.
    const find = h.payload.findByID.bind(h.payload)
    ;(h.payload as any).findByID = async (a: any) => ({ ...(await find(a)), ...(a.locale === 'bn' ? { alt: undefined } : {}) })
    h.services.provider.enqueue({ object: { alt: 'Red saree', tags: ['saree'] } }, { object: { alt: 'লাল শাড়ি', tags: [] } })
    await describeMedia(h.payload, { collection: 'media', id: 'm1' }, { locales: ['en', 'bn'] }, h.services)
    const u = updates(h)
    expect(u.map((x) => [x.args.locale, x.args.data.alt])).toEqual([
      ['en', 'Red saree'],
      ['bn', 'লাল শাড়ি'],
    ])
    expect(h.services.provider.calls[1].system).toMatch(/Bengali script/)
  })

  it('stops quietly when the budget is spent (no retry storm)', async () => {
    const h = createMediaHarness()
    const broke = createFakeServices({ budgetExceeded: true })
    for (const p of h.def.prompts ?? []) broke.prompts.registerDefault(p, 'media')
    const r = await describeMedia(h.payload, { collection: 'media', id: 'm1' }, {}, broke)
    expect(r.status).toBe('budget')
    expect(doc(h, 'm1').alt).toBeUndefined()
  })
})
