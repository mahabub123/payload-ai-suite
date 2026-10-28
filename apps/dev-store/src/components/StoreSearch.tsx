'use client'
import { RecommendationsBlock, SearchBox, SearchResults } from 'payload-ai-react'
import { useState } from 'react'

/** Instant-search box; Enter shows the full results grid below it. */
export const StoreSearch = () => {
  const [query, setQuery] = useState('')
  return (
    <section aria-label="Search" className="search">
      <SearchBox placeholder="Try “red saree under 3,000 taka” or “লাল শাড়ি”" onSubmit={setQuery} />
      {query && <SearchResults query={query} />}
    </section>
  )
}

export const Recs = ({ offeringId, kind, title }: { offeringId?: string; kind: 'similar' | 'bought-together' | 'for-you'; title?: string }) => (
  <RecommendationsBlock offeringId={offeringId} kind={kind} title={title} />
)
