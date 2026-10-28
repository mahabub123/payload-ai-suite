import type { Payload } from 'payload'
import type { AIContext, UsageRecordInput, UsageService } from '../contracts'
import { SLUGS } from '../collections/slugs'
import { dayKey, loose, monthStart, tenantKey } from './db'

export { computeCostMicros, usdToMicros, DEFAULT_CACHED_INPUT_RATIO } from './cost'

export interface UsageServiceDeps {
  /** Tenant relationship field name (options.tenant.field) to also set on rows. */
  tenantField?: string
  now?: () => Date
}

export type UsageListener = (input: UsageRecordInput, scope: { tenant?: string | number }) => void

export interface UsageServiceImpl extends UsageService {
  /** Subscribe to recorded calls (the budget service uses this to keep its spend cache warm). */
  onRecord(listener: UsageListener): () => void
}

type Ctx = Pick<AIContext, 'payload' | 'tenant' | 'requestId' | 'actor'>

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Writes one ai-usage row per model call and keeps ai-usage-daily rollups. */
export const createUsageService = (deps: UsageServiceDeps = {}): UsageServiceImpl => {
  const now = deps.now ?? (() => new Date())
  const listeners = new Set<UsageListener>()

  const tenantData = (tenant: string | number | undefined) => ({
    tenantKey: tenantKey(tenant),
    ...(deps.tenantField && tenant != null ? { [deps.tenantField]: tenant } : {}),
  })

  const bumpDaily = async (payload: Payload, input: UsageRecordInput, tenant: string | number | undefined) => {
    const p = loose(payload)
    const date = dayKey(now())
    const key = [date, tenantKey(tenant), input.module, input.task, input.model].join('|')
    const inc = {
      calls: 1,
      errors: input.outcome === 'error' || input.outcome === 'blocked' ? 1 : 0,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      cachedInputTokens: input.cachedInputTokens ?? 0,
      costMicros: input.costMicros,
    }
    const apply = async () => {
      const found = await p.find({ collection: SLUGS.usageDaily, where: { key: { equals: key } }, limit: 1, depth: 0, overrideAccess: true })
      const row = found.docs[0]
      if (row) {
        const data: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(inc)) data[k] = num(row[k]) + v
        await p.update({ collection: SLUGS.usageDaily, id: row.id, data, overrideAccess: true })
        return
      }
      await p.create({
        collection: SLUGS.usageDaily,
        data: { key, date, module: input.module, task: input.task, model: input.model, ...inc, ...tenantData(tenant) },
        overrideAccess: true,
      })
    }
    try {
      await apply()
    } catch {
      // Unique-key race with a concurrent create: the row exists now, so increment it.
      await apply()
    }
  }

  const dailyRows = async (payload: Payload, where: Record<string, unknown>) =>
    (await loose(payload).find({ collection: SLUGS.usageDaily, where, pagination: false, depth: 0, overrideAccess: true })).docs

  return {
    onRecord(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    async record(input, ctx: Ctx) {
      for (const l of listeners) {
        try {
          l(input, { tenant: ctx.tenant })
        } catch {
          /* listener errors never break accounting */
        }
      }
      const p = loose(ctx.payload)
      try {
        await p.create({
          collection: SLUGS.usage,
          data: {
            module: input.module,
            task: input.task,
            model: input.model,
            inputTokens: input.inputTokens,
            outputTokens: input.outputTokens,
            cachedInputTokens: input.cachedInputTokens ?? 0,
            costMicros: input.costMicros,
            latencyMs: Math.round(input.latencyMs),
            outcome: input.outcome,
            errorCode: input.errorCode,
            promptSlug: input.promptRef?.slug,
            promptVersion: input.promptRef?.version,
            requestId: ctx.requestId,
            actorKind: ctx.actor?.kind,
            ...tenantData(ctx.tenant),
          },
          overrideAccess: true,
        })
        await bumpDaily(ctx.payload, input, ctx.tenant)
      } catch (e) {
        p.logger?.error({ err: e, requestId: ctx.requestId }, '[ai-suite] failed to record usage')
      }
    },

    async monthToDate(scope, payload) {
      const and: Record<string, unknown>[] = [{ date: { greater_than_equal: monthStart(now()) } }]
      if (scope.tenant != null) and.push({ tenantKey: { equals: tenantKey(scope.tenant) } })
      if (scope.module) and.push({ module: { equals: scope.module } })
      const rows = await dailyRows(payload, { and })
      return rows.reduce((s, r) => s + num(r.costMicros), 0)
    },

    async summary(scope, payload) {
      const and: Record<string, unknown>[] = [
        { date: { greater_than_equal: dayKey(scope.from) } },
        { date: { less_than_equal: dayKey(scope.to) } },
      ]
      if (scope.tenant != null) and.push({ tenantKey: { equals: tenantKey(scope.tenant) } })
      const rows = await dailyRows(payload, { and })
      const by = new Map<string, { module: string; calls: number; inputTokens: number; outputTokens: number; costMicros: number }>()
      for (const r of rows) {
        const m = String(r.module ?? 'unknown')
        const acc = by.get(m) ?? { module: m, calls: 0, inputTokens: 0, outputTokens: 0, costMicros: 0 }
        acc.calls += num(r.calls)
        acc.inputTokens += num(r.inputTokens)
        acc.outputTokens += num(r.outputTokens)
        acc.costMicros += num(r.costMicros)
        by.set(m, acc)
      }
      return [...by.values()].sort((a, b) => b.costMicros - a.costMicros)
    },
  }
}
