'use client'
import { useConfig } from '@payloadcms/ui'

export const SUGGESTED_EVENT = 'ai-support:suggested'

export interface SuggestResponse {
  suggestedReply: string
  summary: string
  citations: { title: string; url?: string }[]
}

/** POST to a suite endpoint with the admin session cookie; throws with the server message. */
export const useSuiteApi = () => {
  const { config } = useConfig()
  const base = `${config.serverURL ?? ''}${config.routes.api}`
  return async <T,>(path: string, body: unknown): Promise<T> => {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => ({}))) as T & { message?: string }
    if (!res.ok) throw new Error(json.message ?? `Request failed (${res.status})`)
    return json
  }
}
