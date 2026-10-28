import { z } from 'zod'
import { AIError, defineTool } from '@payload-ai-suite/ai-core'
import { createHandoff } from '../handoff'
import { turnOf } from '../state'

export const handOff = defineTool({
  name: 'handOff',
  description:
    'Hand the conversation to a human (shopper asks for a person, complaint, or you cannot help). Creates a support ticket with the transcript.',
  tier: 'low',
  input: z.object({
    reason: z.string().min(2).max(500),
    email: z.string().email().optional().describe('contact email the shopper gave'),
    name: z.string().max(120).optional(),
  }),
  async run(input, ctx) {
    const turn = turnOf(ctx)
    if (!turn) throw new AIError('bad_request', 'handOff runs only inside an assistant conversation')
    const card = await createHandoff(ctx, ctx.services, {
      conversationId: turn.conversationId,
      reason: input.reason,
      contactEmail: input.email,
      contactName: input.name,
      expectedReplyTime: turn.options.expectedReplyTime,
    })
    turn.handoffCard = card
    return { data: { handedOff: true, expectedReply: turn.options.expectedReplyTime }, cards: [card] }
  },
})
