/**
 * Number verification for insight answers (§10.6): every number in the model's text must match a number
 * from the tool outputs (or the question/tool inputs), allowing formatting and rounding.
 */

const BN_DIGITS = '০১২৩৪৫৬৭৮৯'
const DEVANAGARI = '०१२३४५६७८९'

/** Map Bengali/Devanagari digits to ASCII (same string length, so offsets stay valid). */
export const normalizeDigits = (s: string): string =>
  s.replace(/[০-৯०-९]/g, (d) => String(BN_DIGITS.includes(d) ? BN_DIGITS.indexOf(d) : DEVANAGARI.indexOf(d)))

const SCALES: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mn: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
  lakh: 1e5,
  lac: 1e5,
  crore: 1e7,
}

export interface NumberToken {
  raw: string
  start: number
  end: number
  value: number
  /** Allowed absolute deviation implied by how the number was written. */
  tolerance: number
  percent: boolean
}

// Optional currency symbol, digits with , or thin-space grouping, optional decimals, optional scale word, optional %.
const NUM_RE =
  /(?<![\p{L}\p{N}_.])([$€£¥₹৳]\s?)?(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d+)?(?:\s?(k|K|m|M|mn|bn|B|thousand|million|billion|lakh|lac|crore)(?![\p{L}]))?(\s?%)?/gu

export const extractNumbers = (text: string): NumberToken[] => {
  const s = normalizeDigits(text)
  const out: NumberToken[] = []
  for (const m of s.matchAll(NUM_RE)) {
    const [raw, , intPart, frac, scaleWord, percent] = m
    const intDigits = intPart.replace(/,/g, '')
    const decimals = frac ? frac.length - 1 : 0
    const scale = scaleWord ? SCALES[scaleWord.toLowerCase()] : 1
    const value = Number(intDigits + (frac ?? '')) * scale
    // Rounded integers ("12,300") imply a coarser precision than their last digit.
    const trailingZeros = !frac && !scaleWord && intDigits.length > 2 ? (intDigits.match(/0+$/)?.[0].length ?? 0) : 0
    const tolerance = 0.5 * 10 ** (trailingZeros - decimals) * scale + 1e-9
    out.push({ raw, start: m.index!, end: m.index! + raw.length, value, tolerance, percent: Boolean(percent) })
  }
  return out
}

/** Every number found in evidence (numbers and numeric substrings of strings, recursively). */
export const collectEvidence = (...sources: unknown[]): number[] => {
  const nums = new Set<number>()
  const visit = (v: unknown, depth: number) => {
    if (depth > 12 || v == null) return
    if (typeof v === 'number' && Number.isFinite(v)) nums.add(Math.abs(v))
    else if (typeof v === 'string') for (const t of extractNumbers(v.replace(/-/g, ' '))) nums.add(t.value)
    else if (Array.isArray(v)) for (const x of v) visit(x, depth + 1)
    else if (typeof v === 'object') for (const x of Object.values(v as Record<string, unknown>)) visit(x, depth + 1)
  }
  for (const s of sources) visit(s, 0)
  return [...nums]
}

/** Values a raw evidence number may legitimately be shown as: itself, as major units, or as a percentage. */
const variants = (e: number): number[] => [e, e / 100, e / 1000, e * 100, e / 1e6]

export const isSupported = (tok: NumberToken, evidence: number[]): boolean => {
  for (const e of evidence) {
    for (const v of variants(e)) {
      if (Math.abs(tok.value - v) <= tok.tolerance) return true
    }
  }
  return false
}

const isListMarker = (text: string, tok: NumberToken) => {
  const lineStart = text.lastIndexOf('\n', tok.start - 1) + 1
  return /^\s*$/.test(text.slice(lineStart, tok.start)) && /^[.)](\s|$)/.test(text.slice(tok.end, tok.end + 2)) && !tok.percent && tok.value <= 50
}

// "last 90 days", "৭ দিন": a period length, not a data claim (models offer other periods unprompted).
const DURATION_RE = /^\s?(?:days?|weeks?|months?|years?|দিন|সপ্তাহ|মাস|বছর)(?![\p{L}])/u
const isDuration = (text: string, tok: NumberToken) =>
  !tok.percent && Number.isInteger(tok.value) && tok.value > 0 && tok.value <= 366 && DURATION_RE.test(text.slice(tok.end, tok.end + 12))

export interface NumberCheck {
  ok: boolean
  checked: number
  unverified: NumberToken[]
}

export const checkNumbers = (text: string, evidence: number[]): NumberCheck => {
  const s = normalizeDigits(text)
  const tokens = extractNumbers(s)
  const unverified = tokens.filter((t) => !isListMarker(s, t) && !isDuration(s, t) && !isSupported(t, evidence))
  return { ok: unverified.length === 0, checked: tokens.length, unverified }
}

/** Replace unverified numbers with a visible marker. */
export const stripNumbers = (text: string, unverified: NumberToken[], marker = '[unverified]'): string => {
  // normalizeDigits is length-preserving, so offsets from extractNumbers apply to the original text.
  let out = text
  for (const t of [...unverified].sort((a, b) => b.start - a.start)) out = out.slice(0, t.start) + marker + out.slice(t.end)
  return out
}
