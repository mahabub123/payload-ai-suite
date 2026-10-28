/** One error taxonomy for providers, guards and tools (design doc §7.1, §9). */

export type AIErrorCode =
  | 'rate_limit'
  | 'auth'
  | 'bad_request'
  | 'overloaded'
  | 'content_filtered'
  | 'timeout'
  | 'unavailable'
  | 'budget_exceeded'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'turnstile_failed'
  | 'module_disabled'
  | 'tool_error'
  | 'conflict'
  | 'unknown'

const RETRYABLE: ReadonlySet<AIErrorCode> = new Set(['rate_limit', 'overloaded', 'timeout', 'unavailable'])

const HTTP_STATUS: Record<AIErrorCode, number> = {
  rate_limit: 429,
  auth: 401,
  bad_request: 400,
  overloaded: 503,
  content_filtered: 422,
  timeout: 504,
  unavailable: 503,
  budget_exceeded: 402,
  forbidden: 403,
  not_found: 404,
  validation: 400,
  turnstile_failed: 403,
  module_disabled: 404,
  tool_error: 502,
  conflict: 409,
  unknown: 500,
}

export class AIError extends Error {
  readonly code: AIErrorCode
  readonly retryable: boolean
  readonly status: number
  readonly details?: unknown
  readonly providerId?: string

  constructor(
    code: AIErrorCode,
    message: string,
    opts: { details?: unknown; providerId?: string; cause?: unknown; status?: number } = {},
  ) {
    super(message, { cause: opts.cause })
    this.name = 'AIError'
    this.code = code
    this.retryable = RETRYABLE.has(code)
    this.status = opts.status ?? HTTP_STATUS[code]
    this.details = opts.details
    this.providerId = opts.providerId
  }
}

export const isAIError = (e: unknown): e is AIError => e instanceof AIError

/** The single error body every /api/ai endpoint returns. */
export interface APIErrorBody {
  code: AIErrorCode
  message: string
  details?: unknown
  requestId: string
}
