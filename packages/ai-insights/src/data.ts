/**
 * Read-only data access for metrics. Business data goes through concept adapters with the caller's
 * adapter context (tenant-scoped by the adapter); suite collections (ai-usage, ai-search-events…) are read
 * with the Local API, scoped to the tenant explicitly.
 */
import type { Payload, Where } from 'payload'
import type { AICoreOptions, AIContext, Order } from 'payload-ai-core'
import { getSuiteState } from 'payload-ai-core'
import type { ResolvedPeriod } from './period'

type Ctx = Pick<AIContext, 'payload' | 'adapters' | 'adapterCtx' | 'tenant'>

export const tenantFieldOf = (payload: Payload): string | undefined =>
  (getSuiteState(payload.config as any)?.options as AICoreOptions | undefined)?.tenant?.field

export const collectionExists = (payload: Payload, slug: string): boolean =>
  Boolean((payload.collections as Record<string, unknown> | undefined)?.[slug])

const inRange = (iso: string | undefined, p: { from?: Date; to: Date }) => {
  if (!iso) return false
  const t = Date.parse(iso)
  return !Number.isNaN(t) && (!p.from || t >= p.from.getTime()) && t < p.to.getTime()
}

/** Orders created in [from, to), excluding cancelled/refunded statuses. */
export const loadOrders = async (
  ctx: Ctx,
  range: { from?: Date; to: Date },
  excluded: Set<string>,
): Promise<Order[]> => {
  const adapter = ctx.adapters.order
  if (!adapter) return []
  const out: Order[] = []
  for await (const o of adapter.iterate({ from: range.from, to: range.to, batchSize: 500 }, ctx.adapterCtx)) {
    if (!inRange(o.createdAt, range)) continue
    if (excluded.has(String(o.status ?? '').toLowerCase())) continue
    out.push(o)
  }
  return out
}

/** Paginated, read-only Local API scan of a suite collection within a period (tenant-scoped). */
export const loadDocs = async (
  ctx: Ctx,
  collection: string,
  period: ResolvedPeriod,
  opts: { where?: Where; dateField?: string; maxDocs?: number } = {},
): Promise<Record<string, unknown>[]> => {
  const { payload } = ctx
  if (!collectionExists(payload, collection)) return []
  const dateField = opts.dateField ?? 'createdAt'
  const and: Where[] = [
    { [dateField]: { greater_than_equal: period.from.toISOString() } },
    { [dateField]: { less_than: period.to.toISOString() } },
  ]
  const tenantField = tenantFieldOf(payload)
  if (ctx.tenant !== undefined && tenantField) and.push({ [tenantField]: { equals: ctx.tenant } })
  if (opts.where) and.push(opts.where)
  const max = opts.maxDocs ?? 50_000
  const docs: Record<string, unknown>[] = []
  for (let page = 1; docs.length < max; page++) {
    const res = await payload.find({
      collection: collection as any,
      where: { and },
      depth: 0,
      limit: 500,
      page,
      overrideAccess: true,
      pagination: true,
    })
    docs.push(...(res.docs as Record<string, unknown>[]))
    if (!res.hasNextPage) break
  }
  return docs.slice(0, max)
}
