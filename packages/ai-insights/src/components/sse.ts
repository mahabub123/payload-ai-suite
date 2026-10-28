import type { StreamWireEvent } from '@payload-ai-suite/ai-core/wire'

/** Parse a text/event-stream response into wire events. */
export async function* readSSE(res: Response): AsyncIterable<StreamWireEvent> {
  if (!res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
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
        // ignore keep-alive / malformed frames
      }
    }
  }
}
