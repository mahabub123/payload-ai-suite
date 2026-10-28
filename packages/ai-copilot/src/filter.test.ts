import { describe, expect, it } from 'vitest'
import { matchFilter, parseFilter, toWhere } from './filter'

describe('structured filter', () => {
  it('converts allowed operators to a Payload where', () => {
    const f = parseFilter({ and: [{ field: 'status', op: 'equals', value: 'draft' }, { field: 'price', op: 'greater_than', value: 100 }] })
    expect(toWhere(f)).toEqual({ and: [{ status: { equals: 'draft' } }, { price: { greater_than: 100 } }] })
  })

  it('rejects unknown operators', () => {
    expect(() => parseFilter({ field: 'title', op: '$where', value: 'x' })).toThrow()
    expect(() => parseFilter({ field: 'title', op: 'near', value: '1,2' })).toThrow()
  })

  it('rejects raw Payload/SQL-ish where objects and extra keys', () => {
    expect(() => parseFilter({ title: { equals: 'x' } })).toThrow()
    expect(() => parseFilter({ field: 'title', op: 'equals', value: 'x', raw: 'DROP TABLE' })).toThrow()
    expect(() => parseFilter({ field: 'title; DROP', op: 'equals', value: 'x' })).toThrow()
    expect(() => parseFilter({ field: 'password', op: 'exists', value: true })).toThrow()
  })

  it('rejects deep nesting', () => {
    let f: any = { field: 'a', op: 'equals', value: 1 }
    for (let i = 0; i < 6; i++) f = { and: [f] }
    expect(() => parseFilter(f)).toThrow()
  })

  it('evaluates in memory for automation conditions', () => {
    const f = parseFilter({ or: [{ field: 'rating', op: 'less_than_equal', value: 2 }, { field: 'body', op: 'contains', value: 'refund' }] })
    expect(matchFilter(f, { rating: 1, body: '' })).toBe(true)
    expect(matchFilter(f, { rating: 5, body: 'I want a REFUND' })).toBe(true)
    expect(matchFilter(f, { rating: 5, body: 'great' })).toBe(false)
  })
})
