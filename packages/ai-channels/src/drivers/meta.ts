import { LIMITS, WINDOW_MS } from '../constants'
import type { MessengerOptions, WhatsAppOptions } from '../options'
import { postJson } from './http'
import { env, safeEqual, verifyMetaSignature } from './signature'
import type { ChannelDriver, InboundMedia, InboundMessage, WebhookRequest } from './types'
import { ChannelSendError } from './types'

type EnvSource = Record<string, string | undefined>

const DEFAULT_GRAPH = 'v21.0'

/** Meta GET subscription handshake. */
const metaChallenge = (query: URLSearchParams, verifyToken: string | undefined): string | null => {
  const mode = query.get('hub.mode')
  const token = query.get('hub.verify_token')
  const challenge = query.get('hub.challenge')
  if (mode !== 'subscribe' || !token || !challenge || !verifyToken) return null
  return safeEqual(token, verifyToken) ? challenge : null
}

const verifyMeta = async (req: WebhookRequest, secret: string | undefined) =>
  verifyMetaSignature(req.rawBody, req.headers.get('x-hub-signature-256'), secret)
    ? ({ ok: true } as const)
    : ({ ok: false, reason: secret ? 'bad_signature' : 'missing_app_secret' } as const)

const parseJson = (raw: string): any => {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/* ---------------- WhatsApp Cloud API ---------------- */

const whatsappText = (m: any): { text: string; media?: InboundMedia[] } => {
  switch (m.type) {
    case 'text':
      return { text: String(m.text?.body ?? '') }
    case 'button':
      return { text: String(m.button?.text ?? m.button?.payload ?? '') }
    case 'interactive':
      return { text: String(m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '') }
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'sticker': {
      const x = m[m.type] ?? {}
      return {
        text: String(x.caption ?? ''),
        media: [{ type: m.type, id: x.id, mimeType: x.mime_type, caption: x.caption }],
      }
    }
    case 'location':
      return { text: `[location ${m.location?.latitude},${m.location?.longitude}]` }
    default:
      return { text: '' }
  }
}

export const createWhatsAppDriver = (opts: WhatsAppOptions, source: EnvSource = process.env): ChannelDriver => {
  const graph = `https://graph.facebook.com/${opts.graphVersion ?? DEFAULT_GRAPH}`
  const creds = () => {
    const phoneNumberId = env(opts.phoneNumberIdEnv, source)
    const token = env(opts.accessTokenEnv, source)
    if (!phoneNumberId || !token) throw new ChannelSendError('WhatsApp credentials are not configured', { transient: false })
    return { url: `${graph}/${phoneNumberId}/messages`, headers: { authorization: `Bearer ${token}` } }
  }
  return {
    name: 'whatsapp',
    maxLength: LIMITS.whatsapp,
    windowMs: WINDOW_MS,
    verifyRequest: (req) => verifyMeta(req, env(opts.appSecretEnv, source)),
    verifyChallenge: (q) => metaChallenge(q, env(opts.verifyTokenEnv, source)),
    async parseInbound(req) {
      const body = parseJson(req.rawBody)
      if (body?.object !== 'whatsapp_business_account') return []
      const out: InboundMessage[] = []
      const ownNumber = env(opts.phoneNumberIdEnv, source)
      for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
          const value = change.value ?? {}
          if (ownNumber && value.metadata?.phone_number_id && value.metadata.phone_number_id !== ownNumber) continue
          for (const m of value.messages ?? []) {
            if (!m?.id || !m?.from) continue
            const { text, media } = whatsappText(m)
            out.push({
              externalMessageId: String(m.id),
              externalUserId: String(m.from),
              text,
              timestamp: new Date(Number(m.timestamp) * 1000 || Date.now()).toISOString(),
              ...(media ? { media } : {}),
            })
          }
        }
      }
      return out
    },
    async send(envelope, deps) {
      const { url, headers } = creds()
      const res = await postJson(
        deps.fetch,
        url,
        { messaging_product: 'whatsapp', recipient_type: 'individual', to: envelope.to, type: 'text', text: { body: envelope.text, preview_url: false } },
        headers,
      )
      return { providerMessageId: res?.messages?.[0]?.id }
    },
    sendTemplate: opts.templates?.reengage
      ? async (to, deps) => {
          const t = opts.templates!.reengage
          const { url, headers } = creds()
          const res = await postJson(
            deps.fetch,
            url,
            { messaging_product: 'whatsapp', to, type: 'template', template: { name: t.name, language: { code: t.language } } },
            headers,
          )
          return { providerMessageId: res?.messages?.[0]?.id, template: t.name }
        }
      : undefined,
  }
}

/* ---------------- Messenger Send API ---------------- */

export const createMessengerDriver = (opts: MessengerOptions, source: EnvSource = process.env): ChannelDriver => {
  const graph = `https://graph.facebook.com/${opts.graphVersion ?? DEFAULT_GRAPH}`
  return {
    name: 'messenger',
    maxLength: LIMITS.messenger,
    windowMs: WINDOW_MS,
    verifyRequest: (req) => verifyMeta(req, env(opts.appSecretEnv, source)),
    verifyChallenge: (q) => metaChallenge(q, env(opts.verifyTokenEnv, source)),
    async parseInbound(req) {
      const body = parseJson(req.rawBody)
      if (body?.object !== 'page') return []
      const out: InboundMessage[] = []
      for (const entry of body.entry ?? []) {
        for (const ev of entry.messaging ?? []) {
          const sender = ev.sender?.id
          if (!sender) continue
          const ts = new Date(Number(ev.timestamp) || Date.now()).toISOString()
          if (ev.message && !ev.message.is_echo && ev.message.mid) {
            const media: InboundMedia[] = (ev.message.attachments ?? []).map((a: any) => ({ type: String(a.type), url: a.payload?.url }))
            out.push({
              externalMessageId: String(ev.message.mid),
              externalUserId: String(sender),
              text: String(ev.message.quick_reply?.payload && !ev.message.text ? ev.message.quick_reply.payload : (ev.message.text ?? '')),
              timestamp: ts,
              ...(media.length ? { media } : {}),
            })
          } else if (ev.postback) {
            out.push({
              externalMessageId: String(ev.postback.mid ?? `postback:${sender}:${ev.timestamp}`),
              externalUserId: String(sender),
              text: String(ev.postback.title ?? ev.postback.payload ?? ''),
              timestamp: ts,
            })
          }
        }
      }
      return out
    },
    async send(envelope, deps) {
      const token = env(opts.pageAccessTokenEnv, source)
      if (!token) throw new ChannelSendError('Messenger page token is not configured', { transient: false })
      const res = await postJson(
        deps.fetch,
        `${graph}/me/messages?access_token=${encodeURIComponent(token)}`,
        { recipient: { id: envelope.to }, messaging_type: 'RESPONSE', message: { text: envelope.text } },
      )
      return { providerMessageId: res?.message_id }
    },
  }
}
