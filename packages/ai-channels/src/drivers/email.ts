import { LIMITS } from '../constants'
import {
  extractAddress,
  extractName,
  parseHeaderBlock,
  parseMessageIds,
  stripQuotedReply,
} from '../email'
import type { EmailChannelOptions } from '../options'
import { env, hmacSha256Hex, ReplayCache, safeEqual, verifyBasicAuth } from './signature'
import type { ChannelDriver, InboundMessage, VerifyResult, WebhookRequest } from './types'
import { ChannelSendError } from './types'

type EnvSource = Record<string, string | undefined>

/** Signed timestamps older/newer than this are rejected as replays. */
export const MAX_SKEW_MS = 5 * 60 * 1000

type Fields = Record<string, string>

/** Parse urlencoded or multipart form bodies (text parts only). */
export const parseForm = async (rawBody: string, contentType: string | null): Promise<Fields> => {
  const ct = contentType ?? ''
  const out: Fields = {}
  if (ct.includes('multipart/form-data')) {
    const fd = await new Response(rawBody, { headers: { 'content-type': ct } }).formData()
    fd.forEach((v, k) => {
      if (typeof v === 'string') out[k] = v
    })
    return out
  }
  new URLSearchParams(rawBody).forEach((v, k) => {
    out[k] = v
  })
  return out
}

const parseJson = (raw: string): any => {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const build = (o: {
  messageId?: string
  from?: string
  subject?: string
  text?: string
  stripped?: string
  inReplyTo?: string
  references?: string | string[]
  date?: string
}): InboundMessage[] => {
  const address = extractAddress(o.from)
  if (!address) return []
  const messageId = parseMessageIds(o.messageId)[0]
  if (!messageId) return []
  const ts = o.date ? new Date(o.date) : new Date()
  const body = o.stripped?.trim() ? o.stripped : (o.text ?? '')
  return [
    {
      externalMessageId: messageId,
      externalUserId: address,
      text: stripQuotedReply(body),
      timestamp: (Number.isNaN(ts.getTime()) ? new Date() : ts).toISOString(),
      email: {
        subject: o.subject ?? '',
        fromName: extractName(o.from),
        inReplyTo: parseMessageIds(o.inReplyTo)[0],
        references: parseMessageIds(o.references),
      },
    },
  ]
}

export const createEmailDriver = (opts: EmailChannelOptions, source: EnvSource = process.env): ChannelDriver => {
  const replay = new ReplayCache(MAX_SKEW_MS * 2)
  const secret = () => env(opts.signingSecretEnv, source)

  const verify = async (req: WebhookRequest, now = new Date()): Promise<VerifyResult> => {
    const key = secret()
    if (!key) return { ok: false, reason: 'missing_signing_secret' }
    switch (opts.provider) {
      case 'generic': {
        const ts = req.headers.get('x-timestamp')
        const sig = req.headers.get('x-signature')?.replace(/^sha256=/, '')
        if (!ts || !sig) return { ok: false, reason: 'missing_signature' }
        if (Math.abs(now.getTime() - Number(ts) * 1000) > MAX_SKEW_MS) return { ok: false, reason: 'stale_timestamp' }
        return safeEqual(sig.toLowerCase(), hmacSha256Hex(key, `${ts}.${req.rawBody}`))
          ? { ok: true }
          : { ok: false, reason: 'bad_signature' }
      }
      case 'postmark':
      case 'sendgrid':
        return verifyBasicAuth(req.headers.get('authorization'), key) ? { ok: true } : { ok: false, reason: 'bad_credentials' }
      case 'mailgun': {
        const f = await parseForm(req.rawBody, req.headers.get('content-type'))
        const { timestamp, token, signature } = f
        if (!timestamp || !token || !signature) return { ok: false, reason: 'missing_signature' }
        if (Math.abs(now.getTime() - Number(timestamp) * 1000) > MAX_SKEW_MS) return { ok: false, reason: 'stale_timestamp' }
        if (!safeEqual(signature.toLowerCase(), hmacSha256Hex(key, `${timestamp}${token}`))) return { ok: false, reason: 'bad_signature' }
        if (!replay.add(token, now.getTime())) return { ok: false, reason: 'replayed' }
        return { ok: true }
      }
    }
  }

  const parse = async (req: WebhookRequest): Promise<InboundMessage[]> => {
    switch (opts.provider) {
      case 'generic': {
        const b = parseJson(req.rawBody)
        if (!b) return []
        return build({
          messageId: b.messageId,
          from: b.from,
          subject: b.subject,
          text: b.text,
          inReplyTo: b.inReplyTo,
          references: b.references,
          date: b.date,
        })
      }
      case 'postmark': {
        const b = parseJson(req.rawBody)
        if (!b) return []
        const headers: Fields = {}
        for (const h of b.Headers ?? []) headers[String(h.Name).toLowerCase()] = String(h.Value)
        return build({
          messageId: headers['message-id'] ?? (b.MessageID ? `<${b.MessageID}@postmark>` : undefined),
          from: b.FromFull?.Email ? `${b.FromFull.Name ?? ''} <${b.FromFull.Email}>` : b.From,
          subject: b.Subject,
          text: b.TextBody,
          stripped: b.StrippedTextReply,
          inReplyTo: headers['in-reply-to'],
          references: headers['references'],
          date: b.Date,
        })
      }
      case 'sendgrid': {
        const f = await parseForm(req.rawBody, req.headers.get('content-type'))
        const h = parseHeaderBlock(f.headers)
        return build({
          messageId: h['message-id'],
          from: f.from,
          subject: f.subject,
          text: f.text,
          inReplyTo: h['in-reply-to'],
          references: h['references'],
          date: h['date'],
        })
      }
      case 'mailgun': {
        const f = await parseForm(req.rawBody, req.headers.get('content-type'))
        return build({
          messageId: f['Message-Id'] ?? f['message-id'],
          from: f.from ?? f.sender,
          subject: f.subject,
          text: f['body-plain'],
          stripped: f['stripped-text'],
          inReplyTo: f['In-Reply-To'],
          references: f['References'],
          date: f.Date,
        })
      }
    }
  }

  return {
    name: 'email',
    maxLength: LIMITS.email,
    verifyRequest: verify,
    parseInbound: parse,
    async send(envelope, deps) {
      if (!envelope.email) throw new ChannelSendError('Missing email envelope', { transient: false })
      try {
        await deps.payload.sendEmail({
          from: opts.replyFrom,
          to: envelope.to,
          subject: envelope.email.subject,
          text: envelope.text,
          messageId: envelope.email.messageId,
          inReplyTo: envelope.email.inReplyTo,
          references: envelope.email.references,
        })
      } catch (e) {
        const msg = (e as Error).message ?? String(e)
        // SMTP 5xx = permanent rejection; everything else (timeouts, 4xx greylisting) retried.
        const permanent = /\b5\d\d\b/.test(msg) && !/\b4\d\d\b/.test(msg)
        throw new ChannelSendError(`Email send failed: ${msg}`, { transient: !permanent })
      }
      return { providerMessageId: envelope.email.messageId }
    },
  }
}
