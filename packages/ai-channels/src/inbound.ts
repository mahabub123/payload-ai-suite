import { randomBytes, randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
import type { Card } from '@payload-ai-suite/ai-core'
import { AIError } from '@payload-ai-suite/ai-core'
import { IDENTITIES, MESSAGES, TASK_INBOUND, TASK_SEND } from './constants'
import {
  dbOf,
  getMessage,
  isUniqueViolation,
  updateIdentity,
  updateMessage,
  type IdentityDoc,
  type MessageDoc,
  type PendingAction,
} from './db'
import type { InboundMessage, WebhookRequest } from './drivers'
import { normalizeSubject, parseLinkEmail, replySubject } from './email'
import { isCodeMessage, LINK_TEXT, startLink, unlink, verifyLinkCode } from './linking'
import type { ChannelName } from './options'
import { renderReply } from './render'
import type { ChannelRuntime } from './runtime'
import { buildChannelContext, isVerified, queueTask, systemAdapterCtx, tenantOf } from './runtime'

export const TEXT = {
  busy: "Sorry, I can't answer automatically right now. A team member will get back to you, or you can contact us on our website.",
  failed: "Sorry, I couldn't check that right now. Please try again in a moment, or ask for a team member.",
  mediaOnly: 'Thanks! I can only read text messages here. Please describe what you need in a message.',
  badCode: "That confirmation code isn't valid or has expired.",
  staffOnly: 'That action needs a team member. We have passed it on.',
  confirmed: (title: string) => `Done: ${title}.`,
  confirmFailed: "Sorry, that didn't go through. Please try again later or ask for a team member.",
  cancelled: 'OK, cancelled.',
}

/* ---------------- Webhook ingest (fast path) ---------------- */

export interface IngestResult {
  status: number
  accepted: number
  duplicates: number
  reason?: string
}

/**
 * Verify the signature over the raw body, normalize, dedupe by (channel, externalMessageId) and queue
 * one inbound job per new message. Never runs the assistant inline.
 */
export const ingestWebhook = async (
  rt: ChannelRuntime,
  channel: ChannelName,
  req: WebhookRequest,
  tenant?: string | number,
): Promise<IngestResult> => {
  const driver = rt.drivers.get(channel)
  if (!driver) return { status: 404, accepted: 0, duplicates: 0, reason: 'channel_not_enabled' }
  const v = await driver.verifyRequest(req, rt.now())
  if (!v.ok) return { status: 401, accepted: 0, duplicates: 0, reason: v.reason }
  const messages = await driver.parseInbound(req)
  let accepted = 0
  let duplicates = 0
  for (const m of messages) {
    const row = await recordInbound(rt, channel, m, tenant)
    if (!row) {
      duplicates++
      continue
    }
    await queueTask(rt.payload, TASK_INBOUND, { messageId: String(row.id) })
    accepted++
  }
  return { status: 200, accepted, duplicates }
}

/** Insert the inbound row; returns null when this message id was already seen. */
const recordInbound = async (
  rt: ChannelRuntime,
  channel: ChannelName,
  m: InboundMessage,
  tenant?: string | number,
): Promise<MessageDoc | null> => {
  const existing = await rt.db.find({
    collection: MESSAGES,
    where: { channel: { equals: channel }, externalMessageId: { equals: m.externalMessageId } },
    limit: 1,
    overrideAccess: true,
    depth: 0,
  })
  if (existing.docs.length) return null
  try {
    return await rt.db.create({
      collection: MESSAGES,
      overrideAccess: true,
      depth: 0,
      data: {
        channel,
        externalMessageId: m.externalMessageId,
        direction: 'in',
        status: 'received',
        senderEnc: rt.services.crypto.encrypt(m.externalUserId),
        text: m.text,
        threadKey: m.email ? normalizeSubject(m.email.subject) : null,
        meta: { timestamp: m.timestamp, ...(m.media ? { media: m.media } : {}), ...(m.email ? { email: m.email } : {}) },
        tenantRef: tenant == null ? null : String(tenant),
      },
    })
  } catch (e) {
    if (isUniqueViolation(e)) return null
    throw e
  }
}

/* ---------------- Identity ---------------- */

export const resolveIdentity = async (
  rt: ChannelRuntime,
  channel: ChannelName,
  externalUserId: string,
  tenant?: string | number,
): Promise<IdentityDoc> => {
  const externalIdHash = rt.services.crypto.hashId(`${channel}:${externalUserId}`)
  const find = async () =>
    (
      await rt.db.find({
        collection: IDENTITIES,
        where: { channel: { equals: channel }, externalIdHash: { equals: externalIdHash } },
        limit: 1,
        overrideAccess: true,
        depth: 0,
      })
    ).docs[0] as IdentityDoc | undefined
  const found = await find()
  if (found) return found
  try {
    return await rt.db.create({
      collection: IDENTITIES,
      overrideAccess: true,
      depth: 0,
      data: {
        channel,
        externalIdHash,
        externalIdEnc: rt.services.crypto.encrypt(externalUserId),
        pendingActions: [],
        tenantRef: tenant == null ? null : String(tenant),
      },
    })
  } catch (e) {
    const again = isUniqueViolation(e) ? await find() : undefined
    if (again) return again
    throw e
  }
}

/** Email: the sender address maps straight to a customer. Replies only ever go back to that address. */
const mapEmailSender = async (rt: ChannelRuntime, identity: IdentityDoc, address: string, tenant?: string | number) => {
  if (isVerified(identity)) return
  const customer = await rt.services.adapters.customer?.findByEmail(address, systemAdapterCtx(rt, tenant)).catch(() => null)
  if (!customer?.id) return
  const verifiedAt = rt.now().toISOString()
  await updateIdentity(rt.db, identity.id, { customerId: String(customer.id), verifiedAt })
  identity.customerId = String(customer.id)
  identity.verifiedAt = verifiedAt
}

/* ---------------- Inbound job ---------------- */

interface Reply {
  text: string
  cards?: Card[]
  conversationId?: string
  confirmCodes?: Record<string, string>
}

export interface InboundJobResult {
  status: 'missing' | 'duplicate' | 'ignored' | 'replied'
  replyId?: string
}

const findReplyRow = async (rt: ChannelRuntime, channel: string, inboundExternalId: string): Promise<MessageDoc | undefined> =>
  (
    await rt.db.find({
      collection: MESSAGES,
      where: { channel: { equals: channel }, direction: { equals: 'out' }, replyTo: { equals: inboundExternalId } },
      limit: 1,
      overrideAccess: true,
      depth: 0,
    })
  ).docs[0]

/** Job body for `ai-channels-inbound`. Idempotent: a processed message is never answered twice. */
export const processInbound = async (rt: ChannelRuntime, messageId: string): Promise<InboundJobResult> => {
  const row = await getMessage(rt.db, messageId)
  if (!row || row.direction !== 'in') return { status: 'missing' }
  if (row.status === 'processed' || row.status === 'ignored') return { status: 'duplicate' }
  const channel = row.channel
  const tenant = tenantOf(row.tenantRef)

  const already = await findReplyRow(rt, channel, row.externalMessageId)
  if (already) {
    await updateMessage(rt.db, row.id, { status: 'processed' })
    if (already.status === 'queued') await queueTask(rt.payload, TASK_SEND, { messageId: String(already.id) })
    return { status: 'duplicate', replyId: String(already.id) }
  }

  const driver = rt.drivers.get(channel)
  if (!driver || !row.senderEnc) {
    await updateMessage(rt.db, row.id, { status: 'ignored', reason: driver ? 'missing_sender' : 'channel_not_enabled' })
    return { status: 'ignored' }
  }
  await updateMessage(rt.db, row.id, { status: 'processing', attempts: (row.attempts ?? 0) + 1 })

  const externalUserId = rt.services.crypto.decrypt(row.senderEnc)
  const identity = await resolveIdentity(rt, channel, externalUserId, tenant)
  const ts = String(row.meta?.timestamp ?? rt.now().toISOString())
  if (!identity.lastInboundAt || new Date(ts) > new Date(identity.lastInboundAt)) {
    await updateIdentity(rt.db, identity.id, { lastInboundAt: ts })
    identity.lastInboundAt = ts
  }
  if (channel === 'email') await mapEmailSender(rt, identity, externalUserId, tenant)

  const reply = await handleMessage(rt, row, identity, tenant)
  const out = await createReply(rt, row, identity, reply, tenant)
  await updateMessage(rt.db, row.id, {
    status: 'processed',
    identity: String(identity.id),
    conversationId: reply.conversationId ?? row.conversationId ?? null,
    senderEnc: null,
  })
  if (out) await queueTask(rt.payload, TASK_SEND, { messageId: String(out.id) })
  return { status: 'replied', replyId: out ? String(out.id) : undefined }
}

const handleMessage = async (rt: ChannelRuntime, row: MessageDoc, identity: IdentityDoc, tenant?: string | number): Promise<Reply> => {
  const channel = row.channel
  const text = (row.text ?? '').trim()
  if (!text) return { text: TEXT.mediaOnly }

  const code = isCodeMessage(text)
  if (code && identity.pendingCodeHash) return { text: (await verifyLinkCode(rt, identity, code, tenant)).reply }

  const yesNo = /^\s*(yes|no)\s+([a-z0-9]{4,8})\s*$/i.exec(text)
  if (yesNo) return { text: await handleConfirmation(rt, row, identity, yesNo[1].toLowerCase() === 'yes', yesNo[2].toUpperCase(), tenant) }

  if (channel !== 'email') {
    if (/^\s*unlink\s*$/i.test(text)) return { text: await unlink(rt, identity) }
    if (/^\s*link\s*$/i.test(text)) return { text: LINK_TEXT.askEmail }
    const email = parseLinkEmail(text)
    if (email) return { text: await startLink(rt, identity, email, tenant) }
  }
  return runTurn(rt, row, identity, text, tenant)
}

/* ---------------- Confirm-tier actions via "YES <code>" ---------------- */

const activeActions = (identity: IdentityDoc, now: Date): PendingAction[] =>
  (identity.pendingActions ?? []).filter((a) => new Date(a.expiresAt).getTime() > now.getTime())

const newCode = () =>
  Array.from(randomBytes(6))
    .map((b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32])
    .join('')

export const handleConfirmation = async (
  rt: ChannelRuntime,
  row: MessageDoc,
  identity: IdentityDoc,
  yes: boolean,
  code: string,
  tenant?: string | number,
): Promise<string> => {
  const now = rt.now()
  const active = activeActions(identity, now)
  const entry = active.find((a) => a.code === code)
  if (!entry) return TEXT.badCode
  if (!isVerified(identity)) return LINK_TEXT.askEmail
  const remaining = active.filter((a) => a !== entry)
  await updateIdentity(rt.db, identity.id, { pendingActions: remaining })
  identity.pendingActions = remaining

  // Channel actors never reach staff-tier tools, even via a forged/stale action id.
  const tool = rt.services.tools.get(entry.tool)
  if (!tool || tool.tier === 'staff') return TEXT.staffOnly

  const ctx = buildChannelContext(rt, identity, row.channel, tenant)
  try {
    if (!yes) {
      await rt.services.actions.reject(entry.actionId, ctx)
      return TEXT.cancelled
    }
    // Idempotency key = the channel message id: a redelivered "YES" never runs the action twice.
    const rec = await rt.services.actions.confirm(entry.actionId, `${row.channel}:${row.externalMessageId}`, ctx)
    if (rec.status === 'done') {
      const msg = (rec.result as { message?: unknown } | undefined)?.message
      return [TEXT.confirmed(rec.title), typeof msg === 'string' ? msg : ''].filter(Boolean).join('\n')
    }
    return TEXT.confirmFailed
  } catch (e) {
    rt.payload.logger?.warn?.({ err: e, msg: '[ai-channels] confirm failed' })
    return e instanceof AIError && (e.code === 'conflict' || e.code === 'not_found') ? TEXT.badCode : TEXT.confirmFailed
  }
}

/* ---------------- Assistant turn ---------------- */

const resolveEmailConversation = async (rt: ChannelRuntime, row: MessageDoc, identity: IdentityDoc): Promise<string | undefined> => {
  const email = row.meta?.email as InboundMessage['email'] | undefined
  const ids = [...(email?.references ?? []), ...(email?.inReplyTo ? [email.inReplyTo] : [])]
  if (ids.length) {
    const r = await rt.db.find({
      collection: MESSAGES,
      where: { channel: { equals: 'email' }, externalMessageId: { in: ids }, conversationId: { exists: true } },
      limit: 1,
      overrideAccess: true,
      depth: 0,
    })
    const hit = r.docs.find((d: MessageDoc) => d.conversationId && d.identity === String(identity.id))
    if (hit) return hit.conversationId!
  }
  if (row.threadKey) {
    const r = await rt.db.find({
      collection: MESSAGES,
      where: { channel: { equals: 'email' }, identity: { equals: String(identity.id) }, threadKey: { equals: row.threadKey } },
      sort: '-createdAt',
      limit: 5,
      overrideAccess: true,
      depth: 0,
    })
    const hit = r.docs.find((d: MessageDoc) => d.conversationId)
    if (hit) return hit.conversationId!
  }
  return undefined
}

const runTurn = async (rt: ChannelRuntime, row: MessageDoc, identity: IdentityDoc, message: string, tenant?: string | number): Promise<Reply> => {
  const channel = row.channel
  const ctx = buildChannelContext(rt, identity, channel, tenant)
  try {
    await rt.services.budgets.assert(ctx)
  } catch (e) {
    if (e instanceof AIError && e.code === 'budget_exceeded') return { text: TEXT.busy }
    throw e
  }
  const priorConversation = channel === 'email' ? await resolveEmailConversation(rt, row, identity) : (identity.conversationId ?? undefined)

  const collectTurn = async (conversationId?: string) => {
    let text = ''
    let convo = conversationId
    let error: string | undefined
    const cards: Card[] = []
    for await (const ev of rt.runTurn({ ctx, conversationId, message, channel })) {
      if (ev.type === 'meta' && ev.conversationId) convo = ev.conversationId
      else if (ev.type === 'text') text += ev.delta
      else if (ev.type === 'card') cards.push(ev.card)
      else if (ev.type === 'error') error = ev.code
    }
    return { text, cards, conversationId: convo, error }
  }

  let turn: Awaited<ReturnType<typeof collectTurn>>
  try {
    turn = await collectTurn(priorConversation)
  } catch (e) {
    const stale = e instanceof AIError && (e.code === 'forbidden' || e.code === 'not_found') && priorConversation
    if (!stale) {
      rt.payload.logger?.error?.({ err: e, msg: '[ai-channels] assistant turn failed' })
      return { text: TEXT.failed }
    }
    try {
      turn = await collectTurn(undefined)
    } catch (e2) {
      rt.payload.logger?.error?.({ err: e2, msg: '[ai-channels] assistant turn failed' })
      return { text: TEXT.failed }
    }
  }

  if (turn.conversationId && channel !== 'email' && turn.conversationId !== identity.conversationId) {
    await updateIdentity(rt.db, identity.id, { conversationId: turn.conversationId })
    identity.conversationId = turn.conversationId
  }

  // Confirmation cards get a short code the user replies with ("YES ABC123").
  const confirmCodes: Record<string, string> = {}
  const newActions: PendingAction[] = []
  for (const c of turn.cards) {
    if (c.type !== 'confirmation') continue
    const code = newCode()
    confirmCodes[c.actionId] = code
    newActions.push({ code, actionId: c.actionId, tool: c.tool, expiresAt: c.expiresAt })
  }
  if (newActions.length) {
    const pendingActions = [...activeActions(identity, rt.now()), ...newActions].slice(-5)
    await updateIdentity(rt.db, identity.id, { pendingActions })
    identity.pendingActions = pendingActions
  }

  // Verified identities never need the link prompt.
  const cards = turn.cards.filter((c) => !(c.type === 'verify' && isVerified(identity)))
  const text = turn.text.trim() || (turn.error ? (turn.error === 'budget_exceeded' ? TEXT.busy : TEXT.failed) : '')
  return { text, cards, conversationId: turn.conversationId, confirmCodes }
}

/* ---------------- Outbound row ---------------- */

const emailDomain = (rt: ChannelRuntime): string => {
  const from = rt.options.email ? rt.options.email.replyFrom : ''
  return /@([A-Z0-9.-]+)/i.exec(from)?.[1] ?? 'ai-channels.local'
}

const createReply = async (
  rt: ChannelRuntime,
  row: MessageDoc,
  identity: IdentityDoc,
  reply: Reply,
  tenant?: string | number,
): Promise<MessageDoc | null> => {
  const locale = rt.services.systemContext(rt.payload, { module: 'channels', tenant }).locale
  const text = renderReply(reply.text, reply.cards ?? [], { locale, confirmCodes: reply.confirmCodes })
  if (!text) return null
  const isEmail = row.channel === 'email'
  const email = row.meta?.email as InboundMessage['email'] | undefined
  const externalMessageId = isEmail ? `<${randomUUID()}@${emailDomain(rt)}>` : `out:${randomUUID()}`
  return rt.db.create({
    collection: MESSAGES,
    overrideAccess: true,
    depth: 0,
    data: {
      channel: row.channel,
      externalMessageId,
      direction: 'out',
      status: 'queued',
      identity: String(identity.id),
      conversationId: reply.conversationId ?? null,
      replyTo: row.externalMessageId,
      threadKey: row.threadKey ?? null,
      text,
      partsSent: 0,
      attempts: 0,
      tenantRef: tenant == null ? null : String(tenant),
      meta: isEmail
        ? {
            subject: replySubject(email?.subject),
            inReplyTo: row.externalMessageId,
            references: [...(email?.references ?? []), row.externalMessageId].slice(-20),
          }
        : {},
    },
  })
}

/**
 * Queue a proactive message to a channel identity (e.g. a support agent's reply). Goes through the
 * same send job, so window rules (template outside 24 h) apply.
 */
export const queueChannelReply = async (
  payload: Payload,
  args: { identityId: string | number; text: string; cards?: Card[]; conversationId?: string; subject?: string },
): Promise<MessageDoc | null> => {
  const db = dbOf(payload)
  const identity = (await db.findByID({ collection: IDENTITIES, id: args.identityId, overrideAccess: true, depth: 0 })) as IdentityDoc
  const text = renderReply(args.text, args.cards ?? [])
  if (!text) return null
  const isEmail = identity.channel === 'email'
  const out = await db.create({
    collection: MESSAGES,
    overrideAccess: true,
    depth: 0,
    data: {
      channel: identity.channel,
      externalMessageId: isEmail ? `<${randomUUID()}@ai-channels.local>` : `out:${randomUUID()}`,
      direction: 'out',
      status: 'queued',
      identity: String(identity.id),
      conversationId: args.conversationId ?? identity.conversationId ?? null,
      text,
      partsSent: 0,
      attempts: 0,
      tenantRef: identity.tenantRef ?? null,
      meta: isEmail ? { subject: args.subject ?? 'Message from our team' } : {},
    },
  })
  await queueTask(payload, TASK_SEND, { messageId: String(out.id) })
  return out
}
