import type { StreamWireEvent } from 'payload-ai-core/wire'

export interface SSEMessage {
  event: string
  data: string
  id?: string
}

/**
 * Incremental Server-Sent Events parser (WHATWG rules): handles \n, \r\n and \r line endings split
 * across chunks, multi-line `data:`, comments and a leading BOM.
 */
export const createSSEParser = (onMessage: (m: SSEMessage) => void) => {
  let buf = ''
  let data: string[] = []
  let event = ''
  let id: string | undefined
  let pendingCR = false
  let started = false

  const dispatch = () => {
    if (data.length) onMessage({ event: event || 'message', data: data.join('\n'), id })
    data = []
    event = ''
  }

  const line = (l: string) => {
    if (l === '') return dispatch()
    if (l.startsWith(':')) return
    const i = l.indexOf(':')
    const field = i === -1 ? l : l.slice(0, i)
    let value = i === -1 ? '' : l.slice(i + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'data') data.push(value)
    else if (field === 'event') event = value
    else if (field === 'id' && !value.includes('\0')) id = value
  }

  return {
    feed(chunk: string) {
      if (!started) {
        started = true
        if (chunk.charCodeAt(0) === 0xfeff) chunk = chunk.slice(1)
      }
      if (pendingCR && chunk.startsWith('\n')) chunk = chunk.slice(1)
      pendingCR = false
      buf += chunk
      for (;;) {
        const m = /[\r\n]/.exec(buf)
        if (!m) break
        const idx = m.index
        let skip = 1
        if (buf[idx] === '\r') {
          if (idx + 1 < buf.length) skip = buf[idx + 1] === '\n' ? 2 : 1
          else pendingCR = true
        }
        const l = buf.slice(0, idx)
        buf = buf.slice(idx + skip)
        line(l)
      }
    },
    /** End of stream: a final event without a trailing blank line is still delivered. */
    end() {
      if (buf) line(buf)
      buf = ''
      dispatch()
    },
  }
}

/** Parse a fetch body stream into SSE messages. */
export async function* parseSSE(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SSEMessage> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const queue: SSEMessage[] = []
  const parser = createSSEParser((m) => queue.push(m))
  try {
    for (;;) {
      if (signal?.aborted) return
      const { done, value } = await reader.read()
      if (done) {
        parser.feed(decoder.decode())
        parser.end()
      } else parser.feed(decoder.decode(value, { stream: true }))
      while (queue.length) yield queue.shift()!
      if (done) return
    }
  } finally {
    reader.releaseLock()
  }
}

/** SSE message -> typed wire event (`event:` name fills in a missing `type`). Unparseable data is skipped. */
export const toWireEvent = (m: SSEMessage): StreamWireEvent | null => {
  try {
    const parsed = JSON.parse(m.data) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return null
    return { ...parsed, type: (parsed.type as string) ?? m.event } as StreamWireEvent
  } catch {
    return null
  }
}

export async function* readWireEvents(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<StreamWireEvent> {
  for await (const m of parseSSE(stream, signal)) {
    const ev = toWireEvent(m)
    if (ev) yield ev
  }
}
