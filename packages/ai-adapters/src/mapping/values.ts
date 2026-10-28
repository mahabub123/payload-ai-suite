/**
 * Generic value readers for mapped field paths: dot paths with array indexes, relationship ids vs populated docs,
 * upload URLs, localized values, rich text flattening and money.
 */
import { isLexicalState, lexicalToText } from './lexical'

export type Doc = Record<string, unknown>

export interface ReadOptions {
  /** Locale codes configured in Payload; used to unwrap `{ en: ..., bn: ... }` values (locale: 'all'). */
  locales?: string[]
  locale?: string
  defaultLocale?: string
}

const isObj = (v: unknown): v is Doc => typeof v === 'object' && v !== null && !Array.isArray(v)

const isLocaleMap = (v: unknown, o: ReadOptions): v is Doc => {
  if (!isObj(v) || !o.locales?.length) return false
  const keys = Object.keys(v)
  return keys.length > 0 && keys.every((k) => o.locales!.includes(k))
}

/** Pick the requested locale from a localized value map; non-localized values pass through. */
export const unwrapLocale = (v: unknown, o: ReadOptions): unknown => {
  if (!isLocaleMap(v, o)) return v
  const pick = (code?: string) => (code && v[code] != null ? v[code] : undefined)
  return pick(o.locale) ?? pick(o.defaultLocale) ?? Object.values(v).find((x) => x != null)
}

/**
 * Read a dot path. Numeric segments index arrays; a non-numeric segment applied to an array maps over it
 * (`'gallery.image'` -> every image). Polymorphic relationship values `{ relationTo, value }` are traversed.
 */
export const getPath = (doc: unknown, path: string | undefined | null, o: ReadOptions = {}): unknown => {
  if (!path) return undefined
  let cur: unknown = unwrapLocale(doc, o)
  for (const seg of path.split('.')) {
    if (cur == null) return undefined
    if (Array.isArray(cur)) {
      if (/^\d+$/.test(seg)) cur = cur[Number(seg)]
      else {
        const out = cur.map((el) => getPath(el, seg, o)).flat()
        cur = out.filter((x) => x !== undefined)
      }
    } else if (isObj(cur)) {
      if (!(seg in cur) && 'relationTo' in cur && isObj(cur.value)) cur = (cur.value as Doc)[seg]
      else cur = cur[seg]
    } else return undefined
    cur = unwrapLocale(cur, o)
  }
  return cur
}

/** Set a dot path, creating objects (used for writes with mapped fields). */
export const setPath = (target: Doc, path: string, value: unknown): void => {
  const segs = path.split('.')
  let cur: Doc = target
  segs.slice(0, -1).forEach((s) => {
    if (!isObj(cur[s])) cur[s] = {}
    cur = cur[s] as Doc
  })
  cur[segs[segs.length - 1]] = value
}

/** Id of a relationship value: raw id, populated doc, or polymorphic `{ relationTo, value }`. */
export const relId = (v: unknown): string | undefined => {
  if (v == null || v === '') return undefined
  if (typeof v === 'string' || typeof v === 'number') return String(v)
  if (isObj(v)) {
    if ('relationTo' in v && 'value' in v) return relId(v.value)
    if (v.id != null) return String(v.id)
  }
  return undefined
}

export const relIds = (v: unknown): string[] => {
  const arr = Array.isArray(v) ? v : v == null ? [] : [v]
  return arr.map(relId).filter((x): x is string => !!x)
}

/** Populated doc of a relationship value, or undefined when only an id is present. */
export const relDoc = (v: unknown): Doc | undefined => {
  if (!isObj(v)) return undefined
  if ('relationTo' in v && 'value' in v) return isObj(v.value) ? v.value : undefined
  return v
}

const absolutize = (url: string, serverURL?: string) =>
  url.startsWith('/') && serverURL ? `${serverURL.replace(/\/$/, '')}${url}` : url

/**
 * URL of an upload value: a string URL, a populated upload doc (`url`), or an object wrapping one
 * (e.g. ecommerce template gallery rows `{ image: Media }`). Bare ids yield undefined (fetch with depth >= 1).
 */
export const uploadUrl = (v: unknown, serverURL?: string): string | undefined => {
  if (v == null) return undefined
  if (typeof v === 'string') return /^(https?:)?\/|^data:/.test(v) ? absolutize(v, serverURL) : undefined
  if (Array.isArray(v)) return uploadUrl(v[0], serverURL)
  if (!isObj(v)) return undefined
  if (typeof v.url === 'string') return absolutize(v.url, serverURL)
  for (const k of ['value', 'image', 'media', 'file', 'photo']) {
    const u = uploadUrl(v[k], serverURL)
    if (u) return u
  }
  return undefined
}

export const uploadUrls = (v: unknown, serverURL?: string): string[] => {
  const arr = Array.isArray(v) ? v : v == null ? [] : [v]
  return arr.map((x) => uploadUrl(x, serverURL)).filter((x): x is string => !!x)
}

const SKIP_KEYS = new Set(['id', 'blockType', 'blockName', 'url', 'filename', 'mimeType', 'relationTo', '_status', 'createdAt', 'updatedAt'])

/**
 * Plain text from any value: strings, Lexical rich text, arrays and block layouts (recursing into
 * nested blocks and their rich text). Ids, block types and URLs are skipped.
 */
export const toText = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (isLexicalState(v)) return lexicalToText(v)
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join('\n')
  if (isObj(v)) {
    return Object.entries(v)
      .filter(([k]) => !SKIP_KEYS.has(k))
      .map(([, x]) => (typeof x === 'number' || typeof x === 'boolean' ? '' : toText(x)))
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

export const toStr = (v: unknown): string | undefined => {
  if (v == null) return undefined
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (isLexicalState(v)) return lexicalToText(v)
  if (Array.isArray(v)) return v.map(toStr).filter(Boolean).join(', ') || undefined
  return undefined
}

export const toNum = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return undefined
}

export const toIso = (v: unknown): string | undefined => {
  if (v == null || v === '') return undefined
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

/** Convert a stored price to integer minor units. */
export const toMinor = (v: unknown, unit: 'minor' | 'major' = 'minor', decimals = 2): number | undefined => {
  const n = toNum(v)
  if (n === undefined) return undefined
  return unit === 'major' ? Math.round(n * 10 ** decimals) : Math.round(n)
}

/** Substitute `{field}` placeholders (any dot path) in a URL pattern. */
export const fillPattern = (pattern: string | undefined, doc: Doc, extra: Record<string, unknown> = {}): string | undefined => {
  if (!pattern) return undefined
  let missing = false
  const out = pattern.replace(/\{([\w.]+)\}/g, (_, key: string) => {
    const v = key in extra ? extra[key] : getPath(doc, key)
    if (v == null || v === '') missing = true
    return encodeURIComponent(String(v ?? ''))
  })
  return missing ? undefined : out
}
