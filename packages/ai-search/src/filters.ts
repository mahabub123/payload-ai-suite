import { z } from 'zod'
import type { Facets } from 'payload-ai-core'

/** What the `fast` model is asked to produce. Prices are major units as written by the shopper. */
export const parsedQuerySchema = z.object({
  text: z.string().nullish(),
  categoryIds: z.array(z.string()).nullish(),
  priceMin: z.number().nullish(),
  priceMax: z.number().nullish(),
  color: z.string().nullish(),
  size: z.string().nullish(),
  inStock: z.boolean().nullish(),
  attributes: z.record(z.string(), z.string()).nullish(),
})
export type RawParsedQuery = z.infer<typeof parsedQuerySchema>

/** Explicit storefront filters (`filters=` JSON). Prices in minor units. */
export const explicitFiltersSchema = z.object({
  categoryIds: z.array(z.string()).optional(),
  priceMin: z.number().int().nonnegative().optional(),
  priceMax: z.number().int().nonnegative().optional(),
  inStock: z.boolean().optional(),
  attributes: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
})
export type ExplicitFilters = z.infer<typeof explicitFiltersSchema>

/** Validated filters. Prices in integer minor units; attribute keys/values are real catalog values. */
export interface SearchFilters {
  categoryIds?: string[]
  priceMin?: number
  priceMax?: number
  inStock?: boolean
  attributes?: Record<string, string[]>
}

const fractionDigitsCache = new Map<string, number>()
export const currencyFractionDigits = (currency: string): number => {
  const c = currency.toUpperCase()
  let d = fractionDigitsCache.get(c)
  if (d === undefined) {
    try {
      d = new Intl.NumberFormat('en', { style: 'currency', currency: c }).resolvedOptions().maximumFractionDigits ?? 2
    } catch {
      d = 2
    }
    fractionDigitsCache.set(c, d)
  }
  return d
}

/** Major units -> integer minor units ("3,000 taka" -> 300000 for BDT). */
export const toMinor = (major: number, currency: string): number => Math.round(major * 10 ** currencyFractionDigits(currency))

export const toMajor = (minor: number, currency: string): number => minor / 10 ** currencyFractionDigits(currency)

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯'
const asciiDigits = (s: string) => s.replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d)))

const CUR = String.raw`(?:tk\.?|taka|bdt|৳|\$|usd|dollars?|rs\.?|inr|€|eur|euros?|£|gbp)`
const NUM = String.raw`(\d[\d,]*(?:\.\d+)?)\s*(k)?`
const num = (n: string, k?: string) => {
  const v = Number(n.replace(/,/g, ''))
  return Number.isFinite(v) ? v * (k ? 1000 : 1) : undefined
}

const MAX_RE = new RegExp(String.raw`\b(?:under|below|less than|cheaper than|max(?:imum)?|up ?to|within|no more than)\s*${CUR}?\s*${NUM}\s*${CUR}?|(?:<=?)\s*${CUR}?\s*${NUM}\s*${CUR}?`, 'i')
const MIN_RE = new RegExp(String.raw`\b(?:over|above|more than|at least|min(?:imum)?|from|starting at)\s*${CUR}?\s*${NUM}\s*${CUR}?|(?:>=?)\s*${CUR}?\s*${NUM}\s*${CUR}?`, 'i')
const BETWEEN_RE = new RegExp(String.raw`\bbetween\s*${CUR}?\s*${NUM}\s*${CUR}?\s*(?:and|-|to)\s*${CUR}?\s*${NUM}\s*${CUR}?`, 'i')
const RANGE_RE = new RegExp(String.raw`${CUR}\s*${NUM}\s*(?:-|to)\s*${CUR}?\s*${NUM}\s*${CUR}?|${NUM}\s*(?:-|to)\s*${NUM}\s*${CUR}`, 'i')

/**
 * Deterministic price-phrase parser (runs on every query, no model). Returns major units and the
 * query text with the price phrase removed.
 */
