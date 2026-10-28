import type { Payload } from 'payload'
import type { Card, CoreServices } from 'payload-ai-core'
import { collectionExists, loadDocs, loadOrders } from '../data'
import { detectAnomaly, median, type AnomalyResult } from '../anomaly'
import { formatMoney, toMajor } from '../money'
import { bucketKey, bucketKeys, isoDay, resolvePeriod, periodJSON, type ResolvedPeriod } from '../period'
import { findByDedupeKey, markEmailed, saveReport } from '../reports'
import { computeRevenue, resultCountOf } from '../metrics/math'
import type { MetricCtx } from '../metrics/compute'
import { SEARCH_EVENTS } from '../metrics/compute'
import type { AnomalyMetric, ResolvedInsightsOptions } from '../options'
import { listTenants, sendReportEmail } from './shared'

export const ANOMALY_TASK = 'ai-insights-anomalies'
export const TRAILING_DAYS = 28

export interface DailySeries {
  metric: AnomalyMetric
  keys: string[]
  /** One value per day; NaN = undefined for that day (e.g. AOV with no orders). */
  values: number[]
  currency?: string
}

const DAY = 86_400_000

/** Daily series over `window` for the requested metrics (read-only, tenant-scoped through ctx). */
export const dailySeries = async (
  ctx: MetricCtx,
  window: ResolvedPeriod,
  metrics: AnomalyMetric[],
  excluded: Set<string>,
): Promise<DailySeries[]> => {
  const keys = bucketKeys(window, 'day')
  const zero = () => new Map(keys.map((k) => [k, 0]))
  const out: DailySeries[] = []
  const want = new Set(metrics)

  if ((want.has('revenue') || want.has('orders') || want.has('aov') || want.has('conversion')) && ctx.adapters.order) {
    const orders = await loadOrders(ctx, window, excluded)
    const rev = computeRevenue(orders, window, 'day')
    const primary = rev[0]
    const ordersPerDay = zero()
    for (const o of orders) {
      const k = bucketKey(new Date(o.createdAt), 'day')
      ordersPerDay.set(k, (ordersPerDay.get(k) ?? 0) + 1)
    }
    const amount = new Map(primary?.groups.map((g) => [g.key, g.amount]) ?? [])
    const primaryOrders = new Map(primary?.groups.map((g) => [g.key, g.orders]) ?? [])
    if (want.has('revenue')) out.push({ metric: 'revenue', keys, values: keys.map((k) => amount.get(k) ?? 0), currency: primary?.currency })
    if (want.has('orders')) out.push({ metric: 'orders', keys, values: keys.map((k) => ordersPerDay.get(k) ?? 0) })
    if (want.has('aov'))
      out.push({
        metric: 'aov',
        keys,
        values: keys.map((k) => ((primaryOrders.get(k) ?? 0) > 0 ? Math.round((amount.get(k) ?? 0) / primaryOrders.get(k)!) : NaN)),
        currency: primary?.currency,
      })
    if (want.has('conversion') && ctx.adapters.cart) {
      const carts = await ctx.adapters.cart.listAbandoned({ olderThan: window.to, limit: 10_000 }, ctx.adapterCtx)
      const abandoned = zero()
      for (const c of carts) {
        const t = c.updatedAt ? Date.parse(c.updatedAt) : NaN
        if (Number.isNaN(t) || t < window.from.getTime() || t >= window.to.getTime()) continue
        const k = bucketKey(new Date(t), 'day')
        abandoned.set(k, (abandoned.get(k) ?? 0) + 1)
      }
      out.push({
        metric: 'conversion',
        keys,
        values: keys.map((k) => {
          const o = ordersPerDay.get(k) ?? 0
          const a = abandoned.get(k) ?? 0
          return o + a > 0 ? Math.round((o / (o + a)) * 1000) / 10 : NaN
        }),
      })
    }
  }
  if (want.has('zeroResultSearches') && collectionExists(ctx.payload, SEARCH_EVENTS)) {
    const per = zero()
    for (const e of await loadDocs(ctx, SEARCH_EVENTS, window)) {
      if (resultCountOf(e) !== 0 || (typeof e.type === 'string' && e.type !== 'search')) continue
      const k = bucketKey(new Date(String(e.createdAt)), 'day')
      per.set(k, (per.get(k) ?? 0) + 1)
    }
    out.push({ metric: 'zeroResultSearches', keys, values: keys.map((k) => per.get(k) ?? 0) })
  }
  if (want.has('aiCost') && collectionExists(ctx.payload, 'ai-usage')) {
    const per = zero()
    for (const r of await loadDocs(ctx, 'ai-usage', window)) {
      const k = bucketKey(new Date(String(r.createdAt)), 'day')
      per.set(k, (per.get(k) ?? 0) + (Number(r.costMicros) || 0))
    }
    out.push({ metric: 'aiCost', keys, values: keys.map((k) => per.get(k) ?? 0) })
  }
  return out
}

/** Absolute floor for the band spread so near-flat series do not alert on noise. */
const minSpreadFor = (metric: AnomalyMetric, history: number[]) => {
  const finite = history.filter(Number.isFinite)
  const m = finite.length ? Math.abs(median(finite)) : 0
  if (metric === 'orders' || metric === 'zeroResultSearches') return Math.max(1, 0.1 * m)
  if (metric === 'conversion') return 2
  return 0.1 * m
}

