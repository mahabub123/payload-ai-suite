/**
 * Knowledge index over `ai_knowledge` (design doc §7.4): chunk -> hash -> embed only changed chunks,
 * visibility-filtered hybrid retrieval with citations, embedding-model swap, config-time indexing hooks.
 */
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, Config, Payload, TaskConfig } from 'payload'
import type {
  AICoreOptions,
  AIContext,
  Citation,
  CoreServices,
  KnowledgeDoc,
  KnowledgeHit,
  KnowledgeService,
  VectorRow,
  VectorTableSpec,
  Visibility,
} from '../contracts'
import { getAI } from '../module/runtime'
import type { PgStore } from '../vectors'
import { chunkText, hashContent } from './chunker'

export { chunkText, hashContent } from './chunker'

export const KNOWLEDGE_TABLE = 'ai_knowledge'
export const INDEX_KNOWLEDGE_TASK = 'ai-core-index-knowledge'
export const KNOWLEDGE_DRIFT_TASK = 'ai-core-knowledge-drift'

export const knowledgeTableSpec: VectorTableSpec = {
  name: KNOWLEDGE_TABLE,
  columns: {
    source_collection: 'text',
    source_id: 'text',
    chunk_index: 'integer',
    title: 'text',
    url: 'text',
    hash: 'text',
    visibility: 'text',
  },
}

const EMBED_BATCH = 100
const MAX_ROWS_PER_SOURCE = 10_000

const visibilityFor = (ctx: AIContext): Visibility[] => {
  const k = ctx.actor.kind
  if (k === 'staff' || k === 'system') return ['public', 'customers', 'staff']
  if (k === 'customer' || (k === 'channel' && ctx.actor.customerId)) return ['public', 'customers']
  return ['public']
}

/** Locale is part of the id: each locale of a document is indexed separately and must not overwrite the others. */
const chunkId = (collection: string, sourceId: string, i: number, locale?: string) =>
  locale ? `${collection}:${sourceId}:${locale}:${i}` : `${collection}:${sourceId}:${i}`

/** Locales to index: every configured Payload locale, or one pass with the context locale when unlocalized. */
export const indexLocales = (payload: Payload): (string | undefined)[] => {
  const l = (payload?.config as { localization?: false | { localeCodes?: string[] } } | undefined)?.localization
  return l && l.localeCodes?.length ? l.localeCodes : [undefined]
}

