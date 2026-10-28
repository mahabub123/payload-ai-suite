/** Email parsing helpers: addresses, header blocks, quoted-reply and signature stripping, threading keys. */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i

/** Extract a lower-cased address from `Name <a@b.c>` or a bare address. */
export const extractAddress = (value: string | undefined | null): string | undefined => {
  if (!value) return undefined
  const angle = /<([^>]+)>/.exec(value)
  const m = EMAIL_RE.exec(angle ? angle[1] : value)
  return m ? m[0].toLowerCase() : undefined
}

export const extractName = (value: string | undefined | null): string | undefined => {
  if (!value) return undefined
  const m = /^\s*"?([^"<]+?)"?\s*</.exec(value)
  return m ? m[1].trim() : undefined
}

/** Whole message is an email address (optionally prefixed with "link"). */
export const parseLinkEmail = (text: string): string | undefined => {
  const t = text.trim().replace(/^link\s+/i, '')
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(t) ? t.toLowerCase() : undefined
}

/** Parse a raw RFC 5322 header block into lower-cased keys (folded lines joined). */
export const parseHeaderBlock = (block: string | undefined): Record<string, string> => {
  const out: Record<string, string> = {}
  if (!block) return out
  const lines = block.replace(/\r\n/g, '\n').split('\n')
  let current = ''
  for (const line of lines) {
    if (/^[ \t]/.test(line) && current) {
      out[current] += ` ${line.trim()}`
      continue
    }
    const i = line.indexOf(':')
    if (i <= 0) continue
    current = line.slice(0, i).trim().toLowerCase()
    out[current] = line.slice(i + 1).trim()
  }
  return out
}

/** `<a@x> <b@y>` -> ['<a@x>', '<b@y>'] */
export const parseMessageIds = (value: string | string[] | undefined | null): string[] => {
  if (!value) return []
  const joined = Array.isArray(value) ? value.join(' ') : value
  const ids = joined.match(/<[^<>\s]+>/g)
  if (ids) return ids
  return joined.split(/[\s,]+/).filter(Boolean).map((x) => `<${x.replace(/^<|>$/g, '')}>`)
}

/** Subject without Re:/Fwd:/AW: prefixes, lower-cased, whitespace-collapsed. */
export const normalizeSubject = (subject: string | undefined): string =>
  (subject ?? '')
    .replace(/^\s*((re|fw|fwd|aw|sv|wg)\s*(\[\d+\])?\s*:\s*)+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

export const replySubject = (subject: string | undefined): string => {
  const s = (subject ?? '').trim()
  if (!s) return 'Re: your message'
  return /^re\s*:/i.test(s) ? s : `Re: ${s}`
}

const QUOTE_HEADERS: RegExp[] = [
  /^On\b.{0,200}\bwrote:\s*$/i, // Gmail / Apple Mail
  /^Le\b.{0,200}\ba écrit\s*:\s*$/i,
  /^Am\b.{0,200}\bschrieb.{0,60}:\s*$/i,
  /^-{2,}\s*Original Message\s*-{2,}/i,
  /^-{2,}\s*Forwarded message\s*-{2,}/i,
  /^_{10,}\s*$/, // Outlook separator
  /^From:\s.+$/i, // Outlook header block
  /^Sent from my (iPhone|iPad|Android|mobile|Galaxy)/i,
  /^Get Outlook for /i,
]

/**
 * Keep only the new part of a reply: drops quoted blocks ("On … wrote:", "> …", Outlook headers)
 * and the signature (after "-- ").
 */
export const stripQuotedReply = (text: string): string => {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  // "On Mon, … <x@y>\nwrote:" split across two lines
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^On\b/i.test(lines[i]) && /^\s*wrote:\s*$/i.test(lines[i + 1])) {
      lines.splice(i, 2, `${lines[i]} wrote:`)
    }
  }
  const out: string[] = []
  for (const line of lines) {
    if (/^-- ?$/.test(line)) break
    if (QUOTE_HEADERS.some((r) => r.test(line.trim()))) break
    if (/^\s*>/.test(line)) continue
    out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
