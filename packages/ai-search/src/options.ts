export interface AiSearchOptions {
  /** Vector + full-text hybrid retrieval. When false, search is keyword-only and never calls a model. Default true. */
  hybrid?: boolean
  /** Similar / bought-together / for-you endpoints, tool and nightly co-occurrence job. Default true. */
  recommendations?: boolean
  /** Natural-language filter parsing with the `fast` model. `false` disables it. */
  queryUnderstanding?: { minWords?: number; timeoutMs?: number } | false
  /** Results per page. Default 24. */
  pageSize?: number
  /** Ranking multipliers per offering id (> 1 promotes, < 1 demotes, <= 0 hides). */
  boosts?: Record<string, number>
  /** Static synonym groups: term -> synonyms (applied both ways), merged with staff-approved ones. */
  synonyms?: Record<string, string[]>
  /** Query embedding timeout before falling back to keyword mode. Default 250 ms. */
  embedTimeoutMs?: number
  /** Query-embedding LRU size. Default 2000. */
  embeddingCacheSize?: number
  /** Facet cache TTL (validation of AI-parsed filters). Default 5 minutes. */
  facetsTtlMs?: number
  /** Currency used for price parsing when the adapter's facets don't report one. Default 'USD'. */
  currency?: string
  /** Candidates retrieved before business rules / pagination. Default 200. */
  candidates?: number
  /** Job schedules (Payload cron with seconds). `false` disables a schedule. */
  schedules?: { reindex?: string | false; cooccurrence?: string | false; learning?: string | false }
  /** Bought-together computation window and list size. */
  cooccurrence?: { days?: number; top?: number }
}

export interface ResolvedSearchOptions {
  hybrid: boolean
  recommendations: boolean
  queryUnderstanding: { minWords: number; timeoutMs: number } | false
  pageSize: number
  boosts: Record<string, number>
  synonyms: Record<string, string[]>
  embedTimeoutMs: number
  embeddingCacheSize: number
  facetsTtlMs: number
  currency: string
  candidates: number
  schedules: { reindex: string | false; cooccurrence: string | false; learning: string | false }
  cooccurrence: { days: number; top: number }
}

export const resolveOptions = (o: AiSearchOptions = {}): ResolvedSearchOptions => ({
  hybrid: o.hybrid ?? true,
  recommendations: o.recommendations ?? true,
  queryUnderstanding:
    o.queryUnderstanding === false
      ? false
      : { minWords: o.queryUnderstanding?.minWords ?? 4, timeoutMs: o.queryUnderstanding?.timeoutMs ?? 150 },
  pageSize: o.pageSize ?? 24,
  boosts: o.boosts ?? {},
  synonyms: o.synonyms ?? {},
  embedTimeoutMs: o.embedTimeoutMs ?? 250,
  embeddingCacheSize: o.embeddingCacheSize ?? 2000,
  facetsTtlMs: o.facetsTtlMs ?? 5 * 60_000,
  currency: o.currency ?? 'USD',
  candidates: o.candidates ?? 200,
  schedules: {
    // Payload crons include seconds: sec min hour dom month dow
    reindex: o.schedules?.reindex ?? '0 0 3 * * *',
    cooccurrence: o.schedules?.cooccurrence ?? '0 30 3 * * *',
    learning: o.schedules?.learning ?? '0 0 4 * * 1',
  },
  cooccurrence: { days: o.cooccurrence?.days ?? 180, top: o.cooccurrence?.top ?? 12 },
})
