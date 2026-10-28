import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
import type {
  AIContext,
  CoreServices,
  Facets,
  OfferingAdapter,
  SearchEventBody,
  SearchResponse,
} from '@payload-ai-suite/ai-core'
import { getAI, getSuiteState } from '@payload-ai-suite/ai-core'
import { MODULE, OFFERINGS_TABLE_NAME, PROMPTS, SLUGS } from './constants'
import { local, sessionHash, tenantData, tenantWhere } from './db'
import {
  explicitFiltersSchema,
  mergeFilters,
  matchesPostFilters,
  parsedQuerySchema,
  parsePricePhrase,
  toMinor,
  toVectorWhere,
  validateExplicitFilters,
  validateParsedFilters,
  type ExplicitFilters,
  type RawParsedQuery,
  type SearchFilters,
} from './filters'
import { LRU, normalizeQuery } from './lru'
import { resolveOptions, type AiSearchOptions, type ResolvedSearchOptions } from './options'
import { parseFiltersPrompt, renderInline } from './prompts'
import {
  applyBusinessRules,
  buildSynonymMap,
  decodeCursor,
  expandWithSynonyms,
  facetCounts,
  paginate,
  reciprocalRankFusion,
  type Candidate,
  type SynonymMap,
} from './ranking'
import { rowToSummary } from './vectorTable'
import { clamp, errorCode, sha1, withTimeout } from './util'

export interface SearchInput {
  q?: string
  /** Explicit filters (object or the JSON string from `filters=`). Prices in minor units unless priceUnit 'major'. */
  filters?: ExplicitFilters | string
  cursor?: string
  limit?: number
  /** Raw storefront session id; hashed before storage. */
  sessionId?: string
  priceUnit?: 'minor' | 'major'
  source?: 'storefront' | 'assistant' | 'api'
  /** Write an ai-search-events row (default true; only for the first page). */
  log?: boolean
}

export type SearchResult = SearchResponse & {
  searchId: string
  /** Why the search ran in keyword mode, when it did. */
  fallbackReason?: string
}

type VectorHit = { id: string; score: number; content: string; fields: Record<string, unknown> }

const engines = new WeakMap<Payload, SearchEngine>()

type SearchModuleDef = { slug: string; searchOptions?: ResolvedSearchOptions }

const optionsFromConfig = (payload: Payload): ResolvedSearchOptions => {
  const def = getSuiteState(payload.config ?? {})?.modules.find((m) => m.slug === MODULE) as SearchModuleDef | undefined
  return def?.searchOptions ?? resolveOptions()
}

/** The search engine (caches + pipeline) for a Payload instance. */
export const getSearchEngine = (payload: Payload, services?: CoreServices): SearchEngine => {
  let e = engines.get(payload)
  if (!e) {
    e = new SearchEngine(payload, services ?? getAI(payload), optionsFromConfig(payload))
    engines.set(payload, e)
  }
  return e
}

/** Create (and register) an engine explicitly, e.g. in tests with fake services. */
export const createSearchEngine = (payload: Payload, services: CoreServices, options?: AiSearchOptions): SearchEngine => {
  const e = new SearchEngine(payload, services, resolveOptions(options))
  engines.set(payload, e)
  return e
}

export class SearchEngine {
  readonly embeddings: LRU<string, number[]>
  private facetsCache = new Map<string, { at: number; value: Promise<Facets | null> }>()
  private synonymCache = new Map<string, { at: number; value: Promise<SynonymMap> }>()

  constructor(
    readonly payload: Payload,
    readonly services: CoreServices,
    readonly options: ResolvedSearchOptions,
  ) {
    this.embeddings = new LRU(options.embeddingCacheSize)
  }

  offeringAdapter(ctx?: Pick<AIContext, 'adapters'>): OfferingAdapter | undefined {
    return ctx?.adapters?.offering ?? this.services.adapters.offering
  }

  embeddingModel(ctx: Pick<AIContext, 'module' | 'tenant' | 'locale'>): string | undefined {
    try {
      return this.services.ai.activeEmbedding(ctx).ref
    } catch {
      return undefined
    }
  }

  /** Vector scope: tenant, embedding model and the caller's locale (one row per offering per locale). */
  scope(ctx: Pick<AIContext, 'module' | 'tenant' | 'locale'>) {
    return { tenant: ctx.tenant, model: this.embeddingModel(ctx), locale: ctx.locale }
  }

