import { getIdentity, getMessage, updateMessage, type IdentityDoc, type MessageDoc } from './db'
import { ChannelSendError, type ChannelDriver, type OutboundEnvelope } from './drivers'
import { splitMessage } from './render'
import type { ChannelRuntime } from './runtime'

export const NO_TEMPLATE_REASON = 'outside_24h_window_no_template'
export const TEMPLATE_REASON = 'outside_24h_window_template'

export interface SendJobResult {
  status: 'missing' | 'sent' | 'skipped' | 'failed' | 'noop'
  reason?: string
}

/** In-process retry for transient failures (exponential backoff); the job's own retries cover longer outages. */
export const withRetry = async <T>(
  fn: () => Promise<T>,
  sleep: (ms: number) => Promise<void>,
  opts: { attempts?: number; baseMs?: number } = {},
): Promise<T> => {
  const attempts = opts.attempts ?? 3
  const base = opts.baseMs ?? 500
  for (let i = 0; ; i++) {
    try {
      return await fn()
    } catch (e) {
      if (!(e instanceof ChannelSendError) || !e.transient || i >= attempts - 1) throw e
      await sleep(base * 2 ** i)
    }
  }
}

export const isOutsideWindow = (driver: ChannelDriver, identity: Pick<IdentityDoc, 'lastInboundAt'>, now: Date): boolean => {
  if (!driver.windowMs) return false
  if (!identity.lastInboundAt) return true
  return now.getTime() - new Date(identity.lastInboundAt).getTime() > driver.windowMs
}

const envelopeFor = (row: MessageDoc, to: string, text: string, part: number): OutboundEnvelope => {
  if (row.channel !== 'email') return { to, text }
  const base = row.externalMessageId
  return {
    to,
    text,
    email: {
      subject: String(row.meta?.subject ?? 'Re: your message'),
      messageId: part === 0 ? base : base.replace('@', `.${part}@`),
      inReplyTo: row.meta?.inReplyTo,
      references: row.meta?.references,
    },
  }
}

/** Outside the window: send the approved re-engagement template, or skip with a recorded reason. */
const reengage = async (rt: ChannelRuntime, row: MessageDoc, driver: ChannelDriver, to: string): Promise<SendJobResult> => {
  if (!driver.sendTemplate) {
    await updateMessage(rt.db, row.id, { status: 'skipped', reason: NO_TEMPLATE_REASON })
    return { status: 'skipped', reason: NO_TEMPLATE_REASON }
  }
  try {
    const r = await withRetry(() => driver.sendTemplate!(to, { payload: rt.payload, fetch: rt.fetch }), rt.sleep)
    await updateMessage(rt.db, row.id, {
      status: 'sent',
      reason: TEMPLATE_REASON,
      sentAt: rt.now().toISOString(),
      providerMessageIds: r.providerMessageId ? [r.providerMessageId] : [],
      meta: { ...(row.meta ?? {}), template: r.template },
    })
    return { status: 'sent', reason: TEMPLATE_REASON }
  } catch (e) {
    return fail(rt, row, e)
  }
}

const fail = async (rt: ChannelRuntime, row: MessageDoc, e: unknown): Promise<SendJobResult> => {
  const transient = e instanceof ChannelSendError ? e.transient : true
  const error = (e as Error)?.message?.slice(0, 500) ?? String(e)
  if (transient) {
    await updateMessage(rt.db, row.id, { status: 'retrying', attempts: (row.attempts ?? 0) + 1, error })
    throw e // job retries with backoff
  }
  await updateMessage(rt.db, row.id, { status: 'failed', attempts: (row.attempts ?? 0) + 1, error })
  return { status: 'failed', reason: error }
}

/**
 * Job body for `ai-channels-send`. Idempotent: sent parts are tracked (`partsSent`) so a retry resumes
 * at the first unsent part and never double-sends.
 */
export const processSend = async (rt: ChannelRuntime, messageId: string): Promise<SendJobResult> => {
  const row = await getMessage(rt.db, messageId)
  if (!row || row.direction !== 'out') return { status: 'missing' }
  if (row.status === 'sent' || row.status === 'skipped' || row.status === 'failed') return { status: 'noop' }
  const driver = rt.drivers.get(row.channel)
  const identity = row.identity ? await getIdentity(rt.db, row.identity) : null
  if (!driver || !identity) {
    const reason = driver ? 'identity_missing' : 'channel_not_enabled'
    await updateMessage(rt.db, row.id, { status: 'failed', reason })
    return { status: 'failed', reason }
  }
  const to = rt.services.crypto.decrypt(identity.externalIdEnc)
  const start = row.partsSent ?? 0

  if (start === 0 && isOutsideWindow(driver, identity, rt.now())) return reengage(rt, row, driver, to)

  const parts = splitMessage(row.text ?? '', driver.maxLength)
  const ids = [...(row.providerMessageIds ?? [])]
  await updateMessage(rt.db, row.id, { status: 'sending' })
  for (let i = start; i < parts.length; i++) {
    try {
      const r = await withRetry(() => driver.send(envelopeFor(row, to, parts[i], i), { payload: rt.payload, fetch: rt.fetch }), rt.sleep)
      if (r.providerMessageId) ids.push(r.providerMessageId)
      await updateMessage(rt.db, row.id, { partsSent: i + 1, providerMessageIds: ids })
      row.partsSent = i + 1
    } catch (e) {
      if (e instanceof ChannelSendError && e.outsideWindow && i === 0) return reengage(rt, row, driver, to)
      return fail(rt, row, e)
    }
  }
  await updateMessage(rt.db, row.id, { status: 'sent', sentAt: rt.now().toISOString(), error: null })
  return { status: 'sent' }
}