export const createKnowledgeService = (svc: () => CoreServices): KnowledgeService => {
  const ensured = new Map<number, Promise<void>>()
  const ext = () => svc().vectors as Partial<PgStore>
  const isKeywordOnly = () => ext().mode?.() === 'keyword'

  const ensure = (dims: number) => {
    if (!ensured.has(dims)) {
      const p = svc().vectors.ensureTable(knowledgeTableSpec, dims)
      ensured.set(dims, p)
      p.catch(() => ensured.delete(dims))
    }
    return ensured.get(dims)!
  }

  const embedAll = async (texts: string[], ctx: AIContext): Promise<number[][]> => {
    if (isKeywordOnly()) return texts.map(() => [])
    const out: number[][] = []
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const r = await svc().ai.embed(texts.slice(i, i + EMBED_BATCH), ctx)
      out.push(...r.embeddings)
    }
    return out
  }

  /** Stored chunks of one source; with a locale, only that locale's (so re-indexing English keeps Bangla). */
  const existingFor = async (collection: string, sourceId: string, ctx: AIContext, model: string, locale?: string) => {
    const rows = await svc().vectors.query(
      KNOWLEDGE_TABLE,
      { k: MAX_ROWS_PER_SOURCE, where: { source_collection: collection, source_id: sourceId } },
      { tenant: ctx.tenant, model, locale },
    )
    return new Map(rows.map((r) => [r.id, String(r.fields.hash ?? '')]))
  }

  const indexKnowledgeDoc = async (kd: KnowledgeDoc, ctx: AIContext): Promise<{ chunks: number; embedded: number; ids: string[] }> => {
    const emb = svc().ai.activeEmbedding(ctx)
    await ensure(emb.dims)
    const chunks = chunkText(kd.text)
    const ids = chunks.map((_, i) => chunkId(kd.sourceCollection, kd.sourceId, i, kd.locale))
    const existing = await existingFor(kd.sourceCollection, kd.sourceId, ctx, emb.ref, kd.locale)
    const hashes = chunks.map((c) => hashContent([kd.title, kd.url ?? '', kd.visibility, kd.locale ?? '', c].join('\u0000')))
    const changed = chunks.map((_, i) => i).filter((i) => existing.get(ids[i]) !== hashes[i])

    if (changed.length) {
      const vectors = await embedAll(
        changed.map((i) => `${kd.title}\n\n${chunks[i]}`),
        ctx,
      )
      const rows: VectorRow[] = changed.map((i, j) => ({
        id: ids[i],
        content: chunks[i],
        embedding: vectors[j] ?? [],
        fields: {
          source_collection: kd.sourceCollection,
          source_id: kd.sourceId,
          chunk_index: i,
          title: kd.title,
          url: kd.url ?? null,
          hash: hashes[i],
          visibility: kd.visibility,
        },
      }))
      await svc().vectors.upsert(KNOWLEDGE_TABLE, rows, { tenant: ctx.tenant, locale: kd.locale, model: emb.ref })
    }
    const keep = new Set(ids)
    const stale = [...existing.keys()].filter((id) => !keep.has(id))
    if (stale.length) await svc().vectors.delete(KNOWLEDGE_TABLE, stale, ctx.tenant)
    return { chunks: chunks.length, embedded: changed.length, ids }
  }

  const removeDoc: KnowledgeService['removeDoc'] = async (collection, id, ctx) => {
    const emb = svc().ai.activeEmbedding(ctx)
    await ensure(emb.dims)
    const existing = await existingFor(collection, String(id), ctx, emb.ref)
    if (existing.size) await svc().vectors.delete(KNOWLEDGE_TABLE, [...existing.keys()], ctx.tenant)
  }

  const service: KnowledgeService = {
    async search(query, ctx, opts = {}) {
      const k = opts.k ?? 5
      const emb = svc().ai.activeEmbedding(ctx)
      await ensure(emb.dims)
      let embedding: number[] | undefined
      if (!isKeywordOnly()) {
        try {
          embedding = (await svc().ai.embed([query], ctx)).embeddings[0]
        } catch (err) {
          ctx.payload.logger?.warn?.(`[ai-suite] knowledge: query embedding failed, keyword only (${(err as Error).message})`)
        }
      }
      const allowed = visibilityFor(ctx)
      const visibility = opts.visibility ? opts.visibility.filter((v) => allowed.includes(v)) : allowed
      if (!visibility.length) return { hits: [], citations: [] }
      const where: Record<string, unknown> = { visibility }
      if (opts.collections?.length) where.source_collection = opts.collections
      const rows = await svc().vectors.query(
        KNOWLEDGE_TABLE,
        { embedding, text: query, k, where },
        { tenant: ctx.tenant, locale: ctx.locale, model: emb.ref },
      )
      const hits: KnowledgeHit[] = rows.map((r) => ({
        id: r.id,
        sourceCollection: String(r.fields.source_collection ?? ''),
        sourceId: String(r.fields.source_id ?? ''),
        title: String(r.fields.title ?? ''),
        content: r.content,
        url: (r.fields.url as string | null) ?? undefined,
        score: r.score,
      }))
      const seen = new Set<string>()
      const citations: Citation[] = []
      for (const h of hits) {
        const key = `${h.sourceCollection}:${h.sourceId}`
        if (seen.has(key)) continue
        seen.add(key)
        citations.push({ title: h.title, url: h.url, sourceCollection: h.sourceCollection, sourceId: h.sourceId })
      }
      return { hits, citations }
    },

    async indexDoc(collection, doc, ctx) {
      const adapter = svc().adapters.knowledge
      if (!adapter) return { chunks: 0, embedded: 0 }
      const kd = adapter.toKnowledgeDoc(collection, doc, { ...ctx.adapterCtx, system: true })
      if (!kd) {
        if (doc.id != null) await removeDoc(collection, String(doc.id), ctx)
        return { chunks: 0, embedded: 0 }
      }
      const { chunks, embedded } = await indexKnowledgeDoc(kd, ctx)
      return { chunks, embedded }
    },

    removeDoc,

    async reindexAll(ctx, opts = {}) {
      const adapter = svc().adapters.knowledge
      if (!adapter) return { docs: 0, chunks: 0 }
      const emb = svc().ai.activeEmbedding(ctx)
      await ensure(emb.dims)
      const store = ext()
      const storedModels = store.models ? await store.models(KNOWLEDGE_TABLE, ctx.tenant) : []
      const modelSwitch = storedModels.some((m) => m !== emb.ref)
      // A model switch needs every doc under the new model before swapping.
      const full = !opts.since || modelSwitch
      let docs = 0
      let chunks = 0
      const seen = new Set<string>()
      for (const locale of indexLocales(ctx.payload)) {
        const lctx = locale ? { ...ctx, locale, adapterCtx: { ...ctx.adapterCtx, locale } } : ctx
        for await (const kd of adapter.iterate({ since: full ? undefined : opts.since, batchSize: 50 }, { ...lctx.adapterCtx, system: true })) {
          const r = await indexKnowledgeDoc(kd, lctx)
          docs++
          chunks += r.chunks
          for (const id of r.ids) seen.add(id)
        }
      }
      if (full) {
        // Drift repair: drop chunks whose source no longer exists (or is now a draft).
        const rows = await svc().vectors.query(KNOWLEDGE_TABLE, { k: 1_000_000 }, { tenant: ctx.tenant, model: emb.ref })
        const orphans = rows.map((r) => r.id).filter((id) => !seen.has(id))
        if (orphans.length) await svc().vectors.delete(KNOWLEDGE_TABLE, orphans, ctx.tenant)
        if (modelSwitch && store.purgeOtherModels) await store.purgeOtherModels(KNOWLEDGE_TABLE, emb.ref, ctx.tenant)
      }
      return { docs, chunks }
    },
  }
  return service
}

