/**
 * Thresholds (absolute floors) and regression check against a recorded baseline per route.
 * Higher-is-better metrics only; latency metrics are reported but not gated in mock mode.
 */
export const THRESHOLDS: Record<string, number> = {
  'assistant.en.passRate': 0.9,
  'assistant.bn.passRate': 0.85,
  'assistant.security.passRate': 1,
  'search.en.recallAt5': 0.8,
  'search.en.mrr': 0.6,
  'search.bn.recallAt5': 0.7,
  'search.bn.mrr': 0.5,
  'content.en.passRate': 0.9,
  'content.bn.passRate': 0.85,
}

/** Allowed drop vs baseline before it counts as a regression. */
export const TOLERANCE = 0.02

export type BaselineFile = Record<string, { updatedAt: string; metrics: Record<string, number> }>

export interface Verdict {
  metric: string
  value: number
  threshold?: number
  baseline?: number
  ok: boolean
  why?: string
}

export const judge = (metrics: Record<string, number>, baseline?: Record<string, number>): Verdict[] =>
  Object.entries(metrics)
    .filter(([m]) => !m.includes('latency'))
    .map(([metric, value]) => {
      const threshold = THRESHOLDS[metric]
      const base = baseline?.[metric]
      if (threshold !== undefined && value < threshold) return { metric, value, threshold, baseline: base, ok: false, why: `below threshold ${threshold}` }
      if (base !== undefined && value < base - TOLERANCE) return { metric, value, threshold, baseline: base, ok: false, why: `regressed from ${base.toFixed(3)}` }
      return { metric, value, threshold, baseline: base, ok: true }
    })
