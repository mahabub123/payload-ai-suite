'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SearchResponse } from '@payload-ai-suite/ai-core/wire'
import { useAISuite } from '../provider'

export interface UseSearchOptions {
  initialQuery?: string
  filters?: Record<string, unknown>
  /** 'auto' lets the server choose (hybrid unless budget/latency fallback). */
  mode?: 'auto' | 'hybrid' | 'keyword'
  debounceMs?: number
  limit?: number
  /** Minimum query length before searching. Default 1. */
  minLength?: number
}

export const useSearch = (opts: UseSearchOptions = {}) => {
  const client = useAISuite()
  const [query, setQuery] = useState(opts.initialQuery ?? '')
  const [filters, setFilters] = useState<Record<string, unknown>>(opts.filters ?? {})
  const [items, setItems] = useState<SearchResponse['items']>([])
  const [meta, setMeta] = useState<Omit<SearchResponse, 'items'> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const filtersKey = JSON.stringify(filters)
  const mode = opts.mode && opts.mode !== 'auto' ? opts.mode : undefined

  const run = useCallback(
    async (cursor?: string) => {
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      setLoading(true)
      setError(null)
      try {
        const r = await client.json<SearchResponse>('/search', {
          query: { q: query.trim(), filters: filtersKey === '{}' ? undefined : filtersKey, cursor, mode, limit: opts.limit, locale: client.config.locale },
          signal: ac.signal,
        })
        const { items: got, ...rest } = r
        setItems((prev) => (cursor ? [...prev, ...got] : got))
        setMeta(rest)
      } catch (e) {
        if (!ac.signal.aborted) setError(e as Error)
      } finally {
        if (abortRef.current === ac) setLoading(false)
      }
    },
    [client, query, filtersKey, mode, opts.limit],
  )

  useEffect(() => {
    if (query.trim().length < (opts.minLength ?? 1)) {
      abortRef.current?.abort()
      setItems([])
      setMeta(null)
      setLoading(false)
      return
    }
    const t = setTimeout(() => void run(), opts.debounceMs ?? 250)
    return () => clearTimeout(t)
  }, [run, query, opts.debounceMs, opts.minLength])

  useEffect(() => () => abortRef.current?.abort(), [])

  const loadMore = useCallback(() => {
    if (meta?.nextCursor && !loading) void run(meta.nextCursor)
  }, [meta, loading, run])

  return {
    query,
    setQuery,
    filters,
    setFilters,
    items,
    total: meta?.total ?? 0,
    facets: meta?.facets,
    parsedFilters: meta?.parsedFilters,
    mode: meta?.mode,
    searchId: meta?.requestId,
    hasMore: Boolean(meta?.nextCursor),
    loadMore,
    loading,
    error,
    refresh: () => run(),
  }
}
