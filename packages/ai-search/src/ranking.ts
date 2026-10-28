import type { Facets, OfferingSummary, SearchResponse } from '@payload-ai-suite/ai-core'

export interface Candidate {
  id: string
  score: number
  summary: OfferingSummary
  attributes?: Record<string, unknown>
}

/**
 * Reciprocal rank fusion: score(d) = Σ w_i / (k + rank_i(d)), rank starting at 1.
 * The first list that contains an id supplies its payload.
 */
export const reciprocalRankFusion = <T extends { id: string }>(
  lists: T[][],
  k = 60,
  weights?: number[],
): (T & { score: number })[] => {
  const acc = new Map<string, { item: T; score: number; first: number }>()
  let order = 0
  lists.forEach((list, li) => {
    const w = weights?.[li] ?? 1
    list.forEach((item, idx) => {
      const prev = acc.get(item.id)
      const s = w / (k + idx + 1)
      if (prev) prev.score += s
      else acc.set(item.id, { item, score: s, first: order++ })
    })
  })
  return [...acc.values()]
    .sort((a, b) => b.score - a.score || a.first - b.first)
    .map(({ item, score }) => ({ ...item, score }))
}

/**
 * Business rules (§10.2): boosts multiply the relevance score (<= 0 hides), then in-stock items
 * come before out-of-stock ones. Stable for equal scores.
 */
export const applyBusinessRules = <T extends { id: string; score: number; summary: { inStock?: boolean } }>(
  items: T[],
  boosts: Record<string, number> = {},
): T[] =>
  items
    .map((c, i) => ({ c: { ...c, score: c.score * (boosts[c.id] ?? 1) }, i, hidden: (boosts[c.id] ?? 1) <= 0 }))
    .filter((x) => !x.hidden)
    .sort((a, b) => {
      const sa = a.c.summary.inStock === false ? 1 : 0
      const sb = b.c.summary.inStock === false ? 1 : 0
      return sa - sb || b.c.score - a.c.score || a.i - b.i
    })
    .map((x) => x.c)

export interface CursorState {
  /** Offset into the ranked candidate list. */
  o: number
  /** searchId of the first page (later pages are not logged again). */
  s?: string
}

export const encodeCursor = (c: CursorState): string => Buffer.from(JSON.stringify(c)).toString('base64url')

export const decodeCursor = (cursor: string | undefined): CursorState => {
  if (!cursor) return { o: 0 }
  try {
    const c = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as CursorState
    const o = Number(c.o)
    if (!Number.isInteger(o) || o < 0 || o > 10_000) return { o: 0 }
    return { o, s: typeof c.s === 'string' ? c.s.slice(0, 64) : undefined }
  } catch {
    return { o: 0 }
  }
}

export const paginate = <T>(items: T[], offset: number, pageSize: number, searchId?: string): { page: T[]; nextCursor?: string } => {
  const page = items.slice(offset, offset + pageSize)
  const next = offset + pageSize
  return { page, nextCursor: next < items.length ? encodeCursor({ o: next, s: searchId }) : undefined }
}

/** Facet counts over the whole filtered result set (not just the page). */
export const facetCounts = (candidates: Candidate[], facets: Facets | null): NonNullable<SearchResponse['facets']> => {
  const cat = new Map<string, number>()
  const attrs: Record<string, Map<string, number>> = {}
  const keys = facets ? Object.keys(facets.attributes) : []
  for (const c of candidates) {
    for (const id of new Set(c.summary.categoryIds)) cat.set(id, (cat.get(id) ?? 0) + 1)
    for (const k of keys) {
      const v = c.attributes?.[k]
      for (const x of new Set((Array.isArray(v) ? v : v == null ? [] : [v]).map(String))) {
        attrs[k] ??= new Map()
        attrs[k].set(x, (attrs[k].get(x) ?? 0) + 1)
      }
    }
  }
  const titles = new Map((facets?.categories ?? []).map((c) => [c.id, c.title]))
  return {
    categories: [...cat.entries()]
      .map(([id, count]) => ({ id, title: titles.get(id) ?? id, count }))
      .sort((a, b) => b.count - a.count),
    attributes: Object.fromEntries(
      Object.entries(attrs).map(([k, m]) => [k, [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count)]),
    ),
  }
}

/** Synonym groups: every member maps to the others. */
export type SynonymMap = Map<string, Set<string>>

export const buildSynonymMap = (groups: Record<string, string[]>): SynonymMap => {
  const map: SynonymMap = new Map()
  for (const [term, syns] of Object.entries(groups)) {
    const all = [term, ...syns].map((s) => s.trim().toLowerCase()).filter(Boolean)
    for (const a of all) {
      const set = map.get(a) ?? new Set<string>()
      for (const b of all) if (b !== a) set.add(b)
      map.set(a, set)
    }
  }
  return map
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Query variants with one synonym substituted each (max `limit`). Multi-word terms supported. */
export const expandWithSynonyms = (text: string, map: SynonymMap, limit = 3): string[] => {
  const lower = text.toLowerCase()
  const out = new Set<string>()
  for (const [term, syns] of map) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(term)}(?=$|[^\\p{L}\\p{N}])`, 'iu')
    if (!re.test(lower)) continue
    for (const s of syns) {
      const variant = lower.replace(re, (_m, pre: string) => `${pre}${s}`)
      if (variant !== lower) out.add(variant)
      if (out.size >= limit) return [...out]
    }
  }
  return [...out]
}
