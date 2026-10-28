import { describe, expect, it } from 'vitest'
import { AIError } from '@payload-ai-suite/ai-core'
import { createMediaHarness } from '../test/setup'
import { SKIP_CONTEXT_KEY } from './constants'

const media = (h: ReturnType<typeof createMediaHarness>) => [...h.payload.store.get('media')!.values()]

describe('media ops', () => {
  it('variation creates a NEW media doc labelled AI-generated; the original is untouched', async () => {
    const h = createMediaHarness()
    const before = structuredClone(h.payload.store.get('media')!.get('m2'))
    const r = await h.call('variation', { id: 'm2', instructions: 'warmer light' })
    expect(r.created).toHaveLength(1)
    const created = h.payload.store.get('media')!.get(r.created[0].id)!
    expect(created).toMatchObject({ aiGenerated: true, aiSource: 'm2', aiModel: 'mock:mock-image', aiOperation: 'variation', mimeType: 'image/png' })
    expect(created.alt).toBe('Staff-written alt (AI variation)')
    expect(created.filename).toMatch(/^kurti-ai-variation-.*\.png$/)
    expect(h.payload.store.get('media')!.get('m2')).toEqual(before)
    expect(h.payload.calls.filter((c) => c.op === 'update')).toHaveLength(0)
    const create = h.payload.calls.find((c) => c.op === 'create')!
    expect(create.args.overrideAccess).toBe(false)
    expect(create.args.context[SKIP_CONTEXT_KEY]).toBe(true)
    expect(create.args.file.data.length).toBeGreaterThan(0)
  })

  it('remove-background and lifestyle also save new docs', async () => {
    const h = createMediaHarness()
    const n = media(h).length
    await h.call('remove-background', { id: 'm1' })
    await h.call('lifestyle', { id: 'm1', scene: 'a Dhaka rooftop at sunset' })
    expect(media(h)).toHaveLength(n + 2)
    expect(media(h).filter((d) => d.aiGenerated).map((d) => d.aiOperation)).toEqual(['remove-background', 'lifestyle'])
  })

  it('respects aiExclude and only processes images', async () => {
    const h = createMediaHarness()
    await expect(h.call('variation', { id: 'm3' })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(h.call('alt-text', { id: 'pdf' })).rejects.toMatchObject({ code: 'validation' })
    await expect(h.call('alt-text', { id: 'm1', collection: 'users' })).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('budget errors come back with a clear message', async () => {
    const h = createMediaHarness()
    h.services.ai.generateImage = async () => {
      throw new AIError('budget_exceeded', 'Budget exhausted')
    }
    await expect(h.call('variation', { id: 'm1' })).rejects.toMatchObject({
      code: 'budget_exceeded',
      message: expect.stringMatching(/AI budget for media is used up/),
    })
  })

  it('alt-text returns a suggestion and writes it with the caller access when apply is set', async () => {
    const h = createMediaHarness()
    h.services.provider.enqueue({ object: { alt: 'Red saree', tags: ['saree'] } })
    const r = await h.call('alt-text', { id: 'm2', apply: true })
    expect(r.alt).toBe('Red saree')
    const u = h.payload.calls.find((c) => c.op === 'update')!
    expect(u.args).toMatchObject({ overrideAccess: false, data: { alt: 'Red saree' } })
    expect(u.args.context[SKIP_CONTEXT_KEY]).toBe(true)
  })

  it('image-to-listing returns a draft for review with only real categories', async () => {
    const h = createMediaHarness()
    h.services.provider.enqueue({
      object: {
        title: 'Red Jamdani Saree',
        description: 'Handwoven saree.',
        attributes: [{ name: 'color', value: 'red' }],
        tags: ['saree'],
        categoryIds: ['c1', 'Wedding', 'Kurtis'],
      },
    })
    const r = await h.call('image-to-listing', { id: 'm1' })
    expect(r.draft).toMatchObject({ title: 'Red Jamdani Saree', attributes: { color: 'red' }, categoryIds: ['c1', 'c2'], imageId: 'm1' })
    expect(h.payload.calls.filter((c) => c.op === 'create' || c.op === 'update')).toHaveLength(0)
  })
})
