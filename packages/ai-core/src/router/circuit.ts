export interface CircuitBreakerOptions {
  /** Failures within `windowMs` that open the circuit. Default 5. */
  threshold?: number
  /** Default 60s. */
  windowMs?: number
  /** Time an open circuit waits before letting a probe through (half-open). Default 30s. */
  cooldownMs?: number
  now?: () => number
}

export type CircuitState = 'closed' | 'open' | 'half-open'

/** Per-key (model ref) circuit breaker: opens after N failures in a sliding window; half-open after cooldown. */
export class CircuitBreaker {
  private readonly threshold: number
  private readonly windowMs: number
  private readonly cooldownMs: number
  private readonly now: () => number
  private readonly failures = new Map<string, number[]>()
  private readonly openedAt = new Map<string, number>()

  constructor(opts: CircuitBreakerOptions = {}) {
    this.threshold = opts.threshold ?? 5
    this.windowMs = opts.windowMs ?? 60_000
    this.cooldownMs = opts.cooldownMs ?? 30_000
    this.now = opts.now ?? Date.now
  }

  state(key: string): CircuitState {
    const opened = this.openedAt.get(key)
    if (opened === undefined) return 'closed'
    return this.now() - opened >= this.cooldownMs ? 'half-open' : 'open'
  }

  /** False while open; true when closed or half-open (probe allowed). */
  allow(key: string): boolean {
    return this.state(key) !== 'open'
  }

  success(key: string): void {
    this.failures.delete(key)
    this.openedAt.delete(key)
  }

  failure(key: string): void {
    const t = this.now()
    if (this.state(key) === 'half-open') {
      this.openedAt.set(key, t)
      return
    }
    const list = (this.failures.get(key) ?? []).filter((x) => t - x < this.windowMs)
    list.push(t)
    if (list.length >= this.threshold) {
      this.openedAt.set(key, t)
      this.failures.delete(key)
    } else this.failures.set(key, list)
  }

  reset(): void {
    this.failures.clear()
    this.openedAt.clear()
  }
}
