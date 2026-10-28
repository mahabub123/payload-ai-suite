'use client'
import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { createClient } from './client'
import type { AISuiteClient } from './client'

export interface AISuiteProviderProps {
  /** Suite API base. Default '/api/ai'. */
  baseUrl?: string
  locale?: string
  turnstileSiteKey?: string
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>
  children?: ReactNode
}

const Ctx = createContext<AISuiteClient | null>(null)

export const AISuiteProvider = ({ baseUrl = '/api/ai', locale = 'en', turnstileSiteKey, getHeaders, children }: AISuiteProviderProps) => {
  const client = useMemo(() => createClient({ baseUrl, locale, turnstileSiteKey, getHeaders }), [baseUrl, locale, turnstileSiteKey, getHeaders])
  return <Ctx.Provider value={client}>{children}</Ctx.Provider>
}

const fallback = createClient({ baseUrl: '/api/ai', locale: 'en' })

/** The suite client from the nearest AISuiteProvider (defaults to /api/ai, English). */
export const useAISuite = (): AISuiteClient => useContext(Ctx) ?? fallback
