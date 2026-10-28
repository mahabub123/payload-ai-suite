import { describe, expect, it } from 'vitest'
import { createHarness } from '../test/setup'
import { prepareGeneration } from './generate'
import { ACTIONS, DEFAULT_PROMPTS, languageName, localeNote } from './prompts'

describe('prompt library defaults', () => {
  it('registers one template per action slug', () => {
    const slugs = new Set(DEFAULT_PROMPTS.map((p) => p.slug))
    for (const def of Object.values(ACTIONS)) expect(slugs.has(def.slug)).toBe(true)
  })

  it('knows English and Bangla wording', () => {
    expect(languageName('bn')).toMatch(/Bangla/)
    expect(languageName('bn-BD')).toMatch(/Bangla/)
    expect(localeNote('bn')).toMatch(/Bengali script/)
    expect(languageName('fr')).toBe('French')
  })
})

describe('prompt rendering vars', () => {
  it('renders locale, staff instructions and quoted product data — without prices', async () => {
    const h = await createHarness()
    const p = await prepareGeneration(
      { action: 'write', collection: 'products', docId: 'p1', field: 'summary', locale: 'bn', instructions: 'Mention it is festive' },
      h.ctx,
      h.services,
    )
    expect(p.rendered.slug).toBe('content.describe')
    expect(p.rendered.system).toContain('Bangla (Bengali)')
    expect(p.rendered.system).toContain('locale "bn"')
    expect(p.rendered.system).toMatch(/Bengali script/)
    const user = String(p.rendered.user)
    expect(user).toContain('Additional instructions from staff: Mention it is festive')
    expect(user).toContain('<product>')
    expect(user).toContain('Jamdani saree')
    expect(user).not.toMatch(/450000|price/i)
    expect(user).toContain('plain text only')
  })

  it('uses Markdown format for rich text and the target language for translate', async () => {
    const h = await createHarness()
    const p = await prepareGeneration(
      { action: 'translate', collection: 'products', docId: 'p1', field: 'description', locale: 'en', targetLocale: 'bn', currentValue: 'Red saree' },
      h.ctx,
      h.services,
    )
    expect(p.rendered.system).toContain('Bangla')
    expect(p.rendered.user).toContain('from English into Bangla (Bengali)')
    expect(p.rendered.user).toContain('Output Markdown')
    expect(p.rendered.user).toContain('<source>\nRed saree')
  })

  it('rejects rewrite of an empty field and unknown fields', async () => {
    const h = await createHarness()
    await expect(prepareGeneration({ action: 'rewrite', collection: 'products', field: 'summary' }, h.ctx, h.services)).rejects.toMatchObject({
      code: 'validation',
    })
    await expect(prepareGeneration({ action: 'write', collection: 'products', field: 'price' }, h.ctx, h.services)).rejects.toMatchObject({
      code: 'validation',
    })
  })

  it('attaches the photo as an image part for vision actions', async () => {
    const h = await createHarness()
    const p = await prepareGeneration(
      { action: 'from-photo', collection: 'products', field: 'summary', imageUrl: '/media/saree.jpg' },
      h.ctx,
      h.services,
    )
    expect(p.needsVision).toBe(true)
    const content = p.messages[0].content as { type: string; url?: string }[]
    expect(content[1]).toEqual({ type: 'image', url: 'http://localhost:3000/media/saree.jpg' })
  })
})
