import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { access, AIError } from 'payload-ai-core'
import type { AIContext, CoreServices } from 'payload-ai-core'
import type { CollectionConfig } from 'payload'
import type { ResolvedAssistantOptions } from './options'
import { MODULE, ownerKey, systemAdapterCtx, VERIFICATIONS } from './state'

/** Guest order verifications. Written by the system only; codes are stored hashed, contact data encrypted. */
export const verificationsCollection: CollectionConfig = {
  slug: VERIFICATIONS,
  admin: { group: 'AI Suite', hidden: true },
  access: { read: access.admin, create: access.nobody, update: access.nobody, delete: access.admin },
  timestamps: true,
  fields: [
    { name: 'conversation', type: 'text', index: true, required: true },
    { name: 'owner', type: 'text', index: true, required: true },
    { name: 'status', type: 'select', index: true, defaultValue: 'pending', options: ['pending', 'verified', 'failed', 'superseded'] },
    { name: 'codeHash', type: 'text', hidden: true },
    { name: 'salt', type: 'text', hidden: true },
    { name: 'attempts', type: 'number', defaultValue: 0 },
    { name: 'expiresAt', type: 'date' },
    { name: 'verifiedAt', type: 'date' },
    { name: 'verifiedUntil', type: 'date', index: true },
    { name: 'customerId', type: 'text' },
    { name: 'orderId', type: 'text' },
    { name: 'orderNumberEnc', type: 'text', hidden: true },
    { name: 'emailEnc', type: 'text', hidden: true },
  ],
}

export const GENERIC_START = {
  en: 'If the order number and email match an order, we have sent a 6-digit code to that email.',
  bn: 'অর্ডার নম্বর ও ইমেইল মিললে সেই ইমেইলে একটি ৬-সংখ্যার কোড পাঠানো হয়েছে।',
}
const INVALID_CODE = 'The code is invalid or has expired.'
const VERIFIED_FOR_MS = 24 * 3_600_000

const hashCode = (services: CoreServices, salt: string, code: string) => services.crypto.hashId(`${code}:assistant-otp:${salt}`)

