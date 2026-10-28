import { describe, expect, it } from 'vitest'
import { createMemoryRateLimiter, createRateLimiter } from './index'

describe('rate limiter (sliding window)', () => {
  it('allows up to the limit, then blocks until the window slides', async () => {
    let t = 0
    const rl = createMemoryRateLimiter(() => t)
    const opts = { limit: 3, windowSec: 60 }
    expect((await rl.hit('v:1', opts)).remaining).toBe(2)
    await rl.hit('v:1', opts)
    expect((await rl.hit('v:1', opts)).ok).toBe(true)
    const blocked = await rl.hit('v:1', opts)
    expect(blocked.ok).toBe(false)
    expect(blocked.resetSec).toBe(60)
    expect((await rl.hit('v:2', opts)).ok).toBe(true)
    t = 30_000
    expect((await rl.hit('v:1', opts)).ok).toBe(false)
    t = 60_001
    expect((await rl.hit('v:1', opts)).ok).toBe(true)
  })

  it('falls back to memory with a warning when ioredis is not installed', async () => {
    const warnings: string[] = []
    const rl = createRateLimiter({ redisUrl: 'redis://localhost:6399', logger: { warn: (m) => warnings.push(m) } })
    const r = await rl.hit('k', { limit: 1, windowSec: 10 })
    expect(r.ok).toBe(true)
    expect((await rl.hit('k', { limit: 1, windowSec: 10 })).ok).toBe(false)
    expect(warnings.join()).toMatch(/ioredis/)
  })
})
