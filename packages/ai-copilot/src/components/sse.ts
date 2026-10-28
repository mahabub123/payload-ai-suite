import type { StreamWireEvent } from '@payload-ai-suite/ai-core/wire'

/** POST JSON and yield parsed SSE wire events. */
export async function* postSSE(url: string, body: unknown, signal?: AbortSignal): AsyncIterable<StreamWireEvent> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    const err = (await res.json().catch(() => ({}))) as { code?: string; message?: string; requestId?: string }
    yield { type: 'error', code: err.code ?? String(res.status), message: err.message ?? res.statusText, requestId: err.requestId ?? '' }
    return
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let i: number
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i)
      buf = buf.slice(i + 2)
      const data = chunk
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n')
      if (!data) continue
      try {
        yield JSON.parse(data) as StreamWireEvent
      } catch {
        /* ignore malformed frame */
      }
    }
  }
}
