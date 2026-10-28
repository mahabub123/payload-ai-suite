import { createHash } from 'node:crypto'

const CHARS_PER_TOKEN = 4
const HEADING = /^(#{1,6}\s+\S.*|[^\n]{1,120}\n[=-]{3,})$/

export const hashContent = (s: string): string => createHash('sha256').update(s).digest('hex')

/** Split a long paragraph into pieces ≤ max chars: sentences first, then words, then hard cut. */
const splitLong = (p: string, max: number): string[] => {
  if (p.length <= max) return [p]
  const out: string[] = []
  let cur = ''
  const push = (s: string) => {
    if (cur && cur.length + 1 + s.length > max) {
      out.push(cur)
      cur = ''
    }
    if (s.length > max) {
      for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max))
      return
    }
    cur = cur ? `${cur} ${s}` : s
  }
  const sentences = p.split(/(?<=[.!?।])\s+/)
  for (const s of sentences) {
    if (s.length <= max) push(s)
    else for (const w of s.split(/\s+/)) push(w)
  }
  if (cur) out.push(cur)
  return out
}

const tail = (s: string, n: number) => {
  if (n <= 0 || !s) return ''
  if (s.length <= n) return s
  const cut = s.slice(-n)
  const sp = cut.indexOf(' ')
  return sp > 0 && sp < cut.length - 1 ? cut.slice(sp + 1) : cut
}

/**
 * Heading/paragraph-aware chunker (~maxTokens per chunk, approx 4 chars/token).
 * A heading always starts a new chunk; continuation chunks repeat the section heading and
 * carry `overlapTokens` of trailing text from the previous chunk.
 */
export const chunkText = (text: string, opts: { maxTokens?: number; overlapTokens?: number } = {}): string[] => {
  const maxChars = Math.max(200, (opts.maxTokens ?? 800) * CHARS_PER_TOKEN)
  const overlapChars = Math.min(Math.floor(maxChars / 4), (opts.overlapTokens ?? 80) * CHARS_PER_TOKEN)
  const headingMax = Math.min(200, Math.floor(maxChars / 4))
  const pieceMax = Math.max(50, maxChars - overlapChars - headingMax - 4)

  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let heading = ''
  let parts: string[] = []
  let hasBody = false

  const len = () => parts.reduce((n, p) => n + p.length + 2, 0)
  const flush = () => {
    if (hasBody) chunks.push(parts.join('\n\n'))
    parts = []
    hasBody = false
  }

  for (const para of paragraphs) {
    const firstLine = para.split('\n')[0]
    if (HEADING.test(para) || /^#{1,6}\s/.test(firstLine)) {
      flush()
      heading = firstLine.slice(0, headingMax)
      parts = [para.length > pieceMax ? heading : para]
      hasBody = para.length <= pieceMax && para.includes('\n') && !HEADING.test(para)
      if (para.length > pieceMax) {
        for (const piece of splitLong(para.slice(firstLine.length).trim(), pieceMax)) addBody(piece)
      }
      continue
    }
    for (const piece of splitLong(para, pieceMax)) addBody(piece)
  }
  flush()
  return chunks

  function addBody(piece: string) {
    if (hasBody && len() + piece.length > maxChars) {
      const prev = parts.join('\n\n')
      flush()
      const ov = tail(prev.slice(heading && prev.startsWith(heading) ? heading.length : 0).trim(), overlapChars)
      parts = [heading, ov].filter(Boolean)
    }
    parts.push(piece)
    hasBody = true
  }
}
