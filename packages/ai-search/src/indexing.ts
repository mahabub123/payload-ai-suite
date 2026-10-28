import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionConfig, Config, Payload, TaskConfig } from 'payload'
import type { AIContext, AICoreOptions, CoreServices, Offering, OfferingAdapter, VectorRow } from 'payload-ai-core'
import { getAI, getSuiteState, indexLocales } from 'payload-ai-core'
import { MODULE, OFFERINGS_TABLE_NAME, TASKS } from './constants'
import { errMessage } from './db'
import { offeringToFields } from './vectorTable'
import { sha1 } from './util'

export const INDEX_BATCH = 100

/** Hash of everything stored for an offering; unchanged hash -> no re-embed. */
export const offeringHash = (text: string, fields: Record<string, unknown>, model: string): string =>
  sha1(JSON.stringify([model, text, fields]))

/**
 * Row id per locale: each locale of an offering is its own row (titles and text differ), keyed
 * `<id>:<locale>`; unlocalized sites keep the bare id. `offering_id` always holds the bare id.
 */
export const offeringRowId = (id: string, locale?: string): string => (locale ? `${id}:${locale}` : id)

/** Every row id an offering may have, for deletes. */
export const offeringRowIds = (payload: Payload, id: string): string[] => [id, ...indexLocales(payload).filter(Boolean).map((l) => offeringRowId(id, l))]

/** Context for indexing one locale (adapter reads localized fields in that locale). */
const inLocale = (ctx: AIContext, locale?: string): AIContext => (locale ? { ...ctx, locale, adapterCtx: { ...ctx.adapterCtx, locale } } : ctx)

/** Existing content hashes for ids (empty map if the store can't answer a where-only query). */
const existingHashes = async (services: CoreServices, ids: string[], ctx: AIContext, model: string, locale?: string): Promise<Map<string, string>> => {
  try {
    const rows = await services.vectors.query(OFFERINGS_TABLE_NAME, { k: ids.length, where: { offering_id: ids } }, { tenant: ctx.tenant, model, locale })
    return new Map(rows.map((r) => [String(r.fields.offering_id ?? r.id), String(r.fields.content_hash ?? '')]))
  } catch {
    return new Map()
  }
}

/**
 * Embed + upsert offerings into ai_offerings. Drafts are removed instead. Unchanged offerings
 * (same content hash) are skipped unless `force`.
 */
export const indexOfferings = async (
  services: CoreServices,
  adapter: OfferingAdapter,
  offerings: Offering[],
  ctx: AIContext,
  opts: { force?: boolean; locale?: string } = {},
): Promise<{ embedded: number; skipped: number; removed: number }> => {
  const drafts = offerings.filter((o) => o.status === 'draft')
  const live = offerings.filter((o) => o.status !== 'draft')
  if (drafts.length) await services.vectors.delete(OFFERINGS_TABLE_NAME, drafts.flatMap((o) => offeringRowIds(ctx.payload, o.id)), ctx.tenant)
  if (!live.length) return { embedded: 0, skipped: 0, removed: drafts.length }
  const locale = opts.locale

  const model = services.ai.activeEmbedding(ctx).ref
  const prepared = live.map((o) => {
    const text = adapter.toEmbeddingText(o)
    const base = offeringToFields(o, '')
    const hash = offeringHash(text, { ...base, content_hash: undefined }, model)
    return { o, text, fields: { ...base, content_hash: hash } }
  })
  const existing = opts.force ? new Map<string, string>() : await existingHashes(services, live.map((o) => o.id), ctx, model, locale)
  const changed = prepared.filter((p) => existing.get(p.o.id) !== p.fields.content_hash)
  let embedded = 0
  for (let i = 0; i < changed.length; i += INDEX_BATCH) {
    const batch = changed.slice(i, i + INDEX_BATCH)
    const r = await services.ai.embed(batch.map((b) => b.text), ctx)
    const rows: VectorRow[] = batch.map((b, j) => ({ id: offeringRowId(b.o.id, locale), content: b.text, embedding: r.embeddings[j], fields: b.fields }))
    // A localized row replaces any unlocalized one left from before locales were indexed separately.
    if (locale) await services.vectors.delete(OFFERINGS_TABLE_NAME, batch.map((b) => b.o.id), ctx.tenant)
    await services.vectors.upsert(OFFERINGS_TABLE_NAME, rows, { tenant: ctx.tenant, model, locale })
    embedded += rows.length
  }
  return { embedded, skipped: prepared.length - changed.length, removed: drafts.length }
}

/** Full (or incremental with `since`) reindex in batches of 100. */
export const reindexAll = async (
  services: CoreServices,
  ctx: AIContext,
  opts: { since?: Date; force?: boolean } = {},
): Promise<{ seen: number; embedded: number; skipped: number; removed: number }> => {
  const adapter = services.adapters.offering
  const out = { seen: 0, embedded: 0, skipped: 0, removed: 0 }
  if (!adapter) return out
  let batch: Offering[] = []
  for (const locale of indexLocales(ctx.payload)) {
    const lctx = inLocale(ctx, locale)
    const flushLocale = async () => {
      if (!batch.length) return
      const r = await indexOfferings(services, adapter, batch, lctx, { ...opts, locale })
      out.embedded += r.embedded
      out.skipped += r.skipped
      out.removed += r.removed
      batch = []
    }
    for await (const o of adapter.iterate({ since: opts.since, batchSize: INDEX_BATCH }, lctx.adapterCtx)) {
      if (locale === indexLocales(ctx.payload)[0]) out.seen++
      batch.push(o)
      if (batch.length >= INDEX_BATCH) await flushLocale()
    }
    await flushLocale()
  }
  return out
}

