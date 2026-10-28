'use client'
import { useEffect, useState } from 'react'
import type { OfferingSummary, RecsResponse } from 'payload-ai-core/wire'
import { useAISuite } from '../provider'

export interface UseRecommendationsOptions {
  offeringId?: string
  kind?: RecsResponse['kind']
  limit?: number
}

export const useRecommendations = ({ offeringId, kind = 'similar', limit }: UseRecommendationsOptions) => {
  const client = useAISuite()
  const [items, setItems] = useState<OfferingSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [requestId, setRequestId] = useState<string>()

  useEffect(() => {
    if (!offeringId && kind !== 'for-you') return
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    client
      .json<RecsResponse>('/recs', { query: { offering: offeringId, kind, limit }, signal: ac.signal })
      .then((r) => {
        setItems(r.items)
        setRequestId(r.requestId)
      })
      .catch((e: Error) => !ac.signal.aborted && setError(e))
      .finally(() => !ac.signal.aborted && setLoading(false))
    return () => ac.abort()
  }, [client, offeringId, kind, limit])

  return { items, loading, error, requestId }
}
