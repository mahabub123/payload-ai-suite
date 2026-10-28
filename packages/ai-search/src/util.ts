import { createHash } from 'node:crypto'
import { AIError, isAIError } from 'payload-ai-core'

/** Reject with AIError('timeout') after `ms`; `onTimeout` aborts the underlying call. */
export const withTimeout = <T>(p: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      onTimeout?.()
      reject(new AIError('timeout', `Timed out after ${ms} ms`))
    }, ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })

export const errorCode = (e: unknown): string => (isAIError(e) ? e.code : 'unknown')

export const sha1 = (s: string): string => createHash('sha1').update(s).digest('hex')

export const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, Math.floor(n)))
