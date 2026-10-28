import { describe, expect, it } from 'vitest'
import { loadCases, materialize } from './run'

describe('red-team prompt set', () => {
  it('covers every required category with unique ids and an expectation', async () => {
    const cases = await loadCases()
    const cats = new Set(cases.map((c) => c.category))
    for (const k of ['injection', 'xss', 'oversized', 'budget-bypass', 'cross-customer']) expect(cats.has(k)).toBe(true)
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length)
    for (const c of cases) expect(Object.keys(c.expect).length).toBeGreaterThan(0)
  })
  it('oversized inputs exceed the default 2,000-char shopper limit', async () => {
    const big = (await loadCases()).filter((c) => c.category === 'oversized')
    for (const c of big) expect(materialize(c.input).length).toBeGreaterThan(2000)
  })
})
