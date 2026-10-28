import type { Payload } from 'payload'
import type { Card } from 'payload-ai-core'
import { REPORTS } from './collections'
import { collectionExists, tenantFieldOf } from './data'

export interface ReportInput {
  question: string
  kind: 'ask' | 'briefing' | 'anomaly'
  period?: { from: string; to: string; label: string }
  answer: string
  verification: 'verified' | 'corrected' | 'stripped' | 'computed'
  metricCalls: unknown[]
  charts: Card[]
  flagged?: unknown
  dedupeKey?: string
  createdBy?: string | number
}

/** System write of a report (the collection's create access is closed to users). */
export const saveReport = async (payload: Payload, input: ReportInput, tenant?: string | number): Promise<{ id: string | number }> => {
  const tenantField = tenantFieldOf(payload)
  const doc = await payload.create({
    collection: REPORTS as any,
    data: { ...input, ...(tenant !== undefined && tenantField ? { [tenantField]: tenant } : {}) } as any,
    overrideAccess: true,
    depth: 0,
  })
  return { id: (doc as { id: string | number }).id }
}

export const findByDedupeKey = async (payload: Payload, key: string): Promise<Record<string, any> | undefined> => {
  if (!collectionExists(payload, REPORTS)) return undefined
  const r = await payload.find({ collection: REPORTS as any, where: { dedupeKey: { equals: key } }, limit: 1, depth: 0, overrideAccess: true })
  return r.docs[0] as Record<string, any> | undefined
}

export const markEmailed = async (payload: Payload, id: string | number) =>
  payload.update({ collection: REPORTS as any, id, data: { emailedAt: new Date().toISOString() } as any, overrideAccess: true, depth: 0 })
