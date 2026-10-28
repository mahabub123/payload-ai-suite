import { createHmac, timingSafeEqual } from 'node:crypto'

export const hmacSha256Hex = (secret: string, data: string): string =>
  createHmac('sha256', secret).update(data, 'utf8').digest('hex')

/** Constant-time string comparison (length leak only). */
export const safeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab)
    return false
  }
  return timingSafeEqual(ab, bb)
}

/** Meta `X-Hub-Signature-256: sha256=<hex>` over the raw body with the app secret. */
export const verifyMetaSignature = (rawBody: string, header: string | null, appSecret: string | undefined): boolean => {
  if (!appSecret || !header?.startsWith('sha256=')) return false
  const given = header.slice('sha256='.length).trim().toLowerCase()
  return safeEqual(given, hmacSha256Hex(appSecret, rawBody))
}

/** HTTP Basic credentials `user:pass` compared against the configured secret. */
export const verifyBasicAuth = (header: string | null, expected: string | undefined): boolean => {
  if (!expected || !header?.toLowerCase().startsWith('basic ')) return false
  const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8')
  return safeEqual(decoded, expected)
}

export const env = (name: string, source: Record<string, string | undefined> = process.env): string | undefined => {
  const v = source[name]
  return v && v.length ? v : undefined
}

/** Bounded set for replay tokens (mailgun). */
export class ReplayCache {
  private seen = new Map<string, number>()
  constructor(private ttlMs: number, private max = 10_000) {}
  /** Returns false when the token was already seen inside the TTL. */
  add(token: string, now = Date.now()): boolean {
    for (const [k, t] of this.seen) {
      if (now - t > this.ttlMs || this.seen.size > this.max) this.seen.delete(k)
      else break
    }
    if (this.seen.has(token)) return false
    this.seen.set(token, now)
    return true
  }
}
