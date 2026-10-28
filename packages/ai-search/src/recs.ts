import type { TaskConfig } from 'payload'
import type { AIContext, Order, OfferingSummary, RecsResponse } from '@payload-ai-suite/ai-core'
import { getAI } from '@payload-ai-suite/ai-core'
import { MODULE, OFFERINGS_TABLE_NAME, SLUGS, TASKS } from './constants'
import { errMessage, local, sessionHash, tenantData, tenantWhere } from './db'
import { getSearchEngine, type SearchEngine } from './engine'
import { applyBusinessRules } from './ranking'
import { rowToSummary } from './vectorTable'

export type RecsKind = RecsResponse['kind']

export interface RecsInput {
  kind: RecsKind
  offering?: string
  limit?: number
  /** Raw storefront session id (hashed) for for-you. */
  sessionId?: string
}

export interface RecItem {
  id: string
  score: number
}

const SIMILAR_TTL_MS = 24 * 3600_000

/**
 * Bought-together: pairwise co-occurrence counts within orders, top N per offering.
 * Each order counts once per pair, however many units.
 */
export const computeCooccurrence = (
  orders: Iterable<Pick<Order, 'items'>>,
  top = 12,
  maxItemsPerOrder = 50,
): Map<string, RecItem[]> => {
  const counts = new Map<string, Map<string, number>>()
  for (const order of orders) {
    const ids = [...new Set(order.items.map((i) => String(i.offeringId)).filter(Boolean))].slice(0, maxItemsPerOrder)
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue
        const m = counts.get(a) ?? new Map<string, number>()
        m.set(b, (m.get(b) ?? 0) + 1)
        counts.set(a, m)
      }
    }
  }
  const out = new Map<string, RecItem[]>()
  for (const [a, m] of counts) {
    out.set(
      a,
      [...m.entries()]
        .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
        .slice(0, top)
        .map(([id, score]) => ({ id, score })),
    )
  }
  return out
}

