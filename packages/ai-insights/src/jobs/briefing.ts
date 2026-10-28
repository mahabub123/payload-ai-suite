import type { Payload } from 'payload'
import type { Card, CoreServices } from '@payload-ai-suite/ai-core'
import type { MetricCall } from '../ask'
import { collectionExists } from '../data'
import { formatMoney } from '../money'
import { isoDay, resolvePeriod, periodJSON } from '../period'
import { findByDedupeKey, markEmailed, saveReport } from '../reports'
import type { ResolvedInsightsOptions } from '../options'
import {
  aiImpactMetric,
  cartAbandonmentMetric,
  repeatRateMetric,
  revenueMetric,
  searchZeroResultsMetric,
  SEARCH_EVENTS,
  topProductsMetric,
  type MetricOutput,
} from '../metrics/compute'
import { listTenants, sendReportEmail } from './shared'

export const BRIEFING_TASK = 'ai-insights-briefing'

type Kind = 'daily' | 'weekly'

const sign = (n: number | null) => (n === null ? 'n/a' : `${n > 0 ? '+' : ''}${n}%`)

/** Deterministic summary lines: numbers are written by code, never by the model. */
export const briefingLines = (m: Record<string, Record<string, any> | undefined>, locale = 'en'): string[] => {
  const lines: string[] = []
  for (const c of (m.revenue?.byCurrency as any[]) ?? []) {
    lines.push(
      `Revenue ${c.total} (${sign(c.changePct)} vs ${c.previousTotal}), ${c.orders} orders (previous ${c.previousOrders}), average order ${c.aov}.`,
    )
  }
  if (m.revenue && !(m.revenue.byCurrency as any[])?.length && !m.revenue.unavailable) lines.push('No orders in this period.')
  const top = (m.topProducts?.items as any[]) ?? []
  if (top.length) lines.push(`Top products: ${top.slice(0, 3).map((p) => `${p.title} (${p.revenue}, ${p.units} units)`).join('; ')}.`)
  if (m.repeatRate && !m.repeatRate.unavailable && m.repeatRate.customers)
    lines.push(`Repeat customers: ${m.repeatRate.ratePct}% (${m.repeatRate.repeatCustomers} of ${m.repeatRate.customers}).`)
  if (m.cartAbandonment && !m.cartAbandonment.unavailable) {
    const val = (m.cartAbandonment.abandonedValue as any[])?.map((v) => v.formatted ?? formatMoney(v.amount, v.currency, locale)).join(', ')
    lines.push(`Cart abandonment: ${m.cartAbandonment.ratePct}% (${m.cartAbandonment.abandonedCarts} carts${val ? `, ${val} left behind` : ''}).`)
  }
  if (m.searchZeroResults && !m.searchZeroResults.unavailable && m.searchZeroResults.searches) {
    const q = (m.searchZeroResults.topQueries as any[])?.slice(0, 3).map((x) => `"${x.query}"`).join(', ')
    lines.push(`Zero-result searches: ${m.searchZeroResults.zeroResultSearches} of ${m.searchZeroResults.searches} (${m.searchZeroResults.ratePct}%)${q ? `; top: ${q}` : ''}.`)
  }
  const ai = m.aiImpact
  if (ai?.cost && !ai.cost.unavailable) lines.push(`AI cost: $${ai.cost.totalUSD} across ${ai.cost.calls} calls.`)
  if (ai?.assistant && !ai.assistant.unavailable && ai.assistant.conversations)
    lines.push(`Assistant: ${ai.assistant.conversations} conversations, ${ai.assistant.orderedWithin24h} led to an order within 24h (${ai.assistant.conversionPct}%).`)
  if (ai?.content && !ai.content.unavailable && ai.content.decided)
    lines.push(`AI content accepted: ${ai.content.acceptancePct}% (${ai.content.accepted} of ${ai.content.decided}).`)
  return lines
}

export const runBriefing = async (
  payload: Payload,
  services: CoreServices,
  kind: Kind,
  opts: Pick<ResolvedInsightsOptions, 'emailTo' | 'excludedStatuses'>,
  now: Date = new Date(),
) => {
  const out: { tenant?: string | number; reportId: string | number; skipped: boolean; emailed: boolean }[] = []
  for (const tenant of await listTenants(payload)) {
    const ctx = services.systemContext(payload, { module: 'insights', tenant })
    const period = resolvePeriod(kind === 'daily' ? 'yesterday' : 'last7d', now)
    const key = `briefing:${kind}:${isoDay(period.from)}:${tenant ?? '-'}`
    const title = `${kind === 'daily' ? 'Daily' : 'Weekly'} briefing — ${period.label} (${isoDay(period.from)})`

    const existing = await findByDedupeKey(payload, key)
    if (existing) {
      let emailed = Boolean(existing.emailedAt)
      if (!emailed && opts.emailTo.length) {
        emailed = await sendReportEmail(payload, opts.emailTo, title, title, String(existing.answer ?? '').split('\n').filter(Boolean))
        await markEmailed(payload, existing.id)
      }
      out.push({ tenant, reportId: existing.id, skipped: true, emailed })
      continue
    }

    const calls: MetricCall[] = []
    const results: Record<string, Record<string, any>> = {}
    const charts: Card[] = []
    const take = async (tool: string, input: unknown, fn: () => Promise<MetricOutput>) => {
      const r = await fn()
      calls.push({ tool, toolCallId: tool, input, ok: true, output: r.data })
      results[tool] = r.data
      charts.push(...r.cards)
    }
    const ex = opts.excludedStatuses
    const p = periodJSON(period)
    if (ctx.adapters.order) {
      await take('revenue', { period: p, groupBy: 'day' }, () => revenueMetric(ctx, period, 'day', ex))
      await take('topProducts', { period: p, limit: 5, by: 'revenue' }, () => topProductsMetric(ctx, period, 5, 'revenue', ex))
      await take('repeatRate', { period: p }, () => repeatRateMetric(ctx, period, ex))
    }
    if (ctx.adapters.cart) await take('cartAbandonment', { period: p }, () => cartAbandonmentMetric(ctx, period, ex, now))
    if (collectionExists(payload, SEARCH_EVENTS)) await take('searchZeroResults', { period: p }, () => searchZeroResultsMetric(ctx, period))
    await take('aiImpact', { period: p }, () => aiImpactMetric(ctx, period))

    const lines = briefingLines(results, ctx.locale)
    if (!lines.length) lines.push('No business data available for this period.')
    const saved = await saveReport(
      payload,
      { question: title, kind: 'briefing', period: p, answer: lines.join('\n'), verification: 'computed', metricCalls: calls, charts, dedupeKey: key },
      tenant,
    )
    let emailed = false
    if (opts.emailTo.length) {
      emailed = await sendReportEmail(payload, opts.emailTo, title, title, lines)
      await markEmailed(payload, saved.id)
    }
    out.push({ tenant, reportId: saved.id, skipped: false, emailed })
  }
  return out
}