/* ---------- Config-time hooks and jobs ---------- */

const tenantOf = (doc: Record<string, unknown>, options: AICoreOptions): string | undefined => {
  const f = options.tenant?.field
  if (!f) return undefined
  const v = doc[f]
  if (v == null) return undefined
  return String(typeof v === 'object' && 'id' in (v as object) ? (v as { id: unknown }).id : v)
}

/** Attach afterChange/afterDelete hooks to mapped knowledge collections (existing hooks preserved). */
export const attachKnowledgeHooks = (config: Config, options: AICoreOptions): Config => {
  let slugs: string[] = []
  try {
    slugs = options.adapters?.mappedCollections().knowledge ?? []
  } catch {
    slugs = []
  }
  if (!slugs.length || !config.collections?.length) return config

  const queue = async (req: Parameters<CollectionAfterChangeHook>[0]['req'], input: Record<string, unknown>) => {
    try {
      await (req.payload.jobs.queue as (a: { task: string; input: unknown }) => Promise<unknown>)({ task: INDEX_KNOWLEDGE_TASK, input })
    } catch (err) {
      req.payload.logger?.error?.(`[ai-suite] could not queue knowledge indexing: ${(err as Error).message}`)
    }
  }

  return {
    ...config,
    collections: config.collections.map((c) => {
      if (!slugs.includes(c.slug)) return c
      const afterChange: CollectionAfterChangeHook = async ({ doc, req, context }) => {
        if ((context as Record<string, unknown> | undefined)?.aiSkipIndex) return doc
        if ((doc as Record<string, unknown>)._status === 'draft') return doc
        await queue(req, { collection: c.slug, id: String(doc.id), op: 'upsert', tenant: tenantOf(doc, options) })
        return doc
      }
      const afterDelete: CollectionAfterDeleteHook = async ({ doc, id, req }) => {
        await queue(req, { collection: c.slug, id: String(id), op: 'delete', tenant: tenantOf(doc ?? {}, options) })
        return doc
      }
      return {
        ...c,
        hooks: {
          ...c.hooks,
          afterChange: [...(c.hooks?.afterChange ?? []), afterChange],
          afterDelete: [...(c.hooks?.afterDelete ?? []), afterDelete],
        },
      }
    }),
  }
}

