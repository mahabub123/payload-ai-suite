import { z } from 'zod'
import { AIError, defineTool } from '@payload-ai-suite/ai-core'
import type { ToolResult } from '@payload-ai-suite/ai-core'

const DAY = 86_400_000

export const checkAvailability = defineTool({
  name: 'checkAvailability',
  description: 'List open booking slots for a service.',
  tier: 'read',
  requires: ['booking'],
  input: z.object({
    offeringId: z.string().min(1),
    from: z.string().optional().describe('ISO date; default now'),
    days: z.number().int().min(1).max(31).optional(),
    locationId: z.string().optional(),
  }),
  async run(input, ctx) {
    const from = input.from ? new Date(input.from) : new Date()
    if (Number.isNaN(from.getTime())) throw new AIError('validation', 'Invalid date')
    const to = new Date(from.getTime() + (input.days ?? 7) * DAY)
    const slots = (await ctx.adapters.booking!.availability({ offeringId: input.offeringId, from, to, locationId: input.locationId }, ctx.adapterCtx)).slice(0, 12)
    return {
      data: { offeringId: input.offeringId, slots },
      cards: [{ type: 'slots', offeringId: input.offeringId, slots }],
    }
  },
})

export const bookSlot = defineTool({
  name: 'bookSlot',
  description: 'Make a tentative booking for an available slot (staff confirm it later). Needs the shopper name and email or phone.',
  tier: 'low',
  requires: ['booking'],
  input: z.object({
    offeringId: z.string().min(1),
    start: z.string(),
    end: z.string(),
    staffId: z.string().optional(),
    locationId: z.string().optional(),
    name: z.string().max(120).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(5).max(30).optional(),
    notes: z.string().max(500).optional(),
  }),
  async run(input, ctx): Promise<ToolResult> {
    const start = new Date(input.start)
    if (Number.isNaN(start.getTime())) throw new AIError('validation', 'Invalid slot')
    // Re-check the slot is really open; the model may not book an invented time.
    const open = await ctx.adapters.booking!.availability(
      { offeringId: input.offeringId, from: new Date(start.getTime() - 60_000), to: new Date(start.getTime() + DAY), locationId: input.locationId },
      ctx.adapterCtx,
    )
    const slot = open.find((s) => new Date(s.start).getTime() === start.getTime() && (!input.staffId || s.staffId === input.staffId))
    if (!slot) return { data: { booked: false, reason: 'slot_unavailable' } }
    const res = await ctx.adapters.booking!.bookTentative(
      { offeringId: input.offeringId, slot, name: input.name, email: input.email, phone: input.phone, notes: input.notes },
      ctx.adapterCtx,
    )
    return {
      data: { booked: true, bookingId: res.id, status: res.status, slot },
      cards: [{ type: 'booking', bookingId: res.id, status: res.status, slot }],
    }
  },
})
