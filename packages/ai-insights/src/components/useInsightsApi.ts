'use client'
import { useConfig } from '@payloadcms/ui'

/** API and admin base URLs from the Payload client config. */
export const useInsightsApi = () => {
  const { config } = useConfig()
  const api = `${config.serverURL ?? ''}${config.routes?.api ?? '/api'}`
  const admin = config.routes?.admin ?? '/admin'
  return { api, admin }
}

export interface ReportRow {
  id: string | number
  question: string
  kind: 'ask' | 'briefing' | 'anomaly'
  answer?: string
  verification?: string
  createdAt: string
  charts?: { type: 'chart'; title: string; kind: 'line' | 'bar' | 'pie' | 'table'; series: { name: string; points: { x: string | number; y: number }[] }[] }[]
}

export const fetchReports = async (api: string, opts: { limit: number; kinds?: string[] }): Promise<ReportRow[]> => {
  const qs = new URLSearchParams({ limit: String(opts.limit), sort: '-createdAt', depth: '0' })
  if (opts.kinds?.length) qs.set('where[kind][in]', opts.kinds.join(','))
  const res = await fetch(`${api}/ai-insight-reports?${qs}`, { credentials: 'include' })
  if (!res.ok) return []
  const json = (await res.json()) as { docs?: ReportRow[] }
  return json.docs ?? []
}
