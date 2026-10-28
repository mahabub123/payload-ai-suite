import type { Payload } from 'payload'
import type { AICoreOptions } from '@payload-ai-suite/ai-core'
import { getSuiteState } from '@payload-ai-suite/ai-core'
import { collectionExists } from '../data'

/** Tenants to run a job for: every tenant when Multi-Tenant is configured, else a single global run. */
export const listTenants = async (payload: Payload): Promise<(string | number | undefined)[]> => {
  const t = (getSuiteState(payload.config as any)?.options as AICoreOptions | undefined)?.tenant
  if (!t?.field) return [undefined]
  const slug = t.collection ?? 'tenants'
  if (!collectionExists(payload, slug)) return [undefined]
  const ids: (string | number)[] = []
  for (let page = 1; ; page++) {
    const r = await payload.find({ collection: slug as any, depth: 0, limit: 200, page, overrideAccess: true })
    ids.push(...r.docs.map((d) => (d as { id: string | number }).id))
    if (!r.hasNextPage) break
  }
  return ids
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export const linesToHtml = (title: string, lines: string[], footer?: string) =>
  `<h2>${esc(title)}</h2><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>${footer ? `<p style="color:#666">${esc(footer)}</p>` : ''}`

/** Throws on failure so the job retries; the report's emailedAt makes the retry send exactly once. */
export const sendReportEmail = async (payload: Payload, to: string[], subject: string, title: string, lines: string[]) => {
  if (!to.length) return false
  await payload.sendEmail({
    to: to.join(', '),
    subject,
    html: linesToHtml(title, lines, 'Numbers computed by AI Insights from your store data. Open the admin → AI Insights for details.'),
    text: `${title}\n\n${lines.map((l) => `- ${l}`).join('\n')}`,
  })
  return true
}
