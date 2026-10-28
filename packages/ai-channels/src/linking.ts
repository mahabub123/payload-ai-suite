import { randomInt } from 'node:crypto'
import { updateIdentity, type IdentityDoc } from './db'
import { safeEqual } from './drivers/signature'
import type { ChannelRuntime } from './runtime'
import { systemAdapterCtx } from './runtime'

export const LINK_TEXT = {
  askEmail: 'To link this chat to your account, reply with the email address on your account. We will email you a 6-digit code.',
  sent: (ttl: number) =>
    `If that email belongs to an account, we've sent it a 6-digit code. Reply with the code here to link this chat. It expires in ${ttl} minutes.`,
  expired: 'That code has expired. Reply with your email address to get a new one.',
  tooMany: 'Too many wrong codes. Reply with your email address to get a new one.',
  wrong: (left: number) => `That code isn't right. You have ${left} ${left === 1 ? 'try' : 'tries'} left.`,
  linked: 'Thanks! This chat is now linked to your account. You can ask about your orders here.',
  unlinked: 'This chat is no longer linked to your account.',
}

const CLEAR = {
  pendingCodeHash: null,
  pendingCodeExpiresAt: null,
  pendingCodeAttempts: null,
  pendingCustomerId: null,
} as const

/** Resend cooldown: repeated link requests inside this window don't send another email. */
const COOLDOWN_MS = 60_000

const ttlMinutes = (rt: ChannelRuntime) => rt.options.linkCodeTtlMinutes ?? 10
const maxAttempts = (rt: ChannelRuntime) => rt.options.linkMaxAttempts ?? 5

export const hashCode = (rt: Pick<ChannelRuntime, 'services'>, identityId: string | number, code: string): string =>
  rt.services.crypto.hashId(`ai-channels-otp:${identityId}:${code}`)

export const isCodeMessage = (text: string): string | undefined => /^\s*(\d{6})\s*$/.exec(text)?.[1]

/**
 * Start linking: always answer with the same text so the reply never reveals whether the email exists.
 * A code is generated and stored (hashed) either way; it is only emailed when the account exists.
 */
export const startLink = async (
  rt: ChannelRuntime,
  identity: IdentityDoc,
  email: string,
  tenant?: string | number,
): Promise<string> => {
  const now = rt.now()
  const reply = LINK_TEXT.sent(ttlMinutes(rt))
  if (identity.lastLinkRequestAt && now.getTime() - new Date(identity.lastLinkRequestAt).getTime() < COOLDOWN_MS) return reply

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const customer = await rt.services.adapters.customer?.findByEmail(email, systemAdapterCtx(rt, tenant)).catch(() => null)
  await updateIdentity(rt.db, identity.id, {
    pendingCodeHash: hashCode(rt, identity.id, code),
    pendingCodeExpiresAt: new Date(now.getTime() + ttlMinutes(rt) * 60_000).toISOString(),
    pendingCodeAttempts: 0,
    pendingCustomerId: customer?.id ? String(customer.id) : null,
    lastLinkRequestAt: now.toISOString(),
  })
  if (customer?.email) {
    try {
      await rt.payload.sendEmail({
        to: customer.email,
        subject: 'Your verification code',
        text:
          `Your code to link your ${identity.channel} chat to your account is ${code}.\n\n` +
          `It expires in ${ttlMinutes(rt)} minutes. If you didn't ask for this, you can ignore this email.`,
      })
    } catch (e) {
      rt.payload.logger?.error?.({ err: e, msg: '[ai-channels] failed to send link code email' })
    }
  }
  await rt.services.audit.log(
    { action: 'channels.link.requested', target: { collection: 'ai-channel-identities', id: identity.id } },
    { payload: rt.payload, tenant, requestId: `link-${identity.id}`, actor: { kind: 'system', roles: [] } },
  )
  return reply
}

/** Check a 6-digit code against the pending one. Returns the reply text. */
export const verifyLinkCode = async (
  rt: ChannelRuntime,
  identity: IdentityDoc,
  code: string,
  tenant?: string | number,
): Promise<{ reply: string; linked: boolean }> => {
  const now = rt.now()
  if (!identity.pendingCodeHash || !identity.pendingCodeExpiresAt) return { reply: LINK_TEXT.askEmail, linked: false }
  if (new Date(identity.pendingCodeExpiresAt).getTime() < now.getTime()) {
    await updateIdentity(rt.db, identity.id, CLEAR)
    return { reply: LINK_TEXT.expired, linked: false }
  }
  const attempts = identity.pendingCodeAttempts ?? 0
  if (attempts >= maxAttempts(rt)) {
    await updateIdentity(rt.db, identity.id, CLEAR)
    return { reply: LINK_TEXT.tooMany, linked: false }
  }
  const matches = safeEqual(hashCode(rt, identity.id, code), identity.pendingCodeHash)
  if (!matches || !identity.pendingCustomerId) {
    const used = attempts + 1
    if (used >= maxAttempts(rt)) {
      await updateIdentity(rt.db, identity.id, CLEAR)
      return { reply: LINK_TEXT.tooMany, linked: false }
    }
    await updateIdentity(rt.db, identity.id, { pendingCodeAttempts: used })
    return { reply: LINK_TEXT.wrong(maxAttempts(rt) - used), linked: false }
  }
  await updateIdentity(rt.db, identity.id, {
    ...CLEAR,
    customerId: identity.pendingCustomerId,
    verifiedAt: now.toISOString(),
  })
  identity.customerId = identity.pendingCustomerId
  identity.verifiedAt = now.toISOString()
  await rt.services.audit.log(
    { action: 'channels.link.verified', target: { collection: 'ai-channel-identities', id: identity.id } },
    { payload: rt.payload, tenant, requestId: `link-${identity.id}`, actor: { kind: 'system', roles: [] } },
  )
  return { reply: LINK_TEXT.linked, linked: true }
}

export const unlink = async (rt: ChannelRuntime, identity: IdentityDoc): Promise<string> => {
  await updateIdentity(rt.db, identity.id, { ...CLEAR, customerId: null, verifiedAt: null, conversationId: null, pendingActions: [] })
  return LINK_TEXT.unlinked
}
