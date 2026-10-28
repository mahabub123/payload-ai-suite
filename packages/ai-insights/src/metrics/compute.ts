/**
 * Metric computations shared by the agent tools, briefings and anomaly jobs. All read-only.
 * Business data via adapters (ctx.adapterCtx carries caller access + tenant); suite collections via loadDocs.
 */
import type { AIContext, Card, ChartSeries } from 'payload-ai-core'
import { collectionExists, loadDocs, loadOrders } from '../data'
import { changePct, formatMoney, pct, toMajor } from '../money'
import { periodJSON, previousPeriod, type ResolvedPeriod } from '../period'
import {
  computeCartAbandonment,
  computeRepeatRate,
  computeRevenue,
  computeTopProducts,
  computeZeroResults,
  type RevenueGroupBy,
} from './math'

export type MetricCtx = Pick<AIContext, 'payload' | 'adapters' | 'adapterCtx' | 'tenant' | 'locale'>

export interface MetricOutput<D = Record<string, unknown>> {
  data: D
  cards: Card[]
}

const chart = (title: string, kind: 'line' | 'bar' | 'pie' | 'table', series: ChartSeries[]): Card => ({ type: 'chart', title, kind, series })

const unavailable = (reason: string): MetricOutput => ({ data: { unavailable: true, reason }, cards: [] })

/* ---------- revenue ---------- */

export const revenueMetric = async (
  ctx: MetricCtx,
  period: ResolvedPeriod,
  groupBy: RevenueGroupBy,
  excluded: Set<string>,
): Promise<MetricOutput> => {
  if (!ctx.adapters.order) return unavailable('No order collection is mapped.')
  const prev = previousPeriod(period)
  const [orders, prevOrders] = await Promise.all([loadOrders(ctx, period, excluded), loadOrders(ctx, prev, excluded)])

  let categoriesOf: ((id: string) => string[]) | undefined
  let categoryTitle: ((id: string) => string | undefined) | undefined
  if (groupBy === 'category') {
    const offering = ctx.adapters.offering
    const cats = new Map<string, string[]>()
    if (offering) {
      const ids = [...new Set(orders.flatMap((o) => (o.items ?? []).map((i) => i.offeringId)))]
      await Promise.all(
        ids.map(async (id) => {
          const off = await offering.get(id, ctx.adapterCtx).catch(() => null)
          cats.set(id, off?.categoryIds ?? [])
        }),
      )
    }
    categoriesOf = (id) => cats.get(id) ?? []
    const titles = new Map<string, string>()
    const list = await ctx.adapters.category?.list(ctx.adapterCtx).catch(() => [])
    for (const c of list ?? []) titles.set(c.id, c.title)
    categoryTitle = (id) => titles.get(id)
  }

  const current = computeRevenue(orders, period, groupBy, { categoriesOf, categoryTitle })
  const previous = computeRevenue(prevOrders, prev, 'month')
  const byCurrency = current.map((c) => {
    const p = previous.find((x) => x.currency === c.currency)
    const groups = groupBy === 'category' || groupBy === 'offering' ? c.groups.slice(0, 15) : c.groups
    return {
      currency: c.currency,
      totalMinor: c.total,
      total: formatMoney(c.total, c.currency, ctx.locale),
      orders: c.orders,
      aovMinor: c.aov,
      aov: formatMoney(c.aov, c.currency, ctx.locale),
      previousTotalMinor: p?.total ?? 0,
      previousTotal: formatMoney(p?.total ?? 0, c.currency, ctx.locale),
      previousOrders: p?.orders ?? 0,
      changePct: changePct(c.total, p?.total ?? 0),
      groups: groups.map((g) => ({ key: g.key, label: g.label, amountMinor: g.amount, amount: formatMoney(g.amount, c.currency, ctx.locale), orders: g.orders })),
    }
  })
  const time = groupBy === 'day' || groupBy === 'week' || groupBy === 'month'
  const cards = byCurrency.length
    ? [
        chart(
          `Revenue by ${groupBy} (${period.label})`,
          time ? 'line' : 'bar',
          byCurrency.map((c) => ({
            name: `Revenue (${c.currency})`,
            points: c.groups.map((g) => ({ x: g.label, y: toMajor(g.amountMinor, c.currency) })),
          })),
        ),
      ]
    : []
  return { data: { period: periodJSON(period), groupBy, byCurrency, ordersTotal: orders.length }, cards }
}