type IndexInput = { collection: string; id: string; op?: 'upsert' | 'delete'; tenant?: string | null }

export const knowledgeTasks: TaskConfig<any>[] = [
  {
    slug: INDEX_KNOWLEDGE_TASK,
    label: 'AI: index knowledge document',
    retries: { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } },
    inputSchema: [
      { name: 'collection', type: 'text', required: true },
      { name: 'id', type: 'text', required: true },
      { name: 'op', type: 'select', options: ['upsert', 'delete'], defaultValue: 'upsert' },
      { name: 'tenant', type: 'text' },
    ],
    outputSchema: [
      { name: 'chunks', type: 'number' },
      { name: 'embedded', type: 'number' },
    ],
    handler: async ({ input, req }: { input: IndexInput; req: { payload: import('payload').Payload } }) => {
      const services = getAI(req.payload)
      const ctx = services.systemContext(req.payload, { module: 'core', tenant: input.tenant ?? undefined })
      if (input.op === 'delete') {
        await services.knowledge.removeDoc(input.collection, input.id, ctx)
        return { output: { chunks: 0, embedded: 0 } }
      }
      const out = { chunks: 0, embedded: 0 }
      // One pass per locale; untranslated fields fall back to the default locale, so every locale can answer.
      for (const locale of indexLocales(req.payload)) {
        let doc: Record<string, unknown> | null = null
        try {
          doc = (await req.payload.findByID({
            collection: input.collection as never,
            id: input.id,
            overrideAccess: true,
            depth: 1,
            ...(locale ? { locale } : {}),
          } as never)) as unknown as Record<string, unknown>
        } catch (err) {
          if ((err as { status?: number }).status !== 404) throw err
        }
        if (!doc) {
          await services.knowledge.removeDoc(input.collection, input.id, ctx)
          return { output: { chunks: 0, embedded: 0 } }
        }
        const lctx = locale ? { ...ctx, locale, adapterCtx: { ...ctx.adapterCtx, locale } } : ctx
        const r = await services.knowledge.indexDoc(input.collection, doc, lctx)
        out.chunks += r.chunks
        out.embedded += r.embedded
      }
      return { output: out }
    },
  },
  {
    slug: KNOWLEDGE_DRIFT_TASK,
    label: 'AI: knowledge index drift repair',
    retries: { attempts: 2, backoff: { type: 'fixed', delay: 60_000 } },
    inputSchema: [{ name: 'tenant', type: 'text' }],
    outputSchema: [
      { name: 'docs', type: 'number' },
      { name: 'chunks', type: 'number' },
    ],
    schedule: [{ cron: '0 0 3 * * *', queue: 'ai-nightly' }],
    handler: async ({ input, req }: { input?: { tenant?: string | null }; req: { payload: import('payload').Payload } }) => {
      const services = getAI(req.payload)
      const ctx = services.systemContext(req.payload, { module: 'core', tenant: input?.tenant ?? undefined })
      const r = await services.knowledge.reindexAll(ctx)
      return { output: r }
    },
  },
]