export interface FlaggedMetric extends AnomalyResult {
  metric: AnomalyMetric
  day: string
  currency?: string
}

export const evaluateSeries = (series: DailySeries[], k: number): FlaggedMetric[] =>
  series.flatMap((s) => {
    const history = s.values.slice(0, -1)
    const value = s.values[s.values.length - 1]
    if (!Number.isFinite(value)) return []
    const r = detectAnomaly(history, value, k, { minSpread: minSpreadFor(s.metric, history) })
    return r.anomalous ? [{ ...r, metric: s.metric, day: s.keys[s.keys.length - 1], currency: s.currency }] : []
  })

const LABELS: Record<AnomalyMetric, string> = {
  revenue: 'Revenue',
  orders: 'Orders',
  aov: 'Average order value',
  conversion: 'Checkout conversion (orders vs abandoned carts, %)',
  zeroResultSearches: 'Zero-result searches',
  aiCost: 'AI cost (USD)',
}

const fmt = (metric: AnomalyMetric, v: number, currency?: string, locale = 'en') =>
  !Number.isFinite(v)
    ? 'n/a'
    : (metric === 'revenue' || metric === 'aov') && currency
      ? formatMoney(Math.round(v), currency, locale)
      : metric === 'aiCost'
        ? `$${(v / 1e6).toFixed(2)}`
        : metric === 'conversion'
          ? `${v.toFixed(1)}%`
          : String(Math.round(v * 10) / 10)

export const anomalyLine = (f: FlaggedMetric, locale = 'en') =>
  `${LABELS[f.metric]} on ${f.day} was ${fmt(f.metric, f.value, f.currency, locale)} — unusually ${f.direction} (normal range ${fmt(f.metric, Math.max(0, f.lower), f.currency, locale)} – ${fmt(f.metric, f.upper, f.currency, locale)}).`

const chartValue = (s: DailySeries, v: number) =>
  (s.metric === 'revenue' || s.metric === 'aov') && s.currency ? toMajor(v, s.currency) : s.metric === 'aiCost' ? v / 1e6 : v

export const runAnomalies = async (
  payload: Payload,
  services: CoreServices,
  opts: Pick<ResolvedInsightsOptions, 'anomalyMetrics' | 'sensitivity' | 'anomalyEmailTo' | 'excludedStatuses'>,
  now: Date = new Date(),
) => {
  const out: { tenant?: string | number; flagged: number; reportId?: string | number; skipped?: boolean }[] = []
  for (const tenant of await listTenants(payload)) {
    const ctx = services.systemContext(payload, { module: 'insights', tenant })
    const day = resolvePeriod('yesterday', now)
    const window: ResolvedPeriod = { from: new Date(day.from.getTime() - TRAILING_DAYS * DAY), to: day.to, label: `trailing ${TRAILING_DAYS} days` }
    const key = `anomaly:${isoDay(day.from)}:${tenant ?? '-'}`
    const existing = await findByDedupeKey(payload, key)
    if (existing) {
      if (!existing.emailedAt && opts.anomalyEmailTo.length) {
        await sendReportEmail(payload, opts.anomalyEmailTo, String(existing.question), String(existing.question), String(existing.answer ?? '').split('\n'))
        await markEmailed(payload, existing.id)
      }
      out.push({ tenant, flagged: Array.isArray(existing.flagged) ? existing.flagged.length : 0, reportId: existing.id, skipped: true })
      continue
    }
    const series = await dailySeries(ctx, window, opts.anomalyMetrics, opts.excludedStatuses)
    const flagged = evaluateSeries(series, opts.sensitivity)
    if (!flagged.length) {
      out.push({ tenant, flagged: 0 })
      continue
    }
    const charts: Card[] = flagged.map((f) => {
      const s = series.find((x) => x.metric === f.metric)!
      const pts = (vals: number[]) => s.keys.map((k, i) => ({ x: k, y: chartValue(s, vals[i]) })).filter((p) => Number.isFinite(p.y))
      return {
        type: 'chart',
        title: `${LABELS[f.metric]} — last ${TRAILING_DAYS + 1} days`,
        kind: 'line',
        series: [
          { name: LABELS[f.metric], points: pts(s.values) },
          { name: 'Upper band', points: pts(s.values.map(() => f.upper)) },
          { name: 'Lower band', points: pts(s.values.map(() => Math.max(0, f.lower))) },
        ],
      }
    })
    const lines = flagged.map((f) => anomalyLine(f, ctx.locale))
    const title = `Anomaly alert — ${isoDay(day.from)}`
    const saved = await saveReport(
      payload,
      {
        question: title,
        kind: 'anomaly',
        period: periodJSON(day),
        answer: lines.join('\n'),
        verification: 'computed',
        metricCalls: series.map((s) => ({ tool: `series:${s.metric}`, toolCallId: s.metric, input: { window: periodJSON(window) }, ok: true, output: s })),
        charts,
        flagged,
        dedupeKey: key,
      },
      tenant,
    )
    if (opts.anomalyEmailTo.length) {
      await sendReportEmail(payload, opts.anomalyEmailTo, title, title, lines)
      await markEmailed(payload, saved.id)
    }
    out.push({ tenant, flagged: flagged.length, reportId: saved.id })
  }
  return out
}
