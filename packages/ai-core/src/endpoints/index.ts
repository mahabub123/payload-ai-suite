import { z } from 'zod'
import type { AIEndpointDefinition } from '../contracts'
import { AIError } from '../contracts'
import { SLUGS } from '../collections/slugs'
import { dayKey, loose, tenantKey } from '../usage/db'

const DAY = 86_400_000

const usageInput = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  days: z.coerce.number().int().min(1).max(366).optional(),
})

export interface UsageResponse {
  from: string
  to: string
  unit: 'micro-USD'
  modules: { module: string; calls: number; inputTokens: number; outputTokens: number; costMicros: number }[]
  daily: { date: string; calls: number; costMicros: number; errors: number }[]
  totals: { calls: number; inputTokens: number; outputTokens: number; costMicros: number }
  monthToDateMicros: number
  budget: { limitMicros: number | null; spentMicros: number; ratio: number }
}

const parseDate = (s: string | undefined, fallback: Date) => {
  if (!s) return fallback
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) throw new AIError('validation', `Invalid date "${s}"`)
  return d
}

/** GET /api/ai/usage — usage & cost per module (and per day) for a date range. Admin only. */
export const usageEndpoint: AIEndpointDefinition<z.infer<typeof usageInput>> = {
  path: '/ai/usage',
  method: 'get',
  module: 'core',
  access: ['store-admin'],
  surface: 'admin',
  budget: false,
  rateLimit: { limit: 60, windowSec: 60 },
  input: usageInput,
  async handler({ ctx, services, input }): Promise<UsageResponse> {
    const to = parseDate(input.to, new Date())
    const from = parseDate(input.from, new Date(to.getTime() - ((input.days ?? 30) - 1) * DAY))
    if (from > to) throw new AIError('validation', '`from` must be before `to`')
    const scope = { tenant: ctx.tenant, from, to }
    const [modules, mtd, budget, dailyRows] = await Promise.all([
      services.usage.summary(scope, ctx.payload),
      services.usage.monthToDate({ tenant: ctx.tenant }, ctx.payload),
      services.budgets.status({ payload: ctx.payload, tenant: ctx.tenant, module: ctx.module }),
      loose(ctx.payload).find({
        collection: SLUGS.usageDaily,
        where: {
          and: [
            { date: { greater_than_equal: dayKey(from) } },
            { date: { less_than_equal: dayKey(to) } },
            ...(ctx.tenant != null ? [{ tenantKey: { equals: tenantKey(ctx.tenant) } }] : []),
          ],
        },
        pagination: false,
        depth: 0,
        overrideAccess: true,
      }),
    ])
    const byDay = new Map<string, { date: string; calls: number; costMicros: number; errors: number }>()
    for (const r of dailyRows.docs) {
      const date = String(r.date)
      const acc = byDay.get(date) ?? { date, calls: 0, costMicros: 0, errors: 0 }
      acc.calls += Number(r.calls ?? 0)
      acc.costMicros += Number(r.costMicros ?? 0)
      acc.errors += Number(r.errors ?? 0)
      byDay.set(date, acc)
    }
    const totals = modules.reduce(
      (t, m) => ({ calls: t.calls + m.calls, inputTokens: t.inputTokens + m.inputTokens, outputTokens: t.outputTokens + m.outputTokens, costMicros: t.costMicros + m.costMicros }),
      { calls: 0, inputTokens: 0, outputTokens: 0, costMicros: 0 },
    )
    return {
      from: dayKey(from),
      to: dayKey(to),
      unit: 'micro-USD',
      modules,
      daily: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
      totals,
      monthToDateMicros: mtd,
      budget,
    }
  },
}

const testInput = z.object({ params: z.object({ id: z.string().min(1) }) }).passthrough()

/** POST /api/ai/providers/:id/test — 1-token call + tool-call check. `id` is the ai-providers doc id or providerId. */
export const providerTestEndpoint: AIEndpointDefinition<z.infer<typeof testInput>> = {
  path: '/ai/providers/:id/test',
  method: 'post',
  module: 'core',
  access: ['super-admin'],
  surface: 'admin',
  budget: false,
  rateLimit: { limit: 10, windowSec: 60 },
  input: testInput,
  async handler({ ctx, services, input }) {
    const id = input.params.id
    const p = loose(ctx.payload)
    const lookup = async (where: Record<string, unknown>) =>
      (await p.find({ collection: SLUGS.providers, where, limit: 1, depth: 0, overrideAccess: true }).catch(() => ({ docs: [] }))).docs[0]
    const row = (await lookup({ providerId: { equals: id } })) ?? (await lookup({ id: { equals: id } }))
    const providerId = typeof row?.providerId === 'string' ? row.providerId : id
    const result = await services.ai.testProvider(providerId, ctx)
    if (row) {
      await p
        .update({
          collection: SLUGS.providers,
          id: row.id,
          data: { status: result.ok ? (result.tools ? 'ok' : 'degraded') : 'error', lastHealthCheck: new Date().toISOString(), lastError: result.error ?? '' },
          overrideAccess: true,
          context: { aiHealthUpdate: true },
        })
        .catch(() => undefined)
    }
    await services.audit.log({ action: 'provider.test', target: { collection: SLUGS.providers, id: row?.id ?? providerId }, after: result }, ctx)
    return { providerId, ...result }
  },
}

export const coreAEndpoints: AIEndpointDefinition<any>[] = [usageEndpoint, providerTestEndpoint]
