import { describe, expect, it } from 'vitest'
import { detectAnomaly, normalBand } from './anomaly'
import { evaluateSeries } from './jobs/anomalies'

const history = [100, 104, 98, 101, 97, 103, 99, 102, 100, 98, 101, 99, 100, 103, 97, 102, 100, 99, 101, 98, 102, 100, 101, 99, 100, 98, 102, 101]

describe('anomaly band', () => {
  it('robust band = median ± k·1.4826·MAD and flags values outside', () => {
    const b = normalBand(history, 3)
    expect(b.method).toBe('robust')
    expect(b.center).toBe(100)
    expect(b.lower).toBeLessThan(97)
    expect(b.upper).toBeGreaterThan(103)
    expect(detectAnomaly(history, 101).anomalous).toBe(false)
    expect(detectAnomaly(history, 140)).toMatchObject({ anomalous: true, direction: 'high' })
    expect(detectAnomaly(history, 40)).toMatchObject({ anomalous: true, direction: 'low' })
  })

  it('is resistant to a past spike (robust) where the z-score band widens', () => {
    const spiky = [...history.slice(0, 27), 1_000]
    expect(detectAnomaly(spiky, 130).anomalous).toBe(true)
    expect(detectAnomaly(spiky, 130, 3, { method: 'zscore' }).anomalous).toBe(false)
  })

  it('sensitivity k widens/narrows the band; minSpread and minHistory suppress noise', () => {
    expect(detectAnomaly(history, 105, 2).anomalous).toBe(true)
    expect(detectAnomaly(history, 105, 5).anomalous).toBe(false)
    const flat = new Array(28).fill(0)
    expect(detectAnomaly(flat, 1).anomalous).toBe(true)
    expect(detectAnomaly(flat, 1, 3, { minSpread: 1 }).anomalous).toBe(false)
    expect(detectAnomaly([1, 2, 3], 100).anomalous).toBe(false)
  })

  it('evaluateSeries checks the last day against the trailing window', () => {
    const keys = history.map((_, i) => `d${i}`).concat('today')
    const flagged = evaluateSeries(
      [
        { metric: 'orders', keys, values: [...history, 300] },
        { metric: 'revenue', keys, values: [...history, 101], currency: 'BDT' },
        { metric: 'aov', keys, values: [...history, NaN] },
      ],
      3,
    )
    expect(flagged).toHaveLength(1)
    expect(flagged[0]).toMatchObject({ metric: 'orders', day: 'today', direction: 'high' })
  })
})
