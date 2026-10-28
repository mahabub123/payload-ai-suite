/** Pure metric math over adapter-shaped records. Money stays in integer minor units throughout. */
import type { Cart, Order } from 'payload-ai-core'
import { bucketKey, bucketKeys, type ResolvedPeriod } from '../period'
import { pct } from '../money'

export type RevenueGroupBy = 'day' | 'week' | 'month' | 'category' | 'offering'

export interface RevenueGroup {
  key: string
  label: string
  /** Minor units. */
  amount: number
  orders: number
}

export interface RevenueByCurrency {
  currency: string
  /** Minor units. */
  total: number
  orders: number
  /** Average order value, minor units (rounded). */
  aov: number
  groups: RevenueGroup[]
}

const isTimeGrouping = (g: RevenueGroupBy): g is 'day' | 'week' | 'month' => g === 'day' || g === 'week' || g === 'month'

/**
 * Revenue per currency. Time groupings use order totals; category/offering groupings use line items
 * (unit price × quantity), so they exclude shipping/tax and can differ slightly from the total.
 */
export const computeRevenue = (
  orders: Order[],
  period: ResolvedPeriod,
  groupBy: RevenueGroupBy,
  lookups: { categoriesOf?: (offeringId: string) => string[]; categoryTitle?: (id: string) => string | undefined } = {},
): RevenueByCurrency[] => {
  const byCur = new Map<string, { total: number; orders: number; groups: Map<string, RevenueGroup> }>()
  const cur = (c: string) => {
    let e = byCur.get(c)
    if (!e) {
      e = { total: 0, orders: 0, groups: new Map() }
      if (isTimeGrouping(groupBy)) for (const k of bucketKeys(period, groupBy)) e.groups.set(k, { key: k, label: k, amount: 0, orders: 0 })
      byCur.set(c, e)
    }
    return e
  }
  const add = (e: ReturnType<typeof cur>, key: string, label: string, amount: number, countOrder: boolean) => {
    const g = e.groups.get(key) ?? { key, label, amount: 0, orders: 0 }
    g.amount += amount
    if (countOrder) g.orders += 1
    e.groups.set(key, g)
  }
  for (const o of orders) {
    const currency = (o.total?.currency ?? 'USD').toUpperCase()
    const e = cur(currency)
    e.total += o.total?.amount ?? 0
    e.orders += 1
    if (isTimeGrouping(groupBy)) {
      const k = bucketKey(new Date(o.createdAt), groupBy)
      add(e, k, k, o.total?.amount ?? 0, true)
      continue
    }
    const seen = new Set<string>()
    for (const it of o.items ?? []) {
      const amount = (it.price?.amount ?? 0) * (it.quantity ?? 0)
      const itemCur = (it.price?.currency ?? currency).toUpperCase()
      const target = itemCur === currency ? e : cur(itemCur)
      let key: string
      let label: string
      if (groupBy === 'offering') {
        key = it.offeringId
        label = it.title || it.offeringId
      } else {
        // Attribute each line to the offering's first category so totals never double count.
        const cat = lookups.categoriesOf?.(it.offeringId)?.[0]
        key = cat ?? 'uncategorized'
        label = cat ? (lookups.categoryTitle?.(cat) ?? cat) : 'Uncategorized'
      }
      add(target, key, label, amount, !seen.has(key))
      seen.add(key)
    }
  }
  return [...byCur.entries()]
    .map(([currency, e]) => {
      const groups = [...e.groups.values()]
      if (!isTimeGrouping(groupBy)) groups.sort((a, b) => b.amount - a.amount)
      return { currency, total: e.total, orders: e.orders, aov: e.orders ? Math.round(e.total / e.orders) : 0, groups }
    })
    .sort((a, b) => b.total - a.total)
}

export interface TopProduct {
  offeringId: string
  title: string
  units: number
  /** Minor units. */
  revenue: number
  currency: string
}

export const computeTopProducts = (orders: Order[], limit: number, by: 'revenue' | 'units'): TopProduct[] => {
  const m = new Map<string, TopProduct>()
  for (const o of orders) {
    for (const it of o.items ?? []) {
      const currency = (it.price?.currency ?? o.total?.currency ?? 'USD').toUpperCase()
      const key = `${it.offeringId}|${currency}`
      const p = m.get(key) ?? { offeringId: it.offeringId, title: it.title || it.offeringId, units: 0, revenue: 0, currency }
      p.units += it.quantity ?? 0
      p.revenue += (it.price?.amount ?? 0) * (it.quantity ?? 0)
      m.set(key, p)
    }
  }
  return [...m.values()].sort((a, b) => (by === 'units' ? b.units - a.units || b.revenue - a.revenue : b.revenue - a.revenue || b.units - a.units)).slice(0, limit)
}

