import { describe, expect, it } from 'vitest'
import { computeCostMicros } from './cost'

const model = { inputPriceMicrosPerM: 150_000, outputPriceMicrosPerM: 600_000 }

describe('cost math', () => {
  it('prices input and output tokens per million', () => {
    // 1M in * $0.15 + 0.5M out * $0.60 = $0.45
    expect(computeCostMicros({ inputTokens: 1_000_000, outputTokens: 500_000 }, model)).toBe(450_000)
    expect(computeCostMicros({ inputTokens: 3500, outputTokens: 250 }, model)).toBe(675)
  })

  it('bills cached input at the cached rate (explicit or 50% default)', () => {
    const u = { inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: 400_000 }
    expect(computeCostMicros(u, model)).toBe(600_000 * 0.15 + 400_000 * 0.075)
    expect(computeCostMicros(u, { ...model, cachedInputPriceMicrosPerM: 15_000 })).toBe(90_000 + 6_000)
    // cached can never exceed total input
    expect(computeCostMicros({ inputTokens: 100, outputTokens: 0, cachedInputTokens: 1000 }, { inputPriceMicrosPerM: 1_000_000, cachedInputPriceMicrosPerM: 0 })).toBe(0)
  })

  it('reported (gateway) cost takes precedence over the price table', () => {
    expect(computeCostMicros({ inputTokens: 1_000_000, outputTokens: 1_000_000, reportedCostMicros: 1234 }, model)).toBe(1234)
    expect(computeCostMicros({ inputTokens: 10, outputTokens: 10, reportedCostMicros: 0 }, model)).toBe(0)
  })

  it('prices images and returns integers', () => {
    expect(computeCostMicros({ inputTokens: 0, outputTokens: 0 }, { imagePriceMicros: 40_000 }, { images: 3 })).toBe(120_000)
    expect(Number.isInteger(computeCostMicros({ inputTokens: 7, outputTokens: 3 }, model))).toBe(true)
    expect(computeCostMicros({ inputTokens: 7, outputTokens: 3 }, undefined)).toBe(0)
  })
})
