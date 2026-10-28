import { describe, expect, it } from 'vitest'
import { CATEGORIES, createHarness } from '../test/setup'
import { SEO_LIMITS } from './prompts'
import { clampText, enforceSeo, normalizeTags, validateCategories } from './validate'

describe('category validation', () => {
  it('keeps only existing categories (ids, titles or slugs) and drops unknowns', () => {
    const r = validateCategories(['c1', 'Kurtis', 'Lehengas', 'c9', 'sarees'], CATEGORIES)
    expect(r.map((c) => c.id)).toEqual(['c1', 'c2'])
  })

  it('tags action returns only real categories', async () => {
    const h = await createHarness()
    h.services.provider.enqueue({ object: { tags: ['#Saree', 'red', 'red', 'handwoven'], categoryIds: ['c1', 'Bridal Wear', 'x99'] } })
    const r = await h.call('/ai/content/generate', { action: 'tags', collection: 'products', docId: 'p1', field: 'aiTags' })
    expect(r.data.categoryIds).toEqual(['c1'])
    expect(r.data.categories).toEqual([{ id: 'c1', title: 'Sarees' }])
    expect(r.data.tags).toEqual(['Saree', 'red', 'handwoven'])
    expect(r.value).toEqual(['Saree', 'red', 'handwoven'])
    // the prompt listed the real categories as quoted data
    const sent = JSON.stringify(h.services.provider.calls.at(-1)?.messages)
    expect(sent).toContain('c1: Sarees')
  })
})

describe('SEO limits', () => {
  it('clamps at a word boundary', () => {
    const s = clampText('word '.repeat(40), 60)
    expect(s.length).toBeLessThanOrEqual(60)
    expect(s.endsWith('word')).toBe(true)
  })

  it('enforces title ≤ 60 and description ≤ 160 even when the model overshoots', async () => {
    const long = enforceSeo({ title: 'Handwoven red jamdani saree '.repeat(5), description: 'Soft breathable cotton for weddings and festivals. '.repeat(8) })
    expect(long.title.length).toBeLessThanOrEqual(SEO_LIMITS.title)
    expect(long.description.length).toBeLessThanOrEqual(SEO_LIMITS.description)

    const h = await createHarness()
    h.services.provider.enqueue({ object: { title: 'A'.repeat(90), description: 'b '.repeat(200) } })
    const title = await h.call('/ai/content/generate', { action: 'seo', collection: 'products', docId: 'p1', field: 'meta.title' })
    expect(title.output.length).toBeLessThanOrEqual(60)
    expect(title.data.description.length).toBeLessThanOrEqual(160)

    h.services.provider.enqueue(JSON.stringify({ title: 'Red Jamdani Saree', description: 'c '.repeat(200) }))
    const desc = await h.call('/ai/content/generate', { action: 'seo', collection: 'products', docId: 'p1', field: 'meta.description' })
    expect(desc.output).toBe(desc.data.description)
    expect(desc.output.length).toBeLessThanOrEqual(160)
  })

  it('works for Bangla text (counts characters, not bytes)', () => {
    const bn = 'হাতে বোনা লাল জামদানি শাড়ি '.repeat(6)
    expect([...clampText(bn, 60)].length).toBeLessThanOrEqual(60)
  })
})

describe('tags', () => {
  it('normalizes, de-duplicates and caps', () => {
    expect(normalizeTags(['A', 'a', ' b ', '', '#c', ...'defghijkl'.split('')])).toHaveLength(8)
  })
})
