import { describe, expect, it } from 'vitest'
import { formatMoney, minorUnitDigits } from './format'

describe('formatMoney', () => {
  it('formats integer minor units per currency', () => {
    expect(formatMoney({ amount: 1234, currency: 'USD' }, 'en-US')).toBe('$12.34')
    expect(formatMoney({ amount: 1234, currency: 'JPY' }, 'en-US')).toBe('¥1,234')
    expect(minorUnitDigits('KWD')).toBe(3)
    expect(formatMoney({ amount: 250000, currency: 'bdt' }, 'en-US')).toContain('2,500.00')
  })

  it('uses the locale (Bangla digits and taka sign)', () => {
    const s = formatMoney({ amount: 250000, currency: 'BDT' }, 'bn-BD')
    expect(s).toContain('৳')
    expect(s).toMatch(/[০-৯]/)
  })

  it('is empty for missing money and survives unknown currencies', () => {
    expect(formatMoney(undefined)).toBe('')
    expect(formatMoney({ amount: 100, currency: 'NOT-A-CODE' })).toBe('1.00 NOT-A-CODE')
  })
})
