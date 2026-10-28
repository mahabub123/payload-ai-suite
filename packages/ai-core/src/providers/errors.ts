import { AIError, isAIError } from '../contracts'
import type { AIErrorCode } from '../contracts'

const CONTENT_FILTER = /content[ _-]?(filter|policy|management)|safety|blocked by|moderation|responsible ?ai/i
const RATE = /rate[ _-]?limit|too many requests|quota|resource[_ ]exhausted/i
const OVERLOAD = /overload|capacity|temporarily unavailable|server is busy/i
const TIMEOUT = /timed? ?out|timeout|deadline exceeded/i
const AUTH = /api[ _-]?key|unauthori[sz]ed|authentication|permission denied|invalid[_ ]?(x-)?api/i
const NETWORK = /ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|socket hang up|fetch failed|network/i

interface ErrLike {
  name?: string
  message?: string
  statusCode?: number
  status?: number
  responseBody?: string
  isRetryable?: boolean
  lastError?: unknown
  cause?: unknown
  code?: string
}

const fromStatus = (status: number, text: string): AIErrorCode => {
  if (status === 401 || status === 403) return CONTENT_FILTER.test(text) ? 'content_filtered' : 'auth'
  if (status === 429) return 'rate_limit'
  // Out of credits / payment required at the vendor or gateway: another provider in the route may still work.
  if (status === 402) return 'unavailable'
  if (status === 408 || status === 504) return 'timeout'
  if (status === 503 || status === 529) return 'overloaded'
  if (status >= 500) return OVERLOAD.test(text) ? 'overloaded' : 'unavailable'
  if (status === 400 || status === 404 || status === 413 || status === 422) return CONTENT_FILTER.test(text) ? 'content_filtered' : 'bad_request'
  return 'unknown'
}

/** Map any vendor/SDK/network error onto the suite's error taxonomy. Unwraps AI SDK RetryError and causes. */
export const mapProviderError = (e: unknown, providerId?: string): AIError => {
  if (isAIError(e)) return e
  const err = (e ?? {}) as ErrLike
  if (err.name === 'AI_RetryError' && err.lastError) return mapProviderError(err.lastError, providerId)
  const message = err.message ?? String(e)
  const text = `${message} ${err.responseBody ?? ''}`
  let code: AIErrorCode
  const status = err.statusCode ?? (typeof err.status === 'number' ? err.status : undefined)
  if (err.name === 'AbortError' || err.name === 'TimeoutError') code = 'timeout'
  else if (status) code = fromStatus(status, text)
  else if (err.name === 'AI_LoadAPIKeyError') code = 'auth'
  else if (err.name === 'AI_NoContentGeneratedError' || /finish.?reason.*content.?filter/i.test(text)) code = 'content_filtered'
  else if (RATE.test(text)) code = 'rate_limit'
  else if (OVERLOAD.test(text)) code = 'overloaded'
  else if (TIMEOUT.test(text)) code = 'timeout'
  else if (NETWORK.test(text) || NETWORK.test(err.code ?? '')) code = 'unavailable'
  else if (CONTENT_FILTER.test(text)) code = 'content_filtered'
  else if (AUTH.test(text)) code = 'auth'
  else if (err.cause && err.cause !== e) {
    const inner = mapProviderError(err.cause, providerId)
    code = inner.code
  } else code = 'unknown'
  return new AIError(code, `${providerId ? `[${providerId}] ` : ''}${message}`.slice(0, 1000), {
    providerId,
    cause: e,
    details: status ? { status } : undefined,
  })
}

/** Should a failure of this kind count against a model's circuit breaker? */
export const countsForBreaker = (code: AIErrorCode): boolean =>
  code === 'rate_limit' || code === 'overloaded' || code === 'timeout' || code === 'unavailable' || code === 'unknown'

/** Is it worth trying the next model in the route after this error? */
export const allowsFallback = (code: AIErrorCode): boolean =>
  countsForBreaker(code) || code === 'auth' || code === 'validation' || code === 'content_filtered'
