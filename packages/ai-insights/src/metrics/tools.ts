import { z } from 'zod'
import type { AITool, AIContext } from '@payload-ai-suite/ai-core'
import { defineTool, hasRole } from '@payload-ai-suite/ai-core'
import { periodSchema, resolvePeriod } from '../period'
import {
  aiImpactMetric,
  cartAbandonmentMetric,
  repeatRateMetric,
  revenueMetric,
  searchZeroResultsMetric,
  topProductsMetric,
} from './compute'

/** Insights are for managers (and store/super admins) only — §12 access matrix. */
export const isInsightsActor = (ctx: Pick<AIContext, 'actor'>): boolean =>
  (ctx.actor.kind === 'staff' || ctx.actor.kind === 'system') && hasRole(ctx.actor.roles, ['manager', 'store-admin'])

const periodField = periodSchema
  .optional()
  .describe("Preset ('yesterday', 'last7d', 'last28d', 'thisMonth', 'lastMonth', …) or { from, to } ISO dates. Default last28d.")

export const METRIC_TOOL_NAMES = ['revenue', 'topProducts', 'repeatRate', 'cartAbandonment', 'searchZeroResults', 'aiImpact'] as const

export const buildMetricTools = (opts: { excludedStatuses: Set<string> }): AITool[] => {
  const ex = opts.excludedStatuses
  const base = { tier: 'read' as const, available: isInsightsActor }
  return [
    defineTool({
      ...base,
      name: 'revenue',
      description:
        'Revenue (minor units + formatted), order count, AOV and change vs the previous equal-length period, grouped by day/week/month/category/offering.',
      requires: ['order'],
      input: z.object({ period: periodField, groupBy: z.enum(['day', 'week', 'month', 'category', 'offering']).default('day') }),
      run: async (i, ctx) => revenueMetric(ctx, resolvePeriod(i.period), i.groupBy, ex),
    }),
    defineTool({
      ...base,
      name: 'topProducts',
      description: 'Best-selling offerings in a period ranked by revenue or units.',
      requires: ['order'],
      input: z.object({ period: periodField, limit: z.number().int().min(1).max(50).default(10), by: z.enum(['revenue', 'units']).default('revenue') }),
      run: async (i, ctx) => topProductsMetric(ctx, resolvePeriod(i.period), i.limit, i.by, ex),
    }),
    defineTool({
      ...base,
      name: 'repeatRate',
      description: 'Share of customers ordering in the period who have ordered at least twice (ever, up to period end).',
      requires: ['order'],
      input: z.object({ period: periodField }),
      run: async (i, ctx) => repeatRateMetric(ctx, resolvePeriod(i.period), ex),
    }),
    defineTool({
      ...base,
      name: 'cartAbandonment',
      description: 'Abandoned carts vs orders in the period and the value left in abandoned carts.',
      requires: ['cart'],
      input: z.object({ period: periodField }),
      run: async (i, ctx) => cartAbandonmentMetric(ctx, resolvePeriod(i.period), ex),
    }),
    defineTool({
      ...base,
      name: 'searchZeroResults',
      description: 'Site searches that returned no results: counts, rate and the most common queries.',
      input: z.object({ period: periodField }),
      run: async (i, ctx) => searchZeroResultsMetric(ctx, resolvePeriod(i.period)),
    }),
    defineTool({
      ...base,
      name: 'aiImpact',
      description: 'AI suite impact: AI cost by module, assistant conversations that led to an order within 24h, content suggestion acceptance.',
      input: z.object({ period: periodField }),
      run: async (i, ctx) => aiImpactMetric(ctx, resolvePeriod(i.period)),
    }),
  ] as AITool[]
}