/* ---------- top products ---------- */

export const topProductsMetric = async (
  ctx: MetricCtx,
  period: ResolvedPeriod,
  limit: number,
  by: 'revenue' | 'units',
  excluded: Set<string>,
): Promise<MetricOutput> => {
  if (!ctx.adapters.order) return unavailable('No order collection is mapped.')
  const orders = await loadOrders(ctx, period, excluded)
  const top = computeTopProducts(orders, limit, by)
  const items = top.map((p, i) => ({
    rank: i + 1,
    offeringId: p.offeringId,
    title: p.title,
    units: p.units,
    revenueMinor: p.revenue,
    revenue: formatMoney(p.revenue, p.currency, ctx.locale),
    currency: p.currency,
  }))
  const cards = items.length
    ? [
        chart(`Top products by ${by} (${period.label})`, 'bar', [
          {
            name: by === 'units' ? 'Units' : `Revenue (${items[0].currency})`,
            points: top.map((p) => ({ x: p.title, y: by === 'units' ? p.units : toMajor(p.revenue, p.currency) })),
          },
        ]),
      ]
    : []
  return { data: { period: periodJSON(period), by, limit, items }, cards }
}

/* ---------- repeat rate ---------- */

export const repeatRateMetric = async (ctx: MetricCtx, period: ResolvedPeriod, excluded: Set<string>): Promise<MetricOutput> => {
  if (!ctx.adapters.order) return unavailable('No order collection is mapped.')
  const history = await loadOrders(ctx, { to: period.to }, excluded)
  const r = computeRepeatRate(history, period)
  return {
    data: { period: periodJSON(period), ...r, newCustomers: r.customers - r.repeatCustomers },
    cards: [
      chart(`Repeat vs new customers (${period.label})`, 'pie', [
        { name: 'Customers', points: [{ x: 'Repeat', y: r.repeatCustomers }, { x: 'New', y: r.customers - r.repeatCustomers }] },
      ]),
    ],
  }
}

/* ---------- cart abandonment ---------- */

export const cartAbandonmentMetric = async (
  ctx: MetricCtx,
  period: ResolvedPeriod,
  excluded: Set<string>,
  now: Date = new Date(),
): Promise<MetricOutput> => {
  const cart = ctx.adapters.cart
  if (!cart) return unavailable('No cart collection is mapped.')
  // A cart counts as abandoned once idle for an hour.
  const olderThan = new Date(Math.min(period.to.getTime(), now.getTime() - 3_600_000))
  const carts = await cart.listAbandoned({ olderThan, limit: 10_000 }, ctx.adapterCtx)
  const inPeriod = carts.filter((c) => {
    const t = c.updatedAt ? Date.parse(c.updatedAt) : NaN
    return !Number.isNaN(t) && t >= period.from.getTime() && t < period.to.getTime()
  })
  const orders = ctx.adapters.order ? (await loadOrders(ctx, period, excluded)).length : 0
  const r = computeCartAbandonment(inPeriod, orders)
  return {
    data: {
      period: periodJSON(period),
      ...r,
      abandonedValue: r.abandonedValue.map((v) => ({ ...v, formatted: formatMoney(v.amount, v.currency, ctx.locale) })),
      definition: 'abandoned carts / (abandoned carts + orders) in the period',
    },
    cards: [
      chart(`Cart abandonment (${period.label})`, 'pie', [
        { name: 'Carts', points: [{ x: 'Abandoned', y: r.abandonedCarts }, { x: 'Ordered', y: r.orders }] },
      ]),
    ],
  }
}

/* ---------- zero-result searches ---------- */

export const SEARCH_EVENTS = 'ai-search-events'

