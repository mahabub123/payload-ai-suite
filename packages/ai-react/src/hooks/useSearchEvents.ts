'use client'
import { useCallback, useMemo } from 'react'
import type { SearchEventBody } from 'payload-ai-core/wire'
import { randomId } from '../client'
import { useAISuite } from '../provider'

const SESSION_KEY = 'ai-suite:search-session'

const sessionId = (): string | undefined => {
  try {
    if (typeof window === 'undefined') return undefined
    let id = window.sessionStorage.getItem(SESSION_KEY)
    if (!id) window.sessionStorage.setItem(SESSION_KEY, (id = randomId()))
    return id
  } catch {
    return undefined
  }
}

/** Fire-and-forget search analytics (click / add-to-cart / impression). Never throws. */
export const useSearchEvents = () => {
  const client = useAISuite()
  const track = useCallback(
    (ev: SearchEventBody) => {
      void client
        .fetch('/search/events', { method: 'POST', json: { ...ev, sessionId: ev.sessionId ?? sessionId() }, keepalive: true })
        .catch(() => undefined)
    },
    [client],
  )
  return useMemo(
    () => ({
      track,
      trackClick: (offeringId: string, o: Omit<SearchEventBody, 'type' | 'offeringId'> = {}) => track({ type: 'click', offeringId, ...o }),
      trackAddToCart: (offeringId: string, o: Omit<SearchEventBody, 'type' | 'offeringId'> = {}) => track({ type: 'add-to-cart', offeringId, ...o }),
      trackImpression: (o: Omit<SearchEventBody, 'type'> = {}) => track({ type: 'impression', ...o }),
    }),
    [track],
  )
}
