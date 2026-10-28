import type { AIContext, AdapterContext, CoreServices, Card, ChatRequestBody } from '@payload-ai-suite/ai-core'
import type { ResolvedAssistantOptions } from './options'

export const MODULE = 'assistant'
export const VERIFICATIONS = 'ai-assistant-verifications'
export const TICKETS = 'ai-tickets'

/** A guest who proved ownership of one order with order number + email + one-time code. */
export interface VerifiedIdentity {
  customerId?: string
  email?: string
  orderNumber?: string
  orderId?: string
}

/** Per-request state shared between runAssistantTurn and the tools it runs (keyed by requestId). */
export interface TurnState {
  conversationId: string
  channel: string
  page?: ChatRequestBody['page']
  identity?: VerifiedIdentity
  options: ResolvedAssistantOptions
  handoffCard?: Card
}

const turns = new Map<string, TurnState>()

export const beginTurn = (requestId: string, s: TurnState): void => void turns.set(requestId, s)
export const endTurn = (requestId: string): void => void turns.delete(requestId)
export const turnOf = (ctx: Pick<AIContext, 'requestId'>): TurnState | undefined => turns.get(ctx.requestId)

/** Stable key of the person behind a request, used to bind a guest verification to them. */
export const ownerKey = (ctx: AIContext): string | undefined => {
  const a = ctx.actor
  if (a.channel) return `channel:${a.channel.name}:${a.channel.externalIdHash}`
  if (a.visitorId) return `visitor:${a.visitorId}`
  const userId = (a.user as { id?: string | number } | null | undefined)?.id
  return userId != null ? `user:${userId}` : undefined
}

/** Order tools are offered only to a customer or a guest who verified an order. */
export const hasOrderIdentity = (ctx: AIContext): boolean =>
  Boolean(ctx.actor.customerId) || Boolean(turnOf(ctx)?.identity?.orderNumber)

export const withCustomer = <T extends AIContext>(ctx: T, customerId: string): T => ({
  ...ctx,
  actor: { ...ctx.actor, customerId },
  adapterCtx: { ...ctx.adapterCtx, customerId },
})

/** System adapter context (tenant + locale kept). Only for lookups the caller has already proven a right to. */
export const systemAdapterCtx = (ctx: AIContext): AdapterContext => ({
  payload: ctx.payload,
  locale: ctx.locale,
  tenant: ctx.tenant,
  system: true,
})

interface VerificationDoc {
  id: string | number
  customerId?: string | null
  emailEnc?: string | null
  orderNumberEnc?: string | null
  orderId?: string | null
}

/** Latest valid verification for this owner (optionally for one conversation). */
export const findVerifiedIdentity = async (
  ctx: AIContext,
  services: CoreServices,
  conversationId?: string,
): Promise<VerifiedIdentity | undefined> => {
  const owner = ownerKey(ctx)
  if (!owner) return undefined
  const and: Record<string, unknown>[] = [
    { owner: { equals: owner } },
    { status: { equals: 'verified' } },
    { verifiedUntil: { greater_than: new Date().toISOString() } },
  ]
  if (conversationId) and.push({ conversation: { equals: conversationId } })
  try {
    const res = await ctx.payload.find({
      collection: VERIFICATIONS as never,
      where: { and } as never,
      sort: '-verifiedAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const doc = res.docs[0] as unknown as VerificationDoc | undefined
    if (!doc) return undefined
    const dec = (v?: string | null) => (v ? services.crypto.decrypt(v) : undefined)
    return {
      customerId: doc.customerId ?? undefined,
      email: dec(doc.emailEnc),
      orderNumber: dec(doc.orderNumberEnc),
      orderId: doc.orderId ?? undefined,
    }
  } catch (e) {
    ctx.payload.logger?.warn?.({ err: e, requestId: ctx.requestId }, '[ai-assistant] verification lookup failed')
    return undefined
  }
}

export const truncate = (s: string | undefined, n: number): string =>
  !s ? '' : s.length > n ? `${s.slice(0, n - 1)}…` : s