export const searchZeroResultsMetric = async (ctx: MetricCtx, period: ResolvedPeriod): Promise<MetricOutput> => {
  if (!collectionExists(ctx.payload, SEARCH_EVENTS)) return unavailable('AI search is not installed (no ai-search-events collection).')
  const events = await loadDocs(ctx, SEARCH_EVENTS, period)
  const r = computeZeroResults(events)
  return {
    data: { period: periodJSON(period), ...r },
    cards: r.topQueries.length
      ? [chart(`Top zero-result searches (${period.label})`, 'bar', [{ name: 'Searches', points: r.topQueries.map((q) => ({ x: q.query, y: q.count })) }])]
      : [],
  }
}

/* ---------- AI impact ---------- */

const tagsOf = (doc: Record<string, unknown>): string[] => {
  const t = doc.tags
  if (!Array.isArray(t)) return typeof t === 'string' ? t.split(',').map((s) => s.trim()) : []
  return t.map((x) => (typeof x === 'string' ? x : String((x as { tag?: unknown; value?: unknown })?.tag ?? (x as { value?: unknown })?.value ?? ''))).filter(Boolean)
}

const ORDER_OUTCOMES = new Set(['ordered', 'ordered-24h', 'ordered_within_24h', 'ordered-within-24h', 'order'])

export const aiImpactMetric = async (ctx: MetricCtx, period: ResolvedPeriod): Promise<MetricOutput> => {
  const data: Record<string, unknown> = { period: periodJSON(period) }
  const cards: Card[] = []

  if (collectionExists(ctx.payload, 'ai-usage')) {
    const rows = await loadDocs(ctx, 'ai-usage', period)
    const byModule = new Map<string, { calls: number; costMicros: number }>()
    for (const r of rows) {
      const m = String(r.module ?? 'unknown')
      const e = byModule.get(m) ?? { calls: 0, costMicros: 0 }
      e.calls++
      e.costMicros += Number(r.costMicros ?? 0) || 0
      byModule.set(m, e)
    }
    const modules = [...byModule.entries()]
      .map(([module, e]) => ({ module, calls: e.calls, costMicros: e.costMicros, costUSD: Math.round(e.costMicros / 10_000) / 100 }))
      .sort((a, b) => b.costMicros - a.costMicros)
    const totalMicros = modules.reduce((s, m) => s + m.costMicros, 0)
    data.cost = { totalMicros, totalUSD: Math.round(totalMicros / 10_000) / 100, calls: rows.length, byModule: modules }
    if (modules.length) cards.push(chart(`AI cost by module, USD (${period.label})`, 'bar', [{ name: 'Cost (USD)', points: modules.map((m) => ({ x: m.module, y: m.costUSD })) }]))
  } else data.cost = { unavailable: true }

  if (collectionExists(ctx.payload, 'ai-conversations')) {
    const assistant = (await loadDocs(ctx, 'ai-conversations', period)).filter(
      (c) => ['assistant', 'channels'].includes(String(c.module ?? 'assistant')) && c.channel !== 'admin',
    )
    const ordered = assistant.filter((c) => {
      const outcome = typeof c.outcome === 'string' ? c.outcome.toLowerCase() : ''
      return ORDER_OUTCOMES.has(outcome) || tagsOf(c).some((t) => ORDER_OUTCOMES.has(t.toLowerCase()))
    })
    const handedOff = assistant.filter((c) => c.handedOff === true || tagsOf(c).includes('handed-off'))
    data.assistant = {
      conversations: assistant.length,
      orderedWithin24h: ordered.length,
      conversionPct: pct(ordered.length, assistant.length),
      handedOff: handedOff.length,
    }
  } else data.assistant = { unavailable: true }

  if (collectionExists(ctx.payload, 'ai-generations')) {
    const gens = await loadDocs(ctx, 'ai-generations', period)
    const decided = gens.filter((g) => typeof g.accepted === 'boolean')
    const accepted = decided.filter((g) => g.accepted === true).length
    data.content = { generations: gens.length, decided: decided.length, accepted, acceptancePct: pct(accepted, decided.length) }
  } else data.content = { unavailable: true }

  return { data, cards }
}