export const parsePricePhrase = (query: string): { text: string; priceMin?: number; priceMax?: number } => {
  let text = asciiDigits(query)
  let priceMin: number | undefined
  let priceMax: number | undefined
  const cut = (m: RegExpMatchArray) => {
    text = (text.slice(0, m.index) + ' ' + text.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, ' ').trim()
  }
  const firstPair = (m: RegExpMatchArray, offset: number): [string, string | undefined] | undefined => {
    for (let i = offset; i < m.length; i += 2) if (m[i]) return [m[i], m[i + 1]]
    return undefined
  }
  let m = text.match(BETWEEN_RE)
  if (m) {
    priceMin = num(m[1], m[2])
    priceMax = num(m[3], m[4])
    cut(m)
  } else if ((m = text.match(RANGE_RE))) {
    const a = m[1] ? num(m[1], m[2]) : num(m[5], m[6])
    const b = m[1] ? num(m[3], m[4]) : num(m[7], m[8])
    priceMin = a
    priceMax = b
    cut(m)
  } else {
    const mx = text.match(MAX_RE)
    if (mx) {
      const p = firstPair(mx, 1)
      if (p) priceMax = num(p[0], p[1])
      cut(mx)
    }
    const mn = text.match(MIN_RE)
    if (mn) {
      const p = firstPair(mn, 1)
      if (p) priceMin = num(p[0], p[1])
      cut(mn)
    }
  }
  text = text.replace(new RegExp(String.raw`^\s*${CUR}\s*|\s*${CUR}\s*$`, 'i'), ' ').replace(/\s+/g, ' ').trim()
  return { text, priceMin, priceMax }
}

const findKey = (facets: Facets, names: string[]): string | undefined =>
  Object.keys(facets.attributes).find((k) => names.includes(k.toLowerCase()))

const canonicalValue = (facets: Facets, key: string, value: unknown): string | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const v = String(value).trim().toLowerCase()
  return facets.attributes[key]?.find((x) => x.toLowerCase() === v)
}

const validCategory = (facets: Facets, value: string): string | undefined => {
  const v = value.trim().toLowerCase()
  return (
    facets.categories.find((c) => c.id === value)?.id ??
    facets.categories.find((c) => c.title.toLowerCase() === v)?.id
  )
}

const validPrice = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0

/**
 * Validate an AI-parsed filter object against real catalog values (§10.2). Anything that is not a
 * real category / attribute value or a sane price is dropped, never passed to SQL.
 * When `facets` is null (adapter unavailable) category and attribute filters are dropped entirely.
 */
export const validateParsedFilters = (
  raw: RawParsedQuery | null | undefined,
  facets: Facets | null,
  currency: string,
): { text?: string; filters: SearchFilters; dropped: string[] } => {
  const filters: SearchFilters = {}
  const dropped: string[] = []
  if (!raw) return { filters, dropped }

  if (raw.categoryIds?.length) {
    const ids = facets ? [...new Set(raw.categoryIds.map((c) => validCategory(facets, c)).filter((c): c is string => Boolean(c)))] : []
    for (const c of raw.categoryIds) if (!facets || !validCategory(facets, c)) dropped.push(`category:${c}`)
    if (ids.length) filters.categoryIds = ids
  }

  const pmin = validPrice(raw.priceMin) ? toMinor(raw.priceMin, currency) : undefined
  const pmax = validPrice(raw.priceMax) && raw.priceMax > 0 ? toMinor(raw.priceMax, currency) : undefined
  if (raw.priceMin != null && pmin === undefined) dropped.push(`priceMin:${raw.priceMin}`)
  if (raw.priceMax != null && pmax === undefined) dropped.push(`priceMax:${raw.priceMax}`)
  if (pmin !== undefined && pmax !== undefined && pmin > pmax) {
    dropped.push('priceRange:inverted')
  } else {
    if (pmin !== undefined && pmin > 0) filters.priceMin = pmin
    if (pmax !== undefined) filters.priceMax = pmax
  }

  if (typeof raw.inStock === 'boolean' && raw.inStock) filters.inStock = true

  const attrs: Record<string, string[]> = {}
  const addAttr = (key: string | undefined, value: unknown, label: string) => {
    if (!facets || !key) return void dropped.push(`${label}:${String(value)}`)
    const canon = canonicalValue(facets, key, value)
    if (!canon) return void dropped.push(`${label}:${String(value)}`)
    attrs[key] = [...new Set([...(attrs[key] ?? []), canon])]
  }
  if (raw.color) addAttr(facets ? findKey(facets, ['color', 'colour']) : undefined, raw.color, 'color')
  if (raw.size) addAttr(facets ? findKey(facets, ['size']) : undefined, raw.size, 'size')
  for (const [k, v] of Object.entries(raw.attributes ?? {})) {
    const key = facets ? Object.keys(facets.attributes).find((x) => x.toLowerCase() === k.toLowerCase()) : undefined
    addAttr(key, v, `attr.${k}`)
  }
  if (Object.keys(attrs).length) filters.attributes = attrs

  const text = typeof raw.text === 'string' && raw.text.trim() ? raw.text.trim() : undefined
  return { text, filters, dropped }
}