export const customerKey = (o: Order): string | undefined =>
  o.customerId ? `id:${o.customerId}` : o.customerEmail ? `email:${o.customerEmail.trim().toLowerCase()}` : undefined

export interface RepeatRate {
  /** Identified customers who ordered in the period. */
  customers: number
  /** Of those, customers with at least one other order up to the period end. */
  repeatCustomers: number
  /** Percent, one decimal. */
  ratePct: number
  /** Orders in the period without a customer id or email (not counted). */
  anonymousOrders: number
}

/** `history` = all orders up to period end (any start); orders in the period decide who counts. */
export const computeRepeatRate = (history: Order[], period: ResolvedPeriod): RepeatRate => {
  const counts = new Map<string, number>()
  const inPeriod = new Set<string>()
  let anonymousOrders = 0
  for (const o of history) {
    const t = Date.parse(o.createdAt)
    if (t >= period.to.getTime()) continue
    const k = customerKey(o)
    const within = t >= period.from.getTime()
    if (!k) {
      if (within) anonymousOrders++
      continue
    }
    counts.set(k, (counts.get(k) ?? 0) + 1)
    if (within) inPeriod.add(k)
  }
  let repeat = 0
  for (const k of inPeriod) if ((counts.get(k) ?? 0) >= 2) repeat++
  return { customers: inPeriod.size, repeatCustomers: repeat, ratePct: pct(repeat, inPeriod.size), anonymousOrders }
}

export interface CartAbandonment {
  abandonedCarts: number
  orders: number
  /** abandoned / (abandoned + orders), percent with one decimal. */
  ratePct: number
  /** Value left in abandoned carts per currency, minor units. */
  abandonedValue: { currency: string; amount: number }[]
}

export const cartValue = (c: Cart): { currency: string; amount: number } | undefined => {
  if (c.subtotal) return { currency: c.subtotal.currency.toUpperCase(), amount: c.subtotal.amount }
  const priced = c.items.filter((i) => i.price)
  if (!priced.length) return undefined
  return {
    currency: priced[0].price!.currency.toUpperCase(),
    amount: priced.reduce((s, i) => s + i.price!.amount * i.quantity, 0),
  }
}

export const computeCartAbandonment = (abandoned: Cart[], ordersInPeriod: number): CartAbandonment => {
  const value = new Map<string, number>()
  for (const c of abandoned) {
    const v = cartValue(c)
    if (v) value.set(v.currency, (value.get(v.currency) ?? 0) + v.amount)
  }
  return {
    abandonedCarts: abandoned.length,
    orders: ordersInPeriod,
    ratePct: pct(abandoned.length, abandoned.length + ordersInPeriod),
    abandonedValue: [...value.entries()].map(([currency, amount]) => ({ currency, amount })),
  }
}

/** Search events count as searches when they carry a query and are not click/cart events. */
export const resultCountOf = (e: Record<string, unknown>): number | undefined => {
  for (const k of ['resultCount', 'total', 'results']) {
    const v = e[k]
    if (typeof v === 'number') return v
    if (Array.isArray(v)) return v.length
    if (v && typeof v === 'object' && Array.isArray((v as { items?: unknown[] }).items)) return (v as { items: unknown[] }).items.length
  }
  return undefined
}

export const computeZeroResults = (events: Record<string, unknown>[], limit = 10) => {
  let searches = 0
  let zero = 0
  const queries = new Map<string, number>()
  for (const e of events) {
    const type = typeof e.type === 'string' ? e.type : undefined
    if (type && type !== 'search') continue
    const q = typeof e.query === 'string' ? e.query.trim().toLowerCase() : ''
    const n = resultCountOf(e)
    if (!q || n === undefined) continue
    searches++
    if (n === 0) {
      zero++
      queries.set(q, (queries.get(q) ?? 0) + 1)
    }
  }
  return {
    searches,
    zeroResultSearches: zero,
    ratePct: pct(zero, searches),
    topQueries: [...queries.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([query, count]) => ({ query, count })),
  }
}
