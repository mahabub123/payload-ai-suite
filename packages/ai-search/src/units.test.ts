import { describe, expect, it } from 'vitest'
import { parsePricePhrase, toMinor, validateParsedFilters } from './filters'
import { applyBusinessRules, buildSynonymMap, decodeCursor, encodeCursor, expandWithSynonyms, paginate, reciprocalRankFusion } from './ranking'
import { LRU } from './lru'
import { FACETS } from './test/helpers'

describe('reciprocal rank fusion + business rules', () => {
  it('fuses ranks: items high in both lists win', () => {
    const vector = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const text = [{ id: 'b' }, { id: 'd' }, { id: 'c' }]
    const fused = reciprocalRankFusion([vector, text], 60)
    expect(fused.map((x) => x.id)).toEqual(['b', 'c', 'a', 'd'])
    expect(fused[0].score).toBeCloseTo(1 / 62 + 1 / 61)
  })

  it('puts in-stock first, then boosted score; boost <= 0 hides', () => {
    const s = (inStock: boolean) => ({ inStock })
    const items = [
      { id: 'a', score: 0.9, summary: s(false) },
      { id: 'b', score: 0.5, summary: s(true) },
      { id: 'c', score: 0.4, summary: s(true) },
      { id: 'd', score: 0.3, summary: s(true) },
    ]
    expect(applyBusinessRules(items).map((x) => x.id)).toEqual(['b', 'c', 'd', 'a'])
    expect(applyBusinessRules(items, { d: 2, c: 0 }).map((x) => x.id)).toEqual(['d', 'b', 'a'])
  })
})

describe('cursor pagination', () => {
  it('round-trips and rejects garbage', () => {
    expect(decodeCursor(encodeCursor({ o: 24, s: 'abc' }))).toEqual({ o: 24, s: 'abc' })
    expect(decodeCursor('not-a-cursor')).toEqual({ o: 0 })
    expect(decodeCursor(encodeCursor({ o: -5 }))).toEqual({ o: 0 })
  })

  it('slices pages and stops at the end', () => {
    const items = [1, 2, 3, 4, 5]
    const p1 = paginate(items, 0, 2, 's')
    expect(p1.page).toEqual([1, 2])
    const p3 = paginate(items, decodeCursor(paginate(items, decodeCursor(p1.nextCursor).o, 2).nextCursor).o, 2)
    expect(p3.page).toEqual([5])
    expect(p3.nextCursor).toBeUndefined()
  })
})

describe('price parsing', () => {
  it('parses "under 3,000 taka" to priceMax and minor units', () => {
    const r = parsePricePhrase('red dress under 3,000 taka')
    expect(r).toEqual({ text: 'red dress', priceMax: 3000, priceMin: undefined })
    expect(toMinor(r.priceMax!, 'BDT')).toBe(300000)
  })

  it('handles ranges, k suffix, symbols, Bangla digits and minimums', () => {
    expect(parsePricePhrase('shoes between 1000 and 2,500')).toMatchObject({ text: 'shoes', priceMin: 1000, priceMax: 2500 })
    expect(parsePricePhrase('bag ৳500-1500')).toMatchObject({ text: 'bag', priceMin: 500, priceMax: 1500 })
    expect(parsePricePhrase('watch over $50')).toMatchObject({ text: 'watch', priceMin: 50 })
    expect(parsePricePhrase('saree under 5k')).toMatchObject({ priceMax: 5000 })
    expect(parsePricePhrase('শাড়ি under ৩০০০ টাকা').priceMax).toBe(3000)
    expect(parsePricePhrase('size 8-10 boots')).toEqual({ text: 'size 8-10 boots', priceMin: undefined, priceMax: undefined })
  })

  it('uses currency minor digits', () => {
    expect(toMinor(1500, 'JPY')).toBe(1500)
    expect(toMinor(19.99, 'USD')).toBe(1999)
  })
})

describe('NL filter validation', () => {
  it('keeps only real catalog values', () => {
    const r = validateParsedFilters(
      { text: 'dress', categoryIds: ['cat-dress', 'Shoes', 'made-up'], color: 'RED', size: 'XXXL', attributes: { material: 'silk' }, priceMax: 3000, inStock: true },
      FACETS,
      'BDT',
    )
    expect(r.filters).toEqual({ categoryIds: ['cat-dress', 'cat-shoes'], priceMax: 300000, inStock: true, attributes: { color: ['Red'] } })
    expect(r.dropped).toEqual(expect.arrayContaining(['category:made-up', 'size:XXXL', 'attr.material:silk']))
  })

  it('drops invalid / inverted prices', () => {
    expect(validateParsedFilters({ priceMin: -5, priceMax: Number.NaN }, FACETS, 'BDT').filters).toEqual({})
    expect(validateParsedFilters({ priceMin: 500, priceMax: 100 }, FACETS, 'BDT').filters).toEqual({})
  })

  it('drops categories and attributes when facets are unavailable', () => {
    expect(validateParsedFilters({ categoryIds: ['cat-dress'], color: 'Red', priceMax: 10 }, null, 'USD').filters).toEqual({ priceMax: 1000 })
  })
})

describe('synonyms', () => {
  it('expands both directions with word boundaries', () => {
    const map = buildSynonymMap({ tee: ['t-shirt'], 'flip flops': ['sandals'] })
    expect(expandWithSynonyms('black tee', map)).toEqual(['black t-shirt'])
    expect(expandWithSynonyms('t-shirt', map)).toEqual(['tee'])
    expect(expandWithSynonyms('cheap flip flops', map)).toEqual(['cheap sandals'])
    expect(expandWithSynonyms('teepee', map)).toEqual([])
  })
})

describe('LRU', () => {
  it('evicts least recently used', () => {
    const l = new LRU<string, number>(2)
    l.set('a', 1)
    l.set('b', 2)
    l.get('a')
    l.set('c', 3)
    expect(l.get('b')).toBeUndefined()
    expect(l.get('a')).toBe(1)
  })
})