const sameHash = (a: string, b: string | null | undefined) => {
  if (!b) return false
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

const pending = async (ctx: AIContext, conversationId: string, owner: string) =>
  ctx.payload.find({
    collection: VERIFICATIONS as never,
    where: { and: [{ conversation: { equals: conversationId } }, { owner: { equals: owner } }, { status: { equals: 'pending' } }] } as never,
    sort: '-createdAt',
    limit: 10,
    depth: 0,
    overrideAccess: true,
    // codeHash and salt are hidden fields; Payload strips them from reads unless asked.
    showHiddenFields: true,
  })

const patch = (ctx: AIContext, id: string | number, data: Record<string, unknown>) =>
  ctx.payload.update({ collection: VERIFICATIONS as never, id, data: data as never, overrideAccess: true })

/**
 * Step 1: order number + email. Always answers with the same generic message so it never reveals
 * whether an order exists; a code is emailed only when the system lookup matches.
 */
export const startVerification = async (
  ctx: AIContext,
  services: CoreServices,
  opts: ResolvedAssistantOptions,
  input: { orderNumber: string; email: string; conversationId?: string },
): Promise<{ ok: true; conversationId: string; message: string }> => {
  const owner = ownerKey(ctx)
  if (!owner) throw new AIError('validation', 'Missing visitor identity')
  const thread = await services.memory.thread(ctx, { conversationId: input.conversationId, channel: ctx.actor.channel?.name ?? 'web' })
  const message = ctx.locale?.startsWith('bn') ? GENERIC_START.bn : GENERIC_START.en
  const email = input.email.trim().toLowerCase()

  const limits = await Promise.all([
    services.rateLimit.hit(`assistant-otp:${owner}`, { limit: 5, windowSec: 3600 }),
    services.rateLimit.hit(`assistant-otp-email:${services.crypto.hashId(email)}`, { limit: 5, windowSec: 3600 }),
  ])
  if (limits.some((l) => !l.ok)) throw new AIError('rate_limit', 'Too many attempts. Please try again later.')

  const order = ctx.adapters.order
    ? await ctx.adapters.order.findByNumberAndEmail(input.orderNumber.trim().replace(/^#/, ''), email, systemAdapterCtx(ctx)).catch(() => null)
    : null
  if (!order) return { ok: true, conversationId: thread.id, message }

  for (const d of (await pending(ctx, thread.id, owner)).docs as { id: string | number }[]) await patch(ctx, d.id, { status: 'superseded' })

  let customerId = order.customerId
  if (!customerId && ctx.adapters.customer)
    customerId = (await ctx.adapters.customer.findByEmail(email, systemAdapterCtx(ctx)).catch(() => null))?.id

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const salt = randomBytes(12).toString('hex')
  await ctx.payload.create({
    collection: VERIFICATIONS as never,
    data: {
      conversation: thread.id,
      owner,
      status: 'pending',
      salt,
      codeHash: hashCode(services, salt, code),
      attempts: 0,
      expiresAt: new Date(Date.now() + opts.otp.ttlMinutes * 60_000).toISOString(),
      customerId: customerId ?? undefined,
      orderId: order.id,
      orderNumberEnc: services.crypto.encrypt(order.number ?? input.orderNumber.trim()),
      emailEnc: services.crypto.encrypt(email),
    } as never,
    overrideAccess: true,
  })
  try {
    await ctx.payload.sendEmail({
      to: email,
      subject: `Your verification code: ${code}`,
      text: `Your code to view order ${order.number ?? ''} in our chat is ${code}. It expires in ${opts.otp.ttlMinutes} minutes. If you did not ask for it, ignore this email.`,
    })
  } catch (e) {
    ctx.payload.logger?.error?.({ err: e, requestId: ctx.requestId }, '[ai-assistant] sending verification email failed')
  }
  await services.audit.log({ action: 'assistant.verify.start', meta: { conversationId: thread.id } }, { ...ctx, module: MODULE } as AIContext)
  return { ok: true, conversationId: thread.id, message }
}

/** Step 2: the one-time code. Binds the verified customer/order to this conversation + visitor. */
export const confirmVerification = async (
  ctx: AIContext,
  services: CoreServices,
  opts: ResolvedAssistantOptions,
  input: { code: string; conversationId: string },
): Promise<{ ok: true; verified: true; conversationId: string }> => {
  const owner = ownerKey(ctx)
  if (!owner) throw new AIError('validation', 'Missing visitor identity')
  await services.memory.thread(ctx, { conversationId: input.conversationId, channel: ctx.actor.channel?.name ?? 'web' })
  const doc = (await pending(ctx, input.conversationId, owner)).docs[0] as
    | { id: string | number; salt: string; codeHash: string; attempts?: number; expiresAt?: string }
    | undefined
  if (!doc || !doc.expiresAt || new Date(doc.expiresAt).getTime() < Date.now()) throw new AIError('validation', INVALID_CODE)
  const attempts = (doc.attempts ?? 0) + 1
  if (attempts > opts.otp.maxAttempts) {
    await patch(ctx, doc.id, { status: 'failed', attempts })
    throw new AIError('validation', INVALID_CODE)
  }
  if (!sameHash(hashCode(services, doc.salt, input.code.trim()), doc.codeHash)) {
    await patch(ctx, doc.id, { attempts, status: attempts >= opts.otp.maxAttempts ? 'failed' : 'pending' })
    throw new AIError('validation', INVALID_CODE)
  }
  const now = Date.now()
  await patch(ctx, doc.id, {
    status: 'verified',
    attempts,
    codeHash: null,
    verifiedAt: new Date(now).toISOString(),
    verifiedUntil: new Date(now + VERIFIED_FOR_MS).toISOString(),
  })
  await services.audit.log({ action: 'assistant.verify.confirm', meta: { conversationId: input.conversationId } }, ctx)
  return { ok: true, verified: true, conversationId: input.conversationId }
}
