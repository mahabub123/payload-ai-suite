import { z } from 'zod'
import { AIError } from '@payload-ai-suite/ai-core'
import type { AIContext, AIEndpointDefinition, CoreServices, StoredMessage } from '@payload-ai-suite/ai-core'
import { getAssistantOptions } from './options'
import { MODULE } from './state'
import { runAssistantTurn } from './turn'
import { confirmVerification, startVerification } from './verification'

const chatInput = z.object({
  conversationId: z.string().min(1).max(64).optional(),
  message: z.string().trim().min(1).max(4000),
  page: z
    .object({ url: z.string().max(2000).optional(), offeringId: z.string().max(64).optional(), cartId: z.string().max(64).optional() })
    .optional(),
  locale: z.string().max(16).optional(),
  turnstileToken: z.string().max(4096).optional(),
})

const withLocale = (ctx: AIContext, locale?: string): AIContext =>
  locale ? { ...ctx, locale, adapterCtx: { ...ctx.adapterCtx, locale } } : ctx

/** Message docs from ai-messages when the memory service has no messages() (fallback reads core collections). */
const storedMessages = async (cid: string, ctx: AIContext, services: CoreServices): Promise<StoredMessage[]> => {
  if (services.memory.messages) return services.memory.messages(cid, ctx, { limit: 200 })
  const res = await ctx.payload.find({
    collection: 'ai-messages' as never,
    where: { conversation: { equals: cid } } as never,
    sort: 'createdAt',
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  return res.docs.map((raw) => {
    const d = raw as unknown as Record<string, any>
    const parts = Array.isArray(d.parts) ? d.parts : []
    return {
      id: String(d.id),
      role: d.role,
      text: d.text ?? parts.filter((p: any) => p?.type === 'text').map((p: any) => p.text).join(''),
      cards: d.cards ?? parts.filter((p: any) => p?.type === 'card').map((p: any) => p.card),
      citations: d.citations ?? undefined,
      createdAt: d.createdAt,
    }
  })
}

export const assistantEndpoints = (): AIEndpointDefinition<any>[] => [
  {
    path: '/ai/assistant/chat',
    method: 'post',
    module: MODULE,
    access: 'anyone',
    surface: 'storefront',
    turnstile: 'first',
    // Budget is checked inside the turn so a spent budget becomes a friendly message, not an error.
    budget: false,
    input: chatInput,
    handler: async ({ ctx, input }) =>
      runAssistantTurn({ ctx: withLocale(ctx, input.locale), conversationId: input.conversationId, message: input.message, page: input.page, channel: 'web' }),
  } satisfies AIEndpointDefinition<z.infer<typeof chatInput>>,
  {
    path: '/ai/assistant/verify/start',
    method: 'post',
    module: MODULE,
    access: 'anyone',
    surface: 'storefront',
    budget: false,
    turnstile: 'first',
    rateLimit: { limit: 5, windowSec: 600 },
    input: z.object({
      orderNumber: z.string().trim().min(1).max(64),
      email: z.string().trim().email().max(254),
      conversationId: z.string().min(1).max(64).optional(),
    }),
    handler: async ({ ctx, services, input }) => startVerification(ctx, services, getAssistantOptions(ctx.payload), input),
  },
  {
    path: '/ai/assistant/verify/confirm',
    method: 'post',
    module: MODULE,
    access: 'anyone',
    surface: 'storefront',
    budget: false,
    rateLimit: { limit: 10, windowSec: 600 },
    input: z.object({ code: z.string().trim().regex(/^\d{6}$/), conversationId: z.string().min(1).max(64) }),
    handler: async ({ ctx, services, input }) => confirmVerification(ctx, services, getAssistantOptions(ctx.payload), input),
  },
  {
    path: '/ai/assistant/feedback',
    method: 'post',
    module: MODULE,
    access: 'anyone',
    surface: 'storefront',
    budget: false,
    input: z.object({
      messageId: z.string().min(1).max(64),
      rating: z.enum(['up', 'down']),
      comment: z.string().max(1000).optional(),
    }),
    handler: async ({ ctx, services, input }) => {
      const fb = { rating: input.rating, comment: input.comment }
      if (services.memory.feedback) {
        await services.memory.feedback(input.messageId, fb, ctx)
        return { ok: true }
      }
      const msg = (await ctx.payload
        .findByID({ collection: 'ai-messages' as never, id: input.messageId, depth: 0, overrideAccess: true })
        .catch(() => null)) as { conversation?: unknown; role?: string } | null
      const cid = msg?.conversation && typeof msg.conversation === 'object' ? (msg.conversation as { id: unknown }).id : msg?.conversation
      if (!msg || cid == null || msg.role !== 'assistant') throw new AIError('not_found', 'Message not found')
      // thread() throws forbidden unless ctx.actor owns the conversation.
      await services.memory.thread(ctx, { conversationId: String(cid), channel: 'web' })
      await ctx.payload.update({ collection: 'ai-messages' as never, id: input.messageId, data: { feedback: fb } as never, overrideAccess: true })
      return { ok: true }
    },
  },
  {
    path: '/ai/assistant/conversations/:id',
    method: 'get',
    module: MODULE,
    access: 'anyone',
    surface: 'storefront',
    budget: false,
    input: z.object({ params: z.object({ id: z.string().min(1).max(64) }) }),
    handler: async ({ ctx, services, input }) => {
      const cid = input.params.id
      // Ownership: thread() throws forbidden for someone else's conversation.
      const thread = await services.memory.thread(ctx, { conversationId: cid, channel: 'web' })
      if (thread.id !== cid) throw new AIError('not_found', 'Conversation not found')
      const messages = (await storedMessages(cid, ctx, services)).filter((m) => m.role === 'user' || m.role === 'assistant')
      return { conversationId: cid, handedOff: Boolean(thread.handedOff), messages }
    },
  },
  {
    path: '/ai/assistant/memory',
    method: 'get',
    module: MODULE,
    access: 'customer',
    surface: 'storefront',
    budget: false,
    handler: async ({ ctx, services }) => ({ memory: (await services.memory.customerMemory.get(ctx)) ?? {} }),
  },
  {
    path: '/ai/assistant/memory',
    method: 'delete',
    module: MODULE,
    access: 'customer',
    surface: 'storefront',
    budget: false,
    handler: async ({ ctx, services }) => {
      await services.memory.customerMemory.clear(ctx)
      await services.audit.log({ action: 'assistant.memory.clear' }, ctx)
      return { ok: true }
    },
  },
]
