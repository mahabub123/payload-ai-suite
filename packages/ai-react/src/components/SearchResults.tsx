'use client'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { OfferingSummary } from '@payload-ai-suite/ai-core/wire'
import { useSearch } from '../hooks/useSearch'
import type { UseSearchOptions } from '../hooks/useSearch'
import { useSearchEvents } from '../hooks/useSearchEvents'
import { useAISuite } from '../provider'
import { ProductCard } from './cards'
import { labelsFor } from './labels'
import { AISuiteStyles } from './styles'

export interface SearchResultsProps extends UseSearchOptions {
  /** Controlled query (e.g. from the URL). */
  query: string
  className?: string
  defaultStyles?: boolean
  renderItem?: (item: OfferingSummary, position: number) => ReactNode
}

/** Results grid with cursor pagination ("Load more") and click tracking. */
export const SearchResults = ({ query, className, defaultStyles = true, renderItem, ...opts }: SearchResultsProps) => {
  const client = useAISuite()
  const labels = labelsFor(client.config.locale)
  const s = useSearch({ ...opts, initialQuery: query, debounceMs: opts.debounceMs ?? 0 })
  const events = useSearchEvents()
  const { setQuery } = s
  useEffect(() => setQuery(query), [query, setQuery])
  return (
    <div className={`ais-root${className ? ` ${className}` : ''}`}>
      {defaultStyles ? <AISuiteStyles /> : null}
      <div className="ais-status" role="status" aria-live="polite">
        {s.loading && !s.items.length ? '…' : !s.items.length && query ? labels.noResults : null}
      </div>
      <div className="ais-products" role="list">
        {s.items.map((it, i) => (
          <div role="listitem" key={it.id}>
            {renderItem ? (
              renderItem(it, i)
            ) : (
              <ProductCard item={it} position={i} locale={client.config.locale} onProductClick={(item, pos) => events.trackClick(item.id, { position: pos, query, searchId: s.searchId })} />
            )}
          </div>
        ))}
      </div>
      {s.hasMore ? (
        <div className="ais-actions">
          <button type="button" className="ais-btn" onClick={s.loadMore} disabled={s.loading}>
            {labels.loadMore}
          </button>
        </div>
      ) : null}
    </div>
  )
}
