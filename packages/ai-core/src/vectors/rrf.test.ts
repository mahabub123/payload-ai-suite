import { describe, expect, it } from 'vitest'
import { rrfMerge } from './index'

describe('rrfMerge', () => {
  it('ranks items found by both lists above single-list items', () => {
    const vec = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const kw = [{ id: 'c' }, { id: 'd' }, { id: 'b' }]
    const out = rrfMerge([vec, kw], 60)
    expect(out.map((x) => x.id)).toEqual(['c', 'b', 'a', 'd'])
    expect(out[0].score).toBeCloseTo(1 / 61 + 1 / 63)
  })

  it('keeps first-seen order on ties and preserves item data', () => {
    const out = rrfMerge([[{ id: 'x', v: 1 }], [{ id: 'y', v: 2 }]])
    expect(out.map((x) => x.id)).toEqual(['x', 'y'])
    expect(out[0].score).toBe(out[1].score)
    expect(out[1].v).toBe(2)
  })

  it('handles empty lists', () => {
    expect(rrfMerge([[], []])).toEqual([])
  })
})
