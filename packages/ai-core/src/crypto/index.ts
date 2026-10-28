import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Crypto } from '../contracts'
import { AIError } from '../contracts'

export interface CryptoDeps {
  /** Explicit secret (wins over env). */
  secret?: string
  /** Env var holding the secret. Default PAYLOAD_SECRET. */
  secretEnv?: string
  env?: Record<string, string | undefined>
}

const PREFIX = 'v1'

/**
 * AES-256-GCM encryption + HMAC-SHA256 id hashing, both keyed from one server secret
 * (separate derived keys). Cipher format: `v1:<iv>:<tag>:<ciphertext>` (base64url).
 */
export const createCrypto = (deps: CryptoDeps = {}): Crypto => {
  const env = deps.env ?? process.env
  const secretEnv = deps.secretEnv ?? 'PAYLOAD_SECRET'
  let keys: { enc: Buffer; mac: Buffer } | undefined
  const getKeys = () => {
    if (keys) return keys
    const secret = deps.secret ?? env[secretEnv]
    if (!secret || secret.length < 16) {
      throw new AIError('unavailable', `[ai-suite] Missing or too short server secret (env ${secretEnv}); need at least 16 chars, 32+ recommended.`)
    }
    keys = {
      enc: createHash('sha256').update(`ai-suite:enc:${secret}`).digest(),
      mac: createHash('sha256').update(`ai-suite:mac:${secret}`).digest(),
    }
    return keys
  }

  return {
    encrypt(plain) {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', getKeys().enc, iv)
      const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
      const tag = cipher.getAuthTag()
      return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join(':')
    },
    decrypt(value) {
      const parts = value.split(':')
      if (parts.length !== 4 || parts[0] !== PREFIX) throw new AIError('bad_request', 'Malformed encrypted value')
      const [, iv, tag, ct] = parts
      try {
        const decipher = createDecipheriv('aes-256-gcm', getKeys().enc, Buffer.from(iv, 'base64url'))
        decipher.setAuthTag(Buffer.from(tag, 'base64url'))
        return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8')
      } catch (cause) {
        throw new AIError('auth', 'Could not decrypt value (wrong secret or tampered data)', { cause })
      }
    },
    hashId(value) {
      return createHmac('sha256', getKeys().mac).update(value).digest('base64url')
    },
  }
}

/** Constant-time comparison of two hashes. */
export const safeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}
