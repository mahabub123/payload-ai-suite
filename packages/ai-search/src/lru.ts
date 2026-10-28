/** Small Map-based LRU with hit/miss counters. */
export class LRU<K, V> {
  private map = new Map<K, V>()
  hits = 0
  misses = 0

  constructor(readonly max: number) {}

  get(key: K): V | undefined {
    const v = this.map.get(key)
    if (v === undefined) {
      this.misses++
      return undefined
    }
    this.hits++
    this.map.delete(key)
    this.map.set(key, v)
    return v
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, value)
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value as K)
  }

  get size(): number {
    return this.map.size
  }

  clear(): void {
    this.map.clear()
  }
}

/** Normalised cache key for a query: NFKC, lowercase, single spaces. */
export const normalizeQuery = (q: string): string => q.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
