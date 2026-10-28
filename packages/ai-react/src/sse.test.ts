import { describe, expect, it } from 'vitest'
import { createSSEParser, parseSSE, readWireEvents } from './sse'
import type { SSEMessage } from './sse'

const streamOf = (chunks: (string | Uint8Array)[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder()
      for (const ch of chunks) c.enqueue(typeof ch === 'string' ? enc.encode(ch) : ch)
      c.close()
    },
  })

const collect = async <T>(it: AsyncIterable<T>) => {
  const out: T[] = []
  for await (const x of it) out.push(x)
  return out
}

describe('SSE parser', () => {
  it('parses events split at arbitrary chunk boundaries', () => {
    const text = 'event: text\ndata: {"type":"text","delta":"Hel"}\n\nevent: text\ndata: {"type":"text","delta":"lo"}\n\n'
    for (let size = 1; size <= text.length; size++) {
      const out: SSEMessage[] = []
      const p = createSSEParser((m) => out.push(m))
      for (let i = 0; i < text.length; i += size) p.feed(text.slice(i, i + size))
      p.end()
      expect(out.map((m) => JSON.parse(m.data).delta)).toEqual(['Hel', 'lo'])
      expect(out[0].event).toBe('text')
    }
  })

  it('joins multi-line data, ignores comments, handles CRLF and CR split across chunks', () => {
    const out: SSEMessage[] = []
    const p = createSSEParser((m) => out.push(m))
    p.feed(': keep-alive\r')
    p.feed('\ndata: line one\r')
    p.feed('\ndata:line two\rid: 7\r\r')
    p.feed('data: last')
    p.end()
    expect(out).toEqual([
      { event: 'message', data: 'line one\nline two', id: '7' },
      { event: 'message', data: 'last', id: '7' },
    ])
  })

  it('decodes multi-byte UTF-8 split across network chunks (Bangla)', async () => {
    const bytes = new TextEncoder().encode('data: {"type":"text","delta":"আমি"}\n\n')
    const events = await collect(readWireEvents(streamOf([bytes.slice(0, 33), bytes.slice(33, 35), bytes.slice(35)])))
    expect(events).toEqual([{ type: 'text', delta: 'আমি' }])
  })

  it('fills the type from the event name and skips bad JSON', async () => {
    const events = await collect(readWireEvents(streamOf(['event: done\ndata: {"messageId":"m1"}\n\n', 'data: not json\n\n', '﻿'])))
    expect(events).toEqual([{ type: 'done', messageId: 'm1' }])
  })

  it('parseSSE yields raw messages from a stream', async () => {
    const msgs = await collect(parseSSE(streamOf(['event: meta\ndata: {"requestId":"r"}\n', '\n'])))
    expect(msgs).toEqual([{ event: 'meta', data: '{"requestId":"r"}', id: undefined }])
  })
})