const findStored = async (engine: SearchEngine, offeringId: string, kind: 'similar' | 'bought-together', tenant: AIContext['tenant']) => {
  try {
    const r = await local(engine.payload).find({
      collection: SLUGS.recs,
      where: tenantWhere(engine.payload, tenant, { and: [{ offeringId: { equals: offeringId } }, { kind: { equals: kind } }] }),
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    return r.docs[0] as { id: string | number; items?: RecItem[]; computedAt?: string } | undefined
  } catch {
    return undefined
  }
}

export const storeRecs = async (
  engine: SearchEngine,
  offeringId: string,
  kind: 'similar' | 'bought-together',
  items: RecItem[],
  tenant: AIContext['tenant'],
): Promise<void> => {
  const data = { offeringId, kind, items, computedAt: new Date().toISOString(), ...tenantData(engine.payload, tenant) }
  const existing = await findStored(engine, offeringId, kind, tenant)
  const db = local(engine.payload)
  if (existing) await db.update({ collection: SLUGS.recs, id: existing.id, data, overrideAccess: true, depth: 0 })
  else await db.create({ collection: SLUGS.recs, data, overrideAccess: true, depth: 0 })
}

/** Live summaries for stored ids (caller access via adapter), falling back to index rows. Keeps id order. */
const hydrate = async (engine: SearchEngine, ids: string[], ctx: AIContext): Promise<OfferingSummary[]> => {
  if (!ids.length) return []
  const byId = new Map<string, OfferingSummary>()
  const adapter = engine.offeringAdapter(ctx)
  try {
    if (adapter) for (const s of (await adapter.search({ ids, limit: ids.length }, ctx.adapterCtx)).items) byId.set(s.id, s)
  } catch {
    // fall back to index rows
  }
  if (!byId.size) {
    try {
      const rows = await engine.services.vectors.query(OFFERINGS_TABLE_NAME, { k: ids.length, where: { offering_id: ids } }, engine.scope(ctx))
      for (const r of rows) byId.set(String(r.fields.offering_id ?? r.id), rowToSummary(r))
    } catch {
      return []
    }
  }
  const ranked = applyBusinessRules(
    ids.filter((id) => byId.has(id)).map((id, i) => ({ id, score: 1 / (1 + i), summary: byId.get(id)! })),
    engine.options.boosts,
  )
  return ranked.map((c) => c.summary)
}

const rowContents = async (engine: SearchEngine, ids: string[], ctx: AIContext): Promise<Map<string, { text: string; categoryIds: string[] }>> => {
  const out = new Map<string, { text: string; categoryIds: string[] }>()
  if (!ids.length) return out
  try {
    const rows = await engine.services.vectors.query(OFFERINGS_TABLE_NAME, { k: ids.length, where: { offering_id: ids } }, engine.scope(ctx))
    for (const r of rows) out.set(String(r.fields.offering_id ?? r.id), { text: r.content, categoryIds: rowToSummary(r).categoryIds })
  } catch {
    // ignore; caller falls back to the adapter
  }
  return out
}

/** Nearest neighbours of a weighted centroid, excluding `exclude`. */
const neighbours = async (engine: SearchEngine, vectors: { v: number[]; w: number }[], exclude: Set<string>, limit: number, ctx: AIContext) => {
  const dims = vectors.find((x) => x.v.length)?.v.length ?? 0
  if (!dims) return []
  const c = new Array<number>(dims).fill(0)
  for (const { v, w } of vectors) for (let i = 0; i < dims; i++) c[i] += (v[i] ?? 0) * w
  const n = Math.hypot(...c) || 1
  const centroid = c.map((x) => x / n)
  const rows = await engine.services.vectors.query(OFFERINGS_TABLE_NAME, { embedding: centroid, k: limit + exclude.size }, engine.scope(ctx))
  const cands = rows
    .filter((r) => !exclude.has(String(r.fields.offering_id ?? r.id)))
    .map((r) => {
      const summary = rowToSummary(r)
      return { id: summary.id, score: r.score, summary }
    })
  return applyBusinessRules(cands, engine.options.boosts).slice(0, limit)
}

const similar = async (engine: SearchEngine, offeringId: string, limit: number, ctx: AIContext): Promise<OfferingSummary[]> => {
  const stored = await findStored(engine, offeringId, 'similar', ctx.tenant)
  if (stored?.items?.length && stored.computedAt && Date.now() - Date.parse(stored.computedAt) < SIMILAR_TTL_MS) {
    return hydrate(engine, stored.items.slice(0, limit).map((i) => i.id), ctx)
  }
  const contents = await rowContents(engine, [offeringId], ctx)
  let text = contents.get(offeringId)?.text
  let categoryIds = contents.get(offeringId)?.categoryIds ?? []
  const adapter = engine.offeringAdapter(ctx)
  if (!text && adapter) {
    const o = await adapter.get(offeringId, ctx.adapterCtx).catch(() => null)
    if (!o) return []
    text = adapter.toEmbeddingText(o)
    categoryIds = o.categoryIds
  }
  if (!text) return []
  try {
    const [v] = await engine.embedTexts([text], ctx)
    const ranked = await neighbours(engine, [{ v, w: 1 }], new Set([offeringId]), Math.max(limit, 24), ctx)
    await storeRecs(engine, offeringId, 'similar', ranked.map((c) => ({ id: c.id, score: c.score })), ctx.tenant).catch(() => undefined)
    return ranked.slice(0, limit).map((c) => c.summary)
  } catch {
    // Embedding/budget/vector failure: same-category keyword fallback.
    if (!adapter) return []
    const r = await adapter.search({ categoryIds: categoryIds.slice(0, 1), limit: limit + 1, inStock: true }, ctx.adapterCtx).catch(() => ({ items: [] as OfferingSummary[] }))
    return r.items.filter((s) => s.id !== offeringId).slice(0, limit)
  }
}

const forYou = async (engine: SearchEngine, input: RecsInput, limit: number, ctx: AIContext): Promise<OfferingSummary[]> => {
  const weights = new Map<string, number>()
  const add = (id: string, w: number) => weights.set(id, (weights.get(id) ?? 0) + w)

  const session = sessionHash(engine.services, ctx, input.sessionId)
  if (session) {
    try {
      const r = await local(engine.payload).find({
        collection: SLUGS.events,
        where: tenantWhere(engine.payload, ctx.tenant, {
          and: [
            { sessionId: { equals: session } },
            { type: { in: ['click', 'add-to-cart'] } },
            { createdAt: { greater_than: new Date(Date.now() - 30 * 86400_000).toISOString() } },
          ],
        }),
        sort: '-createdAt',
        limit: 30,
        depth: 0,
        overrideAccess: true,
      })
      for (const e of r.docs) if (e.offeringId) add(String(e.offeringId), e.type === 'add-to-cart' ? 2 : 1)
    } catch {
      // no view history
    }
  }

  const orders = ctx.adapters?.order ?? engine.services.adapters.order
  if (ctx.actor.customerId && orders) {
    try {
      const list = await orders.listForCustomer(ctx.adapterCtx, { limit: 5 })
      const full = await Promise.all(list.map((o) => orders.getForCustomer(o.id, ctx.adapterCtx).catch(() => null)))
      for (const o of full) for (const it of o?.items ?? []) add(String(it.offeringId), 3)
    } catch {
      // no purchase history
    }
  }

  if (!weights.size) return []
  const ids = [...weights.keys()].slice(0, 30)
  const contents = await rowContents(engine, ids, ctx)
  const known = ids.filter((id) => contents.has(id))
  if (!known.length) return []
  try {
    const vecs = await engine.embedTexts(known.map((id) => contents.get(id)!.text), ctx)
    const ranked = await neighbours(engine, vecs.map((v, i) => ({ v, w: weights.get(known[i]) ?? 1 })), new Set(ids), limit, ctx)
    return ranked.map((c) => c.summary)
  } catch {
    return []
  }
}

/** Recommendations for GET /api/ai/recs and the recommendOfferings tool. Never throws for AI failures. */
export const getRecommendations = async (engine: SearchEngine, input: RecsInput, ctx: AIContext): Promise<RecsResponse> => {
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 24)
  let items: OfferingSummary[] = []
  if (input.kind === 'for-you') items = await forYou(engine, input, limit, ctx)
  else if (input.offering) {
    if (input.kind === 'similar') items = await similar(engine, input.offering, limit, ctx)
    else {
      const stored = await findStored(engine, input.offering, 'bought-together', ctx.tenant)
      items = await hydrate(engine, (stored?.items ?? []).slice(0, limit).map((i) => i.id), ctx)
    }
  }
  return { kind: input.kind, items, requestId: ctx.requestId }
}

/** Edge-cacheable per offering for similar / bought-together; private for for-you. */
export const recsCacheControl = (kind: RecsKind): string =>
  kind === 'for-you' ? 'private, max-age=60' : 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'

export const cooccurrenceTask = (opts: { days: number; top: number }): TaskConfig<{ input: { tenant?: string }; output: { offerings: number; orders: number } }> => ({
  slug: TASKS.cooccurrence,
  label: 'AI Search: bought-together recommendations',
  retries: 2,
  inputSchema: [{ name: 'tenant', type: 'text' }],
  outputSchema: [
    { name: 'offerings', type: 'number' },
    { name: 'orders', type: 'number' },
  ],
  handler: async ({ input, req }) => {
    const services = getAI(req.payload)
    const engine = getSearchEngine(req.payload)
    const ctx = services.systemContext(req.payload, { module: MODULE, tenant: input?.tenant || undefined })
    const adapter = services.adapters.order
    if (!adapter) return { output: { offerings: 0, orders: 0 } }
    const orders: Pick<Order, 'items'>[] = []
    for await (const o of adapter.iterate({ from: new Date(Date.now() - opts.days * 86400_000), batchSize: 200 }, ctx.adapterCtx)) {
      if (o.items?.length > 1) orders.push({ items: o.items.map((i) => ({ ...i, title: '' })) })
    }
    const recs = computeCooccurrence(orders, opts.top)
    for (const [offeringId, items] of recs) {
      try {
        await storeRecs(engine, offeringId, 'bought-together', items, ctx.tenant)
      } catch (e) {
        req.payload.logger.warn(`[ai-search] could not store recs for ${offeringId}: ${errMessage(e)}`)
      }
    }
    return { output: { offerings: recs.size, orders: orders.length } }
  },
})