  /** Real catalog values (system view, so the cache is shared by all callers of a tenant). */
  facets(ctx: AIContext): Promise<Facets | null> {
    const adapter = this.offeringAdapter(ctx)
    if (!adapter) return Promise.resolve(null)
    const key = `${ctx.tenant ?? ''}|${ctx.locale ?? ''}`
    const hit = this.facetsCache.get(key)
    if (hit && Date.now() - hit.at < this.options.facetsTtlMs) return hit.value
    const sys = this.services.systemContext(this.payload, { module: MODULE, tenant: ctx.tenant, locale: ctx.locale })
    const value = Promise.resolve()
      .then(() => adapter.facets(sys.adapterCtx))
      .catch((e: unknown) => {
        this.facetsCache.delete(key)
        this.payload.logger?.warn?.(`[ai-search] facets unavailable: ${(e as Error)?.message}`)
        return null
      })
    this.facetsCache.set(key, { at: Date.now(), value })
    return value
  }

  currency(facets: Facets | null): string {
    return facets?.priceRange?.currency ?? this.options.currency
  }

  /** Query embedding through the LRU (normalised query -> vector). */
  async embedQuery(text: string, ctx: AIContext): Promise<number[]> {
    const key = `q|${this.embeddingModel(ctx) ?? ''}|${ctx.tenant ?? ''}|${normalizeQuery(text)}`
    const hit = this.embeddings.get(key)
    if (hit) return hit
    const r = await this.services.ai.embed([text], ctx)
    const v = r.embeddings[0]
    if (!v?.length) throw new Error('empty embedding')
    this.embeddings.set(key, v)
    return v
  }

