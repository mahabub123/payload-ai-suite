import { describe, expect, it } from 'vitest'
import { createCrypto } from './index'

describe('crypto', () => {
  const c = createCrypto({ secret: 'x'.repeat(32) })

  it('round-trips with AES-256-GCM and random IVs', () => {
    const a = c.encrypt('sk-secret-123')
    const b = c.encrypt('sk-secret-123')
    expect(a).not.toEqual(b)
    expect(a).not.toContain('sk-secret')
    expect(c.decrypt(a)).toBe('sk-secret-123')
    expect(c.decrypt(c.encrypt('বাংলা ✓'))).toBe('বাংলা ✓')
  })

  it('rejects tampering and wrong secrets', () => {
    const enc = c.encrypt('hello')
    const parts = enc.split(':')
    parts[3] = Buffer.from('evil').toString('base64url')
    expect(() => c.decrypt(parts.join(':'))).toThrow(/decrypt/)
    expect(() => createCrypto({ secret: 'y'.repeat(32) }).decrypt(enc)).toThrow()
  })

  it('hashes ids deterministically per secret', () => {
    expect(c.hashId('cust_1')).toBe(c.hashId('cust_1'))
    expect(c.hashId('cust_1')).not.toBe(c.hashId('cust_2'))
    expect(createCrypto({ secret: 'z'.repeat(32) }).hashId('cust_1')).not.toBe(c.hashId('cust_1'))
  })

  it('reads the secret from env and fails clearly when missing', () => {
    expect(createCrypto({ env: { PAYLOAD_SECRET: 's'.repeat(32) } }).decrypt(createCrypto({ secret: 's'.repeat(32) }).encrypt('ok'))).toBe('ok')
    expect(() => createCrypto({ env: {} }).encrypt('x')).toThrow(/PAYLOAD_SECRET/)
  })
})
