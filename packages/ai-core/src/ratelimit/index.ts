import type { RateLimiter } from '../contracts'

export interface RateLimiterDeps {
  /** Redis URL (or env var name via redisUrlEnv). When absent: in-memory. */
  redisUrl?: string
  redisUrlEnv?: string
  env?: Record<string, string | undefined>
  logger?: { warn: (msg: string) => void }
  /** Injectable clock for tests. */
  now?: () => number
}

/** In-memory sliding-window log. Good for a single Node process. */
export const createMemoryRateLimiter = (now: () => number = Date.now): RateLimiter & { reset(): void } => {
  const hits = new Map<string, number[]>()
  let calls = 0
  const sweep = (t: number) => {
    // Drop idle keys occasionally so memory stays bounded.
    for (const [k, list] of hits) if (!list.length || t - list[list.length - 1] > 86_400_000) hits.delete(k)
  }
  return {
    async hit(key, { limit, windowSec }) {
      const t = now()
      const windowMs = windowSec * 1000
      const list = (hits.get(key) ?? []).filter((x) => t - x < windowMs)
      if (++calls % 1000 === 0) sweep(t)
      if (list.length >= limit) {
        hits.set(key, list)
        return { ok: false, remaining: 0, resetSec: Math.max(1, Math.ceil((list[0] + windowMs - t) / 1000)) }
      }
      list.push(t)
      hits.set(key, list)
      return { ok: true, remaining: limit - list.length, resetSec: Math.max(1, Math.ceil((list[0] + windowMs - t) / 1000)) }
    },
    reset: () => hits.clear(),
  }
}

interface RedisMulti {
  zremrangebyscore(k: string, min: number, max: number): RedisMulti
  zadd(k: string, score: number, member: string): RedisMulti
  zcard(k: string): RedisMulti
  zrange(k: string, a: number, b: number, w: 'WITHSCORES'): RedisMulti
  pexpire(k: string, ms: number): RedisMulti
  exec(): Promise<[Error | null, unknown][] | null>
}

interface RedisLike {
  multi(): RedisMulti
  zrem(k: string, member: string): Promise<unknown>
}

const createRedisRateLimiter = (redis: RedisLike, now: () => number): RateLimiter => ({
  async hit(key, { limit, windowSec }) {
    const t = now()
    const windowMs = windowSec * 1000
    const k = `ai:rl:${key}`
    const member = `${t}:${Math.random().toString(36).slice(2)}`
    const res = await redis
      .multi()
      .zremrangebyscore(k, 0, t - windowMs)
      .zadd(k, t, member)
      .zcard(k)
      .zrange(k, 0, 0, 'WITHSCORES')
      .pexpire(k, windowMs)
      .exec()
    const count = Number(res?.[2]?.[1] ?? 0)
    const oldest = Number((res?.[3]?.[1] as string[] | undefined)?.[1] ?? t)
    const resetSec = Math.max(1, Math.ceil((oldest + windowMs - t) / 1000))
    if (count > limit) {
      await redis.zrem(k, member)
      return { ok: false, remaining: 0, resetSec }
    }
    return { ok: true, remaining: limit - count, resetSec }
  },
})

/**
 * Sliding-window rate limiter. Uses Redis (via `ioredis`, loaded dynamically only if installed) when a URL
 * is configured, otherwise in-memory with a warning that limits are per-process.
 */
export const createRateLimiter = (deps: RateLimiterDeps = {}): RateLimiter => {
  const now = deps.now ?? Date.now
  const memory = createMemoryRateLimiter(now)
  const url = deps.redisUrl ?? (deps.redisUrlEnv ? (deps.env ?? process.env)[deps.redisUrlEnv] : undefined)
  if (!url) return memory

  let backend: Promise<RateLimiter> | undefined
  const load = () =>
    (backend ??= (async () => {
      try {
        const modName = 'ioredis'
        const mod = (await import(/* @vite-ignore */ modName)) as { default?: new (url: string) => RedisLike }
        const Redis = mod.default ?? (mod as unknown as new (url: string) => RedisLike)
        return createRedisRateLimiter(new Redis(url), now)
      } catch {
        deps.logger?.warn('[ai-suite] Redis configured but `ioredis` is not installed; rate limits fall back to in-memory (per process).')
        return memory
      }
    })())
  return {
    async hit(key, opts) {
      const b = await load()
      try {
        return await b.hit(key, opts)
      } catch {
        return memory.hit(key, opts)
      }
    },
  }
}