  /** Embed document texts (batched, cached by content hash). */
  async embedTexts(texts: string[], ctx: AIContext): Promise<number[][]> {
    const model = this.embeddingModel(ctx) ?? ''
    const keys = texts.map((t) => `d|${model}|${ctx.tenant ?? ''}|${sha1(t)}`)
    const out: (number[] | undefined)[] = keys.map((k) => this.embeddings.get(k))
    const missing = out.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0)
    if (missing.length) {
      const r = await this.services.ai.embed(missing.map((i) => texts[i]), ctx)
      missing.forEach((i, j) => {
        out[i] = r.embeddings[j]
        if (r.embeddings[j]) this.embeddings.set(keys[i], r.embeddings[j])
      })
    }
    return out.map((v) => v ?? [])
  }

  cacheStats() {
    const { hits, misses, size } = this.embeddings
    return { hits, misses, size, hitRate: hits + misses ? hits / (hits + misses) : 0 }
  }

  /** `fast` model -> typed filter object. Caller races this against the timeout. */
  async parseQuery(q: string, facets: Facets | null, ctx: AIContext, signal?: AbortSignal): Promise<RawParsedQuery> {
    const vars = {
      currency: this.currency(facets),
      categories: facets?.categories.slice(0, 150).map((c) => `${c.id}: ${c.title}`).join('; ') || '(none)',
      attributes: facets
        ? Object.entries(facets.attributes)
            .slice(0, 20)
            .map(([k, v]) => `${k}: ${v.slice(0, 30).join(', ')}`)
            .join('; ') || '(none)'
        : '(none)',
    }
    let system: string
    let promptRef: { slug: string; version: number } | undefined
    try {
      const r = await this.services.prompts.render(PROMPTS.parseFilters, vars, ctx)
      system = r.system
      promptRef = { slug: r.slug, version: r.version }
    } catch {
      system = renderInline(parseFiltersPrompt.system, vars)
    }
    const timeoutMs = this.options.queryUnderstanding ? this.options.queryUnderstanding.timeoutMs : undefined
    const r = await this.services.ai.generateObject(
      {
        task: 'fast',
        system,
        prompt: q,
        schema: parsedQuerySchema,
        schemaName: 'SearchFilters',
        temperature: 0,
        maxOutputTokens: 120,
        timeoutMs,
        signal,
        promptRef,
      },
      ctx,
    )
    return r.object
  }

  async synonymMap(ctx: Pick<AIContext, 'tenant'>): Promise<SynonymMap> {
    const key = String(ctx.tenant ?? '')
    const hit = this.synonymCache.get(key)
    if (hit && Date.now() - hit.at < this.options.facetsTtlMs) return hit.value
    const value = this.loadSynonyms(ctx.tenant)
    this.synonymCache.set(key, { at: Date.now(), value })
    return value
  }

  invalidateSynonyms(): void {
    this.synonymCache.clear()
  }

  private async loadSynonyms(tenant: string | number | undefined): Promise<SynonymMap> {
    const groups: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(this.options.synonyms)) groups[k.toLowerCase()] = [...v]
    try {
      const res = await local(this.payload).find({
        collection: SLUGS.reports,
        where: tenantWhere(this.payload, tenant, { 'synonyms.status': { equals: 'approved' } }),
        limit: 50,
        depth: 0,
        sort: '-createdAt',
        overrideAccess: true,
      })
      for (const doc of res.docs) {
        for (const s of (doc.synonyms ?? []) as { term?: string; synonyms?: string; status?: string }[]) {
          if (s.status !== 'approved' || !s.term || !s.synonyms) continue
          const term = s.term.toLowerCase()
          groups[term] = [...(groups[term] ?? []), ...s.synonyms.split(',').map((x) => x.trim()).filter(Boolean)]
        }
      }
    } catch (e) {
      this.payload.logger?.warn?.(`[ai-search] could not load approved synonyms: ${(e as Error)?.message}`)
    }
    return buildSynonymMap(groups)
  }

  private async retrieveVectors(
    text: string,
    variants: string[],
    embedding: number[] | undefined,
    filters: SearchFilters,
    ctx: AIContext,
  ): Promise<Candidate[]> {
    const where = toVectorWhere(filters)
    const scope = this.scope(ctx)
    const k = this.options.candidates
    const vectors = this.services.vectors
    const lists: VectorHit[][] = await Promise.all([
      embedding || text ? vectors.query(OFFERINGS_TABLE_NAME, { embedding, text: text || undefined, k, where }, scope) : Promise.resolve([]),
      ...variants.map((v) => vectors.query(OFFERINGS_TABLE_NAME, { text: v, k, where }, scope)),
    ])
    const fused = lists.length > 1 ? reciprocalRankFusion(lists) : lists[0]
    return fused.map((r) => {
      const summary = rowToSummary(r)
      return { id: summary.id, score: r.score, summary, attributes: (r.fields.attributes as Record<string, unknown>) ?? {} }
    })
  }

  private async retrieveAdapter(text: string, filters: SearchFilters, ctx: AIContext): Promise<Candidate[]> {
    const adapter = this.offeringAdapter(ctx)
    if (!adapter) return []
    const r = await adapter.search(
      {
        text: text || undefined,
        categoryIds: filters.categoryIds,
        priceMin: filters.priceMin,
        priceMax: filters.priceMax,
        inStock: filters.inStock,
        attributes: filters.attributes,
        sort: 'relevance',
        limit: Math.min(this.options.candidates, 100),
      },
      ctx.adapterCtx,
    )
    return r.items.map((s, i) => ({ id: s.id, score: 1 / (61 + i), summary: s }))
  }

  private explicitFilters(input: SearchInput, facets: Facets | null, currency: string): SearchFilters {
    let raw: unknown = input.filters
    if (typeof raw === 'string') {
      try {
        raw = raw ? JSON.parse(raw) : undefined
      } catch {
        raw = undefined
      }
    }
    if (raw && typeof raw === 'object' && input.priceUnit === 'major') {
      const r = { ...(raw as Record<string, unknown>) }
      for (const k of ['priceMin', 'priceMax'] as const) if (typeof r[k] === 'number') r[k] = toMinor(r[k] as number, currency)
      raw = r
    }
    const parsed = explicitFiltersSchema.safeParse(raw ?? {})
    return parsed.success ? validateExplicitFilters(parsed.data, facets) : {}
  }

  /** The full §10.2 pipeline. Never throws because an AI call failed: degrades to keyword mode. */
  async search(input: SearchInput, ctx: AIContext): Promise<SearchResult> {
    const t0 = Date.now()
    const o = this.options
    const q = (input.q ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 200)
    const cursor = decodeCursor(input.cursor)
    const pageSize = clamp(input.limit ?? o.pageSize, 1, 48)
    const searchId = cursor.s ?? randomUUID()
    const facetsP = this.facets(ctx)
    const pricePhrase = parsePricePhrase(q)
    const words = q ? q.split(' ').length : 0

    let mode: 'hybrid' | 'keyword' = o.hybrid && q ? 'hybrid' : 'keyword'
    let fallbackReason: string | undefined
    // No pgvector: don't pay for a query embedding that can't be used.
    if (mode === 'hybrid' && this.services.vectors.mode?.() === 'keyword') {
      mode = 'keyword'
      fallbackReason = 'vectors:unavailable'
    }
    const embedP: Promise<number[] | null> =
      mode === 'hybrid'
        ? withTimeout(this.embedQuery(q, ctx), o.embedTimeoutMs).catch((e: unknown) => {
            fallbackReason = `embedding:${errorCode(e)}`
            return null
          })
        : Promise.resolve(null)

    const qu = o.queryUnderstanding
    let parseError: string | undefined
    const ac = new AbortController()
    const parseP: Promise<RawParsedQuery | null> =
      o.hybrid && qu && words >= qu.minWords
        ? withTimeout(
            facetsP.then((f) => this.parseQuery(q, f, ctx, ac.signal)),
            qu.timeoutMs,
            () => ac.abort(),
          ).catch((e: unknown) => {
            parseError = errorCode(e)
            return null
          })
        : Promise.resolve(null)

    const [facets, embedding, parsedRaw] = await Promise.all([facetsP, embedP, parseP])
    if (mode === 'hybrid' && !embedding) mode = 'keyword'

    const currency = this.currency(facets)
    const ai = validateParsedFilters(parsedRaw, facets, currency)
    const regexFilters: SearchFilters = {
      ...(pricePhrase.priceMin !== undefined ? { priceMin: toMinor(pricePhrase.priceMin, currency) } : {}),
      ...(pricePhrase.priceMax !== undefined ? { priceMax: toMinor(pricePhrase.priceMax, currency) } : {}),
    }
    // Deterministic price parsing wins over the model; explicit UI filters win over both.
    const filters = mergeFilters(ai.filters, regexFilters, this.explicitFilters(input, facets, currency))
    const text = (ai.text ?? pricePhrase.text ?? q).trim()

    const variants = text ? expandWithSynonyms(text, await this.synonymMap(ctx)) : []

    let rows: Candidate[] = []
    if (mode === 'hybrid') {
      try {
        rows = await this.retrieveVectors(text, variants, embedding!, filters, ctx)
      } catch (e) {
        mode = 'keyword'
        fallbackReason = `vectors:${errorCode(e)}`
      }
    }
    if (mode === 'keyword') {
      if (text) {
        try {
          rows = await this.retrieveVectors(text, variants, undefined, filters, ctx)
        } catch (e) {
          fallbackReason ??= `vectors:${errorCode(e)}`
        }
      }
      if (!rows.length) {
        try {
          rows = await this.retrieveAdapter(text, filters, ctx)
        } catch (e) {
          this.payload.logger?.error?.(`[ai-search] adapter search failed: ${(e as Error)?.message}`)
        }
      }
    }

    const filtered = rows.filter((c) => matchesPostFilters(filters, { categoryIds: c.summary.categoryIds, attributes: c.attributes }))
    const ranked = applyBusinessRules(filtered, o.boosts)
    const { page, nextCursor } = paginate(ranked, cursor.o, pageSize, searchId)

    const parsedFilters: Record<string, unknown> = { ...filters }
    if (text && text !== q) parsedFilters.text = text
    if (ai.dropped.length) parsedFilters.dropped = ai.dropped
    if (parseError) parsedFilters.parseSkipped = parseError

    const result: SearchResult = {
      items: page.map((c) => ({ ...c.summary, score: Math.round(c.score * 1e6) / 1e6 })),
      total: ranked.length,
      nextCursor,
      facets: facetCounts(ranked, facets),
      parsedFilters: Object.keys(parsedFilters).length ? parsedFilters : undefined,
      mode,
      requestId: ctx.requestId,
      searchId,
      fallbackReason,
    }

    if (cursor.o === 0 && input.log !== false) {
      await this.writeEvent(
        {
          type: 'search',
          searchId,
          query: q,
          normalizedQuery: normalizeQuery(q),
          filters,
          resultIds: page.map((c) => c.id),
          resultCount: ranked.length,
          zeroResults: ranked.length === 0,
          sessionId: sessionHash(this.services, ctx, input.sessionId),
          latencyMs: Date.now() - t0,
          mode,
          source: input.source ?? 'storefront',
        },
        ctx,
      )
    }
    return result
  }

  /** Click / add-to-cart / impression from the storefront. */
  async recordEvent(body: SearchEventBody, ctx: AIContext): Promise<{ ok: true }> {
    await this.writeEvent(
      {
        type: body.type,
        searchId: body.searchId,
        query: body.query?.slice(0, 200),
        normalizedQuery: body.query ? normalizeQuery(body.query.slice(0, 200)) : undefined,
        offeringId: body.offeringId,
        position: body.position,
        sessionId: sessionHash(this.services, ctx, body.sessionId),
      },
      ctx,
    )
    return { ok: true }
  }

  private async writeEvent(data: Record<string, unknown>, ctx: AIContext): Promise<void> {
    try {
      await local(this.payload).create({
        collection: SLUGS.events,
        data: { ...data, ...tenantData(this.payload, ctx.tenant) },
        overrideAccess: true,
        depth: 0,
      })
    } catch (e) {
      this.payload.logger?.warn?.(`[ai-search] could not log search event: ${(e as Error)?.message}`)
    }
  }
}

/**
 * Programmatic search (same pipeline as GET /api/ai/search). Uses `getAI(payload)` services.
 * `ctx` is the caller's AIContext; adapters run with the caller's access.
 */
export const searchOffers = (payload: Payload, input: SearchInput, ctx: AIContext): Promise<SearchResult> =>
  getSearchEngine(payload).search(input, ctx)
