import type { LeadAdapter } from 'payload-ai-core'
import { AIError } from 'payload-ai-core'
import { create } from '../local'
import type { Doc } from '../mapping/values'
import { setPath } from '../mapping/values'
import { TICKETS_COLLECTION } from '../presets'
import type { Resolution } from '../resolve'

export const createLeadAdapter = (r: Resolution): LeadAdapter => {
  const t = r.main!
  const o = r.options as { data?: Record<string, unknown>; createAs?: 'caller' | 'system' }
  // ai-tickets only allows staff to create; the lead tool's validated input is written as system by default.
  const asSystem = (o.createAs ?? (t.collection === TICKETS_COLLECTION ? 'system' : 'caller')) === 'system'
  return {
    collection: t.collection,
    fields: { ...t.fields },
    async create(input, ctx) {
      if (!input.message?.trim()) throw new AIError('validation', 'Message is required')
      const data: Doc = t.collection === TICKETS_COLLECTION ? { topic: 'lead', status: 'open' } : {}
      const values: Record<string, unknown> = {
        name: input.name,
        email: input.email,
        phone: input.phone,
        message: input.message,
        source: input.source,
        meta: input.meta,
      }
      // ai-tickets keeps contact details in the transcript JSON.
      if (t.collection === TICKETS_COLLECTION && t.fields.meta)
        values.meta = { name: input.name, email: input.email, phone: input.phone, message: input.message, ...input.meta }
      for (const [key, path] of Object.entries(t.fields)) if (values[key] !== undefined) setPath(data, path, values[key])
      Object.assign(data, o.data)
      const doc = await create(t, data, ctx, { asSystem })
      return { id: String(doc.id) }
    },
  }
}