interface IndexJobInput {
  id: string
  op: 'upsert' | 'delete'
  tenant?: string | number
}

export const indexOfferingTask: TaskConfig<{ input: IndexJobInput; output: { result: string } }> = {
  slug: TASKS.index,
  label: 'AI Search: index offering',
  retries: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
  // No inputSchema: tenant ids may be numbers or strings; input is stored as JSON.
  outputSchema: [{ name: 'result', type: 'text' }],
  handler: async ({ input, req }) => {
    const services = getAI(req.payload)
    const ctx = services.systemContext(req.payload, { module: MODULE, tenant: input.tenant || undefined })
    const adapter = services.adapters.offering
    if (!adapter) return { output: { result: 'no-offering-adapter' } }
    const allRows = offeringRowIds(req.payload, String(input.id))
    if (input.op === 'delete') {
      await services.vectors.delete(OFFERINGS_TABLE_NAME, allRows, ctx.tenant)
      return { output: { result: 'deleted' } }
    }
    let embedded = 0
    for (const locale of indexLocales(req.payload)) {
      const lctx = inLocale(ctx, locale)
      const offering = await adapter.get(String(input.id), lctx.adapterCtx)
      if (!offering || offering.status === 'draft') {
        await services.vectors.delete(OFFERINGS_TABLE_NAME, allRows, ctx.tenant)
        return { output: { result: 'removed' } }
      }
      embedded += (await indexOfferings(services, adapter, [offering], lctx, { locale })).embedded
    }
    return { output: { result: embedded ? 'embedded' : 'unchanged' } }
  },
}

export const reindexTask: TaskConfig<{ input: { since?: string; force?: boolean; tenant?: string }; output: { seen: number; embedded: number } }> = {
  slug: TASKS.reindex,
  label: 'AI Search: reindex offerings (drift repair)',
  retries: 2,
  inputSchema: [
    { name: 'since', type: 'date' },
    { name: 'force', type: 'checkbox' },
    { name: 'tenant', type: 'text' },
  ],
  outputSchema: [
    { name: 'seen', type: 'number' },
    { name: 'embedded', type: 'number' },
  ],
  handler: async ({ input, req }) => {
    const services = getAI(req.payload)
    const ctx = services.systemContext(req.payload, { module: MODULE, tenant: input?.tenant || undefined })
    const r = await reindexAll(services, ctx, { since: input?.since ? new Date(input.since) : undefined, force: Boolean(input?.force) })
    req.payload.logger.info(`[ai-search] reindex: ${JSON.stringify(r)}`)
    return { output: { seen: r.seen, embedded: r.embedded } }
  },
}

const tenantOf = (doc: Record<string, unknown>, field: string | undefined): string | number | undefined => {
  if (!field) return undefined
  const t = doc[field]
  if (t && typeof t === 'object' && 'id' in t) return (t as { id: string | number }).id
  return (t as string | number | undefined) ?? undefined
}

const queueIndex = async (payload: Payload, input: IndexJobInput, req: unknown) => {
  try {
    await (payload.jobs.queue as unknown as (a: Record<string, unknown>) => Promise<unknown>)({ task: TASKS.index, input, req })
  } catch (e) {
    payload.logger.error(`[ai-search] could not queue ${TASKS.index}: ${errMessage(e)}`)
  }
}

const isDraft = (doc: Record<string, unknown>, collection: string, payload: Payload): boolean => {
  if (doc._status === 'draft') return true
  try {
    const services = getAI(payload)
    const adapter = services.adapters.offering
    if (adapter && adapter.collection === collection) {
      return adapter.fromDoc(doc, services.systemContext(payload, { module: MODULE }).adapterCtx).status === 'draft'
    }
  } catch {
    // core not initialised yet (seeding): fall through
  }
  return false
}

const afterChange =
  (tenantField: string | undefined): CollectionAfterChangeHook =>
  async ({ doc, previousDoc, req, collection, context }) => {
    if (context?.aiSearchSkipIndex) return doc
    const draft = isDraft(doc, collection.slug, req.payload)
    const wasPublished = previousDoc && previousDoc._status !== 'draft' && previousDoc.id != null
    // Draft saves of a never-published doc are not indexed; unpublishing removes it from the index.
    if (draft && !wasPublished) return doc
    await queueIndex(req.payload, { id: String(doc.id), op: 'upsert', tenant: tenantOf(doc, tenantField) }, req)
    return doc
  }

const afterDelete =
  (tenantField: string | undefined): CollectionAfterDeleteHook =>
  async ({ id, doc, req }) => {
    await queueIndex(req.payload, { id: String(id), op: 'delete', tenant: tenantOf(doc ?? {}, tenantField) }, req)
    return doc
  }

/** Attach indexing hooks to every mapped offering collection, preserving existing hooks. */
export const withIndexingHooks = (config: Config): Config => {
  const state = getSuiteState(config)
  const core = state?.options as AICoreOptions | undefined
  const slugs = new Set(core?.adapters?.mappedCollections().offering ?? [])
  if (!slugs.size) return config
  const tenantField = core?.tenant?.field
  return {
    ...config,
    collections: (config.collections ?? []).map((c): CollectionConfig =>
      slugs.has(c.slug)
        ? {
            ...c,
            hooks: {
              ...c.hooks,
              afterChange: [...(c.hooks?.afterChange ?? []), afterChange(tenantField)],
              afterDelete: [...(c.hooks?.afterDelete ?? []), afterDelete(tenantField)],
            },
          }
        : c,
    ),
  }
}
