'use client'
/** Browser helpers shared by the Content Studio components. */

export interface ApiError {
  code: string
  message: string
  requestId?: string
}

export interface ClientConfigLike {
  serverURL?: string
  routes?: { api?: string; admin?: string }
}

export const apiBase = (config: ClientConfigLike): string => `${config.serverURL ?? ''}${config.routes?.api ?? '/api'}`
export const adminBase = (config: ClientConfigLike): string => `${config.serverURL ?? ''}${config.routes?.admin ?? '/admin'}`

export class ApiRequestError extends Error {
  code: string
  constructor(e: ApiError) {
    super(e.message)
    this.code = e.code
  }
}

export const callApi = async <T = unknown>(
  config: ClientConfigLike,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> => {
  const res = await fetch(`${apiBase(config)}${path}`, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  if (!res.ok) {
    let err: ApiError = { code: 'unknown', message: `Request failed (${res.status})` }
    try {
      err = (await res.json()) as ApiError
    } catch {
      /* non-JSON error body */
    }
    if (err.code === 'budget_exceeded' && !err.message) err.message = 'The AI budget is used up for this month.'
    throw new ApiRequestError(err)
  }
  return res as Response & { json(): Promise<T> }
}

export const getJSON = async <T>(config: ClientConfigLike, path: string, init?: { method?: string; body?: unknown }): Promise<T> =>
  (await (await callApi<T>(config, path, init)).json()) as T

export type WireEvent =
  | { type: 'text'; delta: string }
  | { type: 'done'; messageId?: string }
  | { type: 'error'; code: string; message: string }
  | { type: string; [k: string]: unknown }

/** Minimal SSE reader for `event:` / `data:` frames. */
export async function* readSSE(res: Response): AsyncIterable<WireEvent> {
  const reader = res.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    let idx: number
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      let event = 'message'
      const data: string[] = []
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
      }
      if (!data.length) continue
      try {
        const obj = JSON.parse(data.join('\n')) as Record<string, unknown>
        yield (typeof obj.type === 'string' ? obj : { ...obj, type: event }) as WireEvent
      } catch {
        /* ignore malformed frame */
      }
    }
  }
}

export const isStream = (res: Response) => (res.headers.get('content-type') ?? '').includes('text/event-stream')

/** Form data trimmed for the prompt context (server redacts aiExclude fields again). */
export const formContext = (data: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
  if (!data) return undefined
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v == null || k.startsWith('_') || k === 'id') continue
    const size = typeof v === 'string' ? v.length : JSON.stringify(v).length
    if (size <= 8000) out[k] = v
  }
  return out
}

/** Append Lexical states (Insert for rich text). */
export const appendLexical = (current: unknown, addition: unknown): unknown => {
  const c = current as { root?: { children?: unknown[] } } | undefined
  const a = addition as { root?: { children?: unknown[] } } | undefined
  if (!c?.root?.children?.length) return addition
  if (!a?.root?.children) return current
  return { ...c, root: { ...c.root, children: [...c.root.children, ...a.root.children] } }
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : 'Something went wrong')

export const ACTION_LABELS: Record<string, string> = {
  write: 'Write description',
  'from-photo': 'Write from photo',
  rewrite: 'Rewrite',
  shorten: 'Shorten',
  tone: 'Change tone',
  translate: 'Translate',
  seo: 'SEO meta',
  faq: 'FAQ from description',
  blog: 'Blog post',
  landing: 'Landing copy',
  attributes: 'Extract attributes',
  tags: 'Suggest tags',
}

/** Plain text → minimal Lexical state (paragraphs). Used only when staff edited AI text client-side. */
export const textToLexical = (text: string): Record<string, unknown> => ({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: null,
    children: text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => ({
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: null,
        textFormat: 0,
        textStyle: '',
        children: [{ type: 'text', text: p, detail: 0, format: 0, mode: 'normal', style: '', version: 1 }],
      })),
  },
})
