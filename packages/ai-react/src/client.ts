import type { APIErrorBody } from '@payload-ai-suite/ai-core/wire'

export interface AISuiteConfig {
  /** Suite API base. Default '/api/ai'. */
  baseUrl: string
  locale: string
  turnstileSiteKey?: string
  /** Extra headers per request (auth, tenant...). */
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>
}

export class AISuiteRequestError extends Error {
  readonly code: string
  readonly status: number
  readonly requestId?: string
  constructor(status: number, body: Partial<APIErrorBody> | null) {
    super(body?.message ?? `Request failed (${status})`)
    this.name = 'AISuiteRequestError'
    this.code = body?.code ?? 'unknown'
    this.status = status
    this.requestId = body?.requestId
  }
}

export interface AISuiteClient {
  config: AISuiteConfig
  url(path: string, query?: Record<string, string | number | undefined | null>): string
  /** fetch with JSON + suite headers; throws AISuiteRequestError for non-2xx. */
  fetch(path: string, init?: RequestInit & { json?: unknown; query?: Record<string, string | number | undefined | null> }): Promise<Response>
  json<T>(path: string, init?: RequestInit & { json?: unknown; query?: Record<string, string | number | undefined | null> }): Promise<T>
}

export const createClient = (config: AISuiteConfig): AISuiteClient => {
  const base = config.baseUrl.replace(/\/+$/, '')
  const client: AISuiteClient = {
    config,
    url(path, query) {
      const qs = Object.entries(query ?? {})
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
      return `${base}${path.startsWith('/') ? path : `/${path}`}${qs ? `?${qs}` : ''}`
    },
    async fetch(path, init = {}) {
      const { json, query, headers, ...rest } = init
      const extra = (await config.getHeaders?.()) ?? {}
      const res = await fetch(client.url(path, query), {
        credentials: 'include',
        ...rest,
        headers: {
          Accept: 'application/json',
          ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
          'Accept-Language': config.locale,
          ...extra,
          ...(headers as Record<string, string> | undefined),
        },
        body: json !== undefined ? JSON.stringify(json) : rest.body,
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as Partial<APIErrorBody> | null
        throw new AISuiteRequestError(res.status, body)
      }
      return res
    },
    async json<T>(path: string, init?: Parameters<AISuiteClient['fetch']>[1]) {
      const res = await client.fetch(path, init)
      return (await res.json()) as T
    },
  }
  return client
}

/** Random id for idempotency keys / sessions (crypto.randomUUID when available). */
export const randomId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`

/** localStorage that never throws (SSR, private mode). */
export const storage = {
  get(key: string): string | null {
    try {
      return typeof window === 'undefined' ? null : window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (typeof window === 'undefined') return
      if (value === null) window.localStorage.removeItem(key)
      else window.localStorage.setItem(key, value)
    } catch {
      // ignore
    }
  },
}