/** Validate explicit storefront filters (minor units already); invalid category/attribute values dropped. */
export const validateExplicitFilters = (f: ExplicitFilters | undefined, facets: Facets | null): SearchFilters => {
  if (!f) return {}
  const out: SearchFilters = {}
  if (f.categoryIds?.length) {
    const ids = facets ? f.categoryIds.filter((c) => facets.categories.some((x) => x.id === c)) : f.categoryIds
    if (ids.length) out.categoryIds = ids
  }
  if (f.priceMin !== undefined) out.priceMin = f.priceMin
  if (f.priceMax !== undefined) out.priceMax = f.priceMax
  if (out.priceMin !== undefined && out.priceMax !== undefined && out.priceMin > out.priceMax) {
    delete out.priceMin
    delete out.priceMax
  }
  if (f.inStock) out.inStock = true
  if (f.attributes) {
    const attrs: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(f.attributes)) {
      const values = (Array.isArray(v) ? v : [v]).map((x) => (facets ? canonicalValue(facets, k, x) : x)).filter((x): x is string => Boolean(x))
      if (values.length && (!facets || facets.attributes[k])) attrs[k] = values
    }
    if (Object.keys(attrs).length) out.attributes = attrs
  }
  return out
}

/** Later sources win per key; attributes merged per key. */
export const mergeFilters = (...sources: SearchFilters[]): SearchFilters => {
  const out: SearchFilters = {}
  for (const s of sources) {
    if (s.categoryIds?.length) out.categoryIds = s.categoryIds
    if (s.priceMin !== undefined) out.priceMin = s.priceMin
    if (s.priceMax !== undefined) out.priceMax = s.priceMax
    if (s.inStock) out.inStock = true
    if (s.attributes) out.attributes = { ...out.attributes, ...s.attributes }
  }
  if (out.priceMin !== undefined && out.priceMax !== undefined && out.priceMin > out.priceMax) delete out.priceMin
  return out
}

/** SQL-level where for ai_offerings. Multi-category and attribute filters are applied after retrieval. */
export const toVectorWhere = (f: SearchFilters): Record<string, unknown> => {
  const where: Record<string, unknown> = {}
  if (f.priceMin !== undefined || f.priceMax !== undefined) {
    where.price = { ...(f.priceMin !== undefined ? { gte: f.priceMin } : {}), ...(f.priceMax !== undefined ? { lte: f.priceMax } : {}) }
  }
  if (f.inStock) where.in_stock = true
  if (f.categoryIds?.length === 1) where.category_ids = { contains: f.categoryIds[0] }
  return where
}

/** In-memory check for filters the SQL where can't express (any-of categories, jsonb attributes). */
export const matchesPostFilters = (
  f: SearchFilters,
  row: { categoryIds: string[]; attributes?: Record<string, unknown> },
): boolean => {
  if (f.categoryIds?.length && !row.categoryIds.some((c) => f.categoryIds!.includes(c))) return false
  // Rows without attribute data (adapter fallback) were already filtered by the adapter query.
  if (!row.attributes) return true
  for (const [k, wanted] of Object.entries(f.attributes ?? {})) {
    const have = row.attributes?.[k]
    const values = (Array.isArray(have) ? have : have == null ? [] : [have]).map((x) => String(x).toLowerCase())
    if (!wanted.some((w) => values.includes(w.toLowerCase()))) return false
  }
  return true
}
