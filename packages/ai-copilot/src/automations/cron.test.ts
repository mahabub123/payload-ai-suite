import { describe, expect, it } from 'vitest'
import { cronDueBetween, cronMatches } from './cron'

describe('cron', () => {
  it('matches fields, steps and ranges (UTC)', () => {
    expect(cronMatches('0 8 * * 1', new Date('2026-10-26T08:00:00Z'))).toBe(true) // Monday
    expect(cronMatches('0 8 * * 1', new Date('2026-10-27T08:00:00Z'))).toBe(false)
    expect(cronMatches('*/15 9-17 * * *', new Date('2026-10-27T10:45:00Z'))).toBe(true)
    expect(cronMatches('*/15 9-17 * * *', new Date('2026-10-27T18:00:00Z'))).toBe(false)
  })
  it('detects a firing since the last dispatch', () => {
    const now = new Date('2026-10-27T08:03:00Z')
    expect(cronDueBetween('0 8 * * *', new Date('2026-10-27T07:58:00Z'), now)).toBe(true)
    expect(cronDueBetween('0 8 * * *', new Date('2026-10-27T08:00:00Z'), now)).toBe(false)
  })
})
