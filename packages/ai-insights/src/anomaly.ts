/** Normal-band anomaly detection over a trailing window (§10.6 anomaly alerts). */

export interface Band {
  center: number
  spread: number
  lower: number
  upper: number
  method: 'robust' | 'zscore'
}

export interface AnomalyResult extends Band {
  value: number
  anomalous: boolean
  direction: 'high' | 'low' | null
  /** (value - center) / spread; 0 when spread is 0 and value equals center. */
  score: number
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const stdev = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1))
}

/**
 * Band = center ± k·spread. 'robust' uses median and 1.4826·MAD (resistant to past spikes), falling back to
 * mean ± k·sd when MAD is 0. `minSpread` stops tiny, flat series (e.g. 0–1 orders a day) from alerting on noise.
 */
export const normalBand = (history: number[], k = 3, opts: { method?: 'robust' | 'zscore'; minSpread?: number } = {}): Band => {
  const method = opts.method ?? 'robust'
  let center: number
  let spread: number
  let used: Band['method'] = method
  if (method === 'robust') {
    center = median(history)
    spread = 1.4826 * median(history.map((x) => Math.abs(x - center)))
    if (spread === 0) {
      used = 'zscore'
      center = mean(history)
      spread = stdev(history)
    }
  } else {
    center = mean(history)
    spread = stdev(history)
  }
  spread = Math.max(spread, opts.minSpread ?? 0)
  return { center, spread, lower: center - k * spread, upper: center + k * spread, method: used }
}

export const detectAnomaly = (
  history: number[],
  value: number,
  k = 3,
  opts: { method?: 'robust' | 'zscore'; minSpread?: number; minHistory?: number } = {},
): AnomalyResult => {
  const clean = history.filter((x) => Number.isFinite(x))
  if (clean.length < (opts.minHistory ?? 7)) {
    return { value, anomalous: false, direction: null, score: 0, center: NaN, spread: NaN, lower: NaN, upper: NaN, method: opts.method ?? 'robust' }
  }
  const band = normalBand(clean, k, opts)
  const score = band.spread > 0 ? (value - band.center) / band.spread : value === band.center ? 0 : Math.sign(value - band.center) * Infinity
  const anomalous = value > band.upper || value < band.lower
  return { ...band, value, score, anomalous, direction: anomalous ? (value > band.upper ? 'high' : 'low') : null }
}
