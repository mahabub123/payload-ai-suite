import { describe, expect, it } from 'vitest'
import { checkNumbers, collectEvidence, extractNumbers, stripNumbers } from './numbers'

describe('number matcher', () => {
  const evidence = collectEvidence({ totalMinor: 1_234_550, total: '৳12,345.50', orders: 42, ratePct: 61.2, rate: 0.083, label: 'last 7 days', day: '2026-10-21' })

  it('parses grouping, decimals, scale words, percents and Bangla digits', () => {
    expect(extractNumbers('৳1,23,456.50 and 1.2k, 3 million, 45%').map((t) => [t.value, t.percent])).toEqual([
      [123456.5, false],
      [1200, false],
      [3_000_000, false],
      [45, true],
    ])
    expect(extractNumbers('৪২ orders')[0].value).toBe(42)
  })

  it('accepts formatted, major-unit, rounded and percent forms of evidence', () => {
    expect(checkNumbers('Revenue ৳12,345.50 (about 12.3k, ~12,300) from 42 orders; abandonment 61.2%, conversion 8.3% in the last 7 days.', evidence).ok).toBe(true)
    expect(checkNumbers('Revenue ৳12,346 on Oct 21.', evidence).ok).toBe(true)
    expect(checkNumbers('Bengali: ৪২ orders', evidence).ok).toBe(true)
  })

  it('flags invented numbers', () => {
    const r = checkNumbers('Revenue ৳13,000.00 from 40 orders, up 15%.', evidence)
    expect(r.ok).toBe(false)
    expect(r.unverified.map((t) => t.raw)).toEqual(['৳13,000.00', '40', '15%'])
    expect(stripNumbers('Revenue ৳13,000.00 from 42 orders.', r.unverified.slice(0, 1))).toBe('Revenue [unverified] from 42 orders.')
  })

  it('ignores list markers', () => {
    expect(checkNumbers('Top:\n1. Shirt\n2) Mug', []).ok).toBe(true)
  })

  it('ignores period lengths but not counts or percents next to them', () => {
    expect(checkNumbers('I can check the last 90 days or the last 12 months, or ৭ দিন.', []).ok).toBe(true)
    expect(checkNumbers('40 orders in 90 days', []).unverified.map((t) => t.raw)).toEqual(['40'])
    expect(checkNumbers('up 15% days', []).ok).toBe(false)
  })
})
