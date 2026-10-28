/**
 * Tiny, safe Markdown -> HTML for assistant replies. Everything is HTML-escaped first; the only
 * markup produced is p, br, strong, em, code, pre, ul/ol/li and links with http(s)/mailto/tel/relative URLs.
 */
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c])

const unescape = (s: string) => s.replace(/&(amp|lt|gt|quot|#39);/g, (m) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[m] ?? m)

/** Returns a safe href or null. Works on the raw (unescaped) URL. */
export const safeUrl = (raw: string): string | null => {
  const url = raw.trim()
  // Strip characters browsers ignore inside schemes before checking them.
  const probe = url.replace(/[\u0000-\u001f\u007f\s]/g, '').toLowerCase()
  if (/^(https?:|mailto:|tel:)/.test(probe)) return url
  if (/^[a-z][a-z0-9+.-]*:/.test(probe)) return null
  if (probe.startsWith('//')) return null
  return url
}

const emphasis = (s: string): string =>
  s
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')

const inline = (escaped: string): string => {
  // Code spans and links become placeholders so emphasis never touches their content/attributes.
  const held: string[] = []
  const hold = (html: string) => `\u0000${held.push(html) - 1}\u0000`
  let s = escaped.replace(/`([^`\n]+)`/g, (_, c: string) => hold(`<code>${c}</code>`))
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, text: string, href: string) => {
    const url = safeUrl(unescape(href))
    return hold(url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow">${emphasis(text)}</a>` : emphasis(text))
  })
  return emphasis(s).replace(/\u0000(\d+)\u0000/g, (_, i: string) => held[Number(i)])
}

export const renderMarkdown = (md: string): string => {
  const lines = escapeHtml(md.replace(/\r\n?/g, '\n').replace(/\u0000/g, '')).split('\n')
  const out: string[] = []
  let para: string[] = []
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`)
    para = []
  }
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`)
    list = null
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (/^```/.test(l)) {
      flushPara()
      flushList()
      const code: string[] = []
      while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i])
      out.push(`<pre><code>${code.join('\n')}</code></pre>`)
      continue
    }
    const ul = /^\s*[-*•]\s+(.*)$/.exec(l)
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(l)
    if (ul || ol) {
      flushPara()
      const tag = ul ? 'ul' : 'ol'
      if (list && list.tag !== tag) flushList()
      list ??= { tag, items: [] }
      list.items.push((ul ?? ol)![1])
      continue
    }
    if (!l.trim()) {
      flushPara()
      flushList()
      continue
    }
    flushList()
    const h = /^#{1,6}\s+(.*)$/.exec(l)
    para.push(h ? `**${h[1]}**` : l)
  }
  flushPara()
  flushList()
  return out.join('')
}
