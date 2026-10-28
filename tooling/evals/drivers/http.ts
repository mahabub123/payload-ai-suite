/**
 * Drives a running app (dev-store) over its public API. The model route is whatever the target server is
 * configured with (AI_ROUTE_* / provider keys, or AI_MOCK=1). Customer actors log in with the seed accounts.
 */
import type { AssistantCase, AssistantOutput, ContentCase, ContentOutput, Driver, SearchCase, SearchOutput } from '../lib/types'

const ACCOUNTS = {
  customerA: 'ayesha@example.test',
  customerB: 'bilal@example.test',
  content: 'content@example.test',
} as const

export interface HttpDriverOptions {
  target: string
  password?: string
  timeoutMs?: number
}

/** Parse an SSE body into { event, data } frames. */
export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: any }> {
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i: number
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, i)
      buf = buf.slice(i + 2)
      let event = 'message'
      const data: string[] = []
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).trim())
      }
      if (!data.length) continue
      try {
        yield { event, data: JSON.parse(data.join('\n')) }
      } catch {
        yield { event, data: data.join('\n') }
      }
    }
  }
}

export const createHttpDriver = (o: HttpDriverOptions): Driver => {
  const base = o.target.replace(/\/$/, '')
  const password = o.password ?? process.env.SEED_PASSWORD ?? 'Passw0rd!dev'
  const timeout = () => AbortSignal.timeout(o.timeoutMs ?? 60_000)

  // Payload's CSRF check ignores the session cookie on requests without an Origin (browsers always send one),
  // so every cookie-authenticated call below also sends Origin.
  // One login per account, shared by concurrent cases: parallel logins race on the user's session list.
  const logins = new Map<string, Promise<string>>()
  const login = (who: keyof typeof ACCOUNTS): Promise<string> => {
    let p = logins.get(who)
    if (!p) {
      p = (async () => {
        const r = await fetch(`${base}/api/users/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: ACCOUNTS[who], password }),
        })
        if (!r.ok) throw new Error(`login ${who} failed: ${r.status}`)
        return (r.headers.getSetCookie?.() ?? [r.headers.get('set-cookie') ?? '']).map((c) => c.split(';')[0]).join('; ')
      })()
      p.catch(() => logins.delete(who))
      logins.set(who, p)
    }
    return p
  }

  return {
    name: `http:${base}`,
    async assistant(c: AssistantCase): Promise<AssistantOutput> {
      const t = performance.now()
      const out: AssistantOutput = { text: '', tools: [], cards: [] }
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'text/event-stream' }
        if (c.actor && c.actor !== 'visitor') Object.assign(headers, { Cookie: await login(c.actor), Origin: base })
        const r = await fetch(`${base}/api/ai/assistant/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ message: c.message, locale: c.locale }),
          signal: timeout(),
        })
        if (!r.ok || !r.body) {
          out.error = `${r.status} ${await r.text().catch(() => '')}`.slice(0, 300)
          return out
        }
        for await (const { event, data } of readSSE(r.body)) {
          const type = data?.type ?? event
          if (type === 'text') out.text += data.delta ?? ''
          else if (type === 'tool' && data.status !== 'error') !out.tools.includes(data.name) && out.tools.push(data.name)
          else if (type === 'card') out.cards.push(data.card)
          else if (type === 'error') out.error = data.message
        }
      } catch (e) {
        out.error = (e as Error).message
      }
      out.latencyMs = performance.now() - t
      return out
    },
    async search(c: SearchCase): Promise<SearchOutput> {
      const t = performance.now()
      try {
        const r = await fetch(`${base}/api/ai/search?q=${encodeURIComponent(c.query)}&locale=${c.locale}&limit=${c.k ?? 24}`, { signal: timeout() })
        if (!r.ok) return { slugs: [], error: `${r.status}`, latencyMs: performance.now() - t }
        const body = (await r.json()) as { items: { id: string; slug?: string }[]; mode?: string }
        return { slugs: body.items.map((i) => i.slug ?? i.id), mode: body.mode, latencyMs: performance.now() - t }
      } catch (e) {
        return { slugs: [], error: (e as Error).message, latencyMs: performance.now() - t }
      }
    },
    async content(c: ContentCase): Promise<ContentOutput> {
      const t = performance.now()
      try {
        const cookie = await login('content')
        const q = await fetch(`${base}/api/products?where[slug][equals]=${encodeURIComponent(c.product)}&depth=0&limit=1`, { headers: { Cookie: cookie, Origin: base } })
        const doc = ((await q.json()) as { docs: { id: string }[] }).docs[0]
        if (!doc) return { text: '', error: `product ${c.product} not found` }
        const action = c.task === 'seo-meta' ? 'seo' : 'write'
        const r = await fetch(`${base}/api/ai/content/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: base },
          body: JSON.stringify({
            action,
            collection: 'products',
            docId: doc.id,
            field: 'description',
            locale: c.locale,
            stream: false,
            ...(c.task === 'social-post' ? { instructions: 'Write a short social media post (max 280 characters).' } : {}),
          }),
          signal: timeout(),
        })
        if (!r.ok) return { text: '', error: `${r.status}`, latencyMs: performance.now() - t }
        const body = (await r.json()) as { output?: unknown }
        const text = typeof body.output === 'string' ? body.output : JSON.stringify(body.output ?? '')
        return { text, latencyMs: performance.now() - t }
      } catch (e) {
        return { text: '', error: (e as Error).message, latencyMs: performance.now() - t }
      }
    },
  }
}
