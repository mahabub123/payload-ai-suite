import { z } from 'zod'
import { defineTool } from '@payload-ai-suite/ai-core'

export const captureLead = defineTool({
  name: 'captureLead',
  description: 'Save a sales enquiry with the contact details the shopper gave (quote request, bulk order, callback).',
  tier: 'low',
  requires: ['lead'],
  input: z
    .object({
      name: z.string().max(120).optional(),
      email: z.string().email().optional(),
      phone: z.string().min(5).max(30).optional(),
      message: z.string().min(2).max(2000),
    })
    .refine((v) => v.email || v.phone, { message: 'email or phone required' }),
  async run(input, ctx) {
    const { id } = await ctx.adapters.lead!.create({ ...input, source: 'assistant', meta: { requestId: ctx.requestId } }, ctx.adapterCtx)
    return { data: { leadId: id, saved: true }, cards: [{ type: 'lead', leadId: id }] }
  },
})
