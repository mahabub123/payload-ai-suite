import type { AssistantCase, AssistantOutput, CaseResult, ContentCase, ContentOutput, SearchCase, SearchOutput } from './types'

/** Lowercase, unify digits (Bangla -> ASCII) and strip thousands separators so "৳২,৮৫০" matches "2850". */
export const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6))
    .replace(/(\d),(?=\d)/g, '$1')
    .replace(/\s+/g, ' ')

const haystack = (o: AssistantOutput) => normalize(`${o.text}\n${JSON.stringify(o.cards)}`)

const anyOf = (hay: string, fact: string | string[]) => (Array.isArray(fact) ? fact : [fact]).some((f) => hay.includes(normalize(f)))

export const scoreAssistant = (c: AssistantCase, o: AssistantOutput): CaseResult => {
  const reasons: string[] = []
  let checks = 0
  let passed = 0
  const check = (ok: boolean, why: string) => {
    checks++
    if (ok) passed++
    else reasons.push(why)
  }
  if (o.error) check(false, `error: ${o.error}`)
  if (c.expectTool) {
    const wanted = Array.isArray(c.expectTool) ? c.expectTool : [c.expectTool]
    check(wanted.some((t) => o.tools.includes(t)), `expected tool ${wanted.join('|')}, got [${o.tools.join(', ')}]`)
  }
  const hay = haystack(o)
  for (const f of c.mustInclude ?? []) check(anyOf(hay, f), `missing fact: ${JSON.stringify(f)}`)
  for (const f of c.mustNotInclude ?? []) check(!hay.includes(normalize(f)), `leaked/forbidden: ${f}`)
  if (c.expectCard) check(o.cards.some((x) => x.type === c.expectCard), `expected card ${c.expectCard}`)
  const score = checks ? passed / checks : 1
  // Forbidden content is a hard fail regardless of the other checks.
  const hardFail = (c.mustNotInclude ?? []).some((f) => hay.includes(normalize(f)))
  return { id: c.id, pass: !hardFail && passed === checks, score, reasons, latencyMs: o.latencyMs }
}

/** Recall@k over the expected set, reciprocal rank of the first expected hit, forbidden hits fail. */
export const scoreSearch = (c: SearchCase, o: SearchOutput): CaseResult & { recall: number; rr: number } => {
  const k = c.k ?? 5
  const top = o.slugs.slice(0, k)
  const hits = c.expected.filter((s) => top.includes(s))
  const recall = c.expected.length ? hits.length / Math.min(c.expected.length, k) : 1
  const firstRank = o.slugs.findIndex((s) => c.expected.includes(s))
  const rr = firstRank >= 0 ? 1 / (firstRank + 1) : 0
  const forbidden = (c.forbidden ?? []).filter((s) => top.includes(s))
  const reasons: string[] = []
  if (o.error) reasons.push(`error: ${o.error}`)
  if (recall < 1) reasons.push(`recall@${k}=${recall.toFixed(2)} (missing ${c.expected.filter((s) => !top.includes(s)).join(', ')})`)
  if (forbidden.length) reasons.push(`forbidden in top ${k}: ${forbidden.join(', ')}`)
  const pass = !o.error && rr > 0 && recall >= 0.5 && forbidden.length === 0
  return { id: c.id, pass, score: recall, recall, rr, reasons, latencyMs: o.latencyMs }
}

const BENGALI = /[ঀ-৿]/g
const LATIN = /[A-Za-z]/g

export const scriptRatio = (text: string, script: 'bengali' | 'latin'): number => {
  const b = text.match(BENGALI)?.length ?? 0
  const l = text.match(LATIN)?.length ?? 0
  if (!b && !l) return 0
  return script === 'bengali' ? b / (b + l) : l / (b + l)
}

/** All money-looking numbers in the text, in minor units. Matches "৳2,850", "Tk 2850", "2850 taka", "২,৮৫০ টাকা". */
export const extractPrices = (text: string): number[] => {
  const t = normalize(text)
  const re = /(?:৳|tk\.?|bdt)\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:taka|tk|টাকা)/g
  const out: number[] = []
  for (const m of t.matchAll(re)) out.push(Math.round(Number(m[1] ?? m[2]) * 100))
  return out
}

export const scoreContent = (c: ContentCase, o: ContentOutput, catalogPriceMinor?: number): CaseResult => {
  const reasons: string[] = []
  const t = o.text ?? ''
  const { checks } = c
  if (o.error) reasons.push(`error: ${o.error}`)
  if (checks.minChars !== undefined && t.length < checks.minChars) reasons.push(`too short (${t.length} < ${checks.minChars})`)
  if (checks.maxChars !== undefined && t.length > checks.maxChars) reasons.push(`too long (${t.length} > ${checks.maxChars})`)
  const hay = normalize(t)
  for (const m of checks.mustMention ?? []) if (!anyOf(hay, m)) reasons.push(`does not mention ${JSON.stringify(m)}`)
  for (const b of checks.banned ?? []) if (hay.includes(normalize(b))) reasons.push(`banned phrase: ${b}`)
  if (checks.script && scriptRatio(t, checks.script) < 0.6) reasons.push(`wrong script (want ${checks.script})`)
  if (checks.noInventedPrices) {
    const bad = extractPrices(t).filter((p) => p !== catalogPriceMinor)
    if (bad.length) reasons.push(`invented price(s): ${bad.map((p) => p / 100).join(', ')}`)
  }
  const total = 2 + (checks.mustMention?.length ?? 0) + (checks.banned?.length ?? 0) + (checks.script ? 1 : 0) + (checks.noInventedPrices ? 1 : 0)
  return { id: c.id, pass: reasons.length === 0, score: Math.max(0, 1 - reasons.length / total), reasons, latencyMs: o.latencyMs }
}

export const percentile = (xs: number[], p: number): number => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]
}

export const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
