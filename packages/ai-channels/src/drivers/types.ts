import type { Payload } from 'payload'
import type { ChannelName } from '../options'

/** What a webhook request looks like to a driver. `rawBody` is the exact bytes as text. */
export interface WebhookRequest {
  rawBody: string
  headers: Headers
  query: URLSearchParams
}

export interface InboundMedia {
  type: string
  id?: string
  url?: string
  mimeType?: string
  caption?: string
}

/** A normalized inbound message. */
export interface InboundMessage {
  externalMessageId: string
  /** Phone number (WhatsApp), page-scoped id (Messenger), lower-cased address (email). */
  externalUserId: string
  text: string
  /** ISO timestamp from the provider. */
  timestamp: string
  media?: InboundMedia[]
  email?: {
    subject: string
    fromName?: string
    inReplyTo?: string
    references: string[]
  }
}

export interface OutboundEnvelope {
  /** Decrypted external user id (phone / PSID / address). */
  to: string
  text: string
  email?: { subject: string; messageId: string; inReplyTo?: string; references?: string[] }
}

export interface DriverDeps {
  payload: Payload
  fetch: typeof fetch
}

export type VerifyResult = { ok: true } | { ok: false; reason: string }

export interface ChannelDriver {
  name: ChannelName
  /** Max characters per outbound message; longer replies are split. */
  maxLength: number
  /** Free-form replies allowed only this long after the user's last inbound message (ms); undefined = no window. */
  windowMs?: number
  /** Verify the provider signature over the raw body. */
  verifyRequest(req: WebhookRequest, now?: Date): Promise<VerifyResult>
  /** Meta GET subscription challenge: returns hub.challenge when the verify token matches, else null. */
  verifyChallenge?(query: URLSearchParams): string | null
  parseInbound(req: WebhookRequest): Promise<InboundMessage[]>
  send(envelope: OutboundEnvelope, deps: DriverDeps): Promise<{ providerMessageId?: string }>
  /** Out-of-window re-engagement (approved template). Undefined when none is configured. */
  sendTemplate?(to: string, deps: DriverDeps): Promise<{ providerMessageId?: string; template: string }>
}

/** Thrown by drivers on send failure. `transient` failures are retried with backoff. */
export class ChannelSendError extends Error {
  readonly transient: boolean
  readonly status?: number
  /** Provider says the user is outside the messaging window. */
  readonly outsideWindow: boolean
  constructor(message: string, opts: { transient: boolean; status?: number; outsideWindow?: boolean }) {
    super(message)
    this.name = 'ChannelSendError'
    this.transient = opts.transient
    this.status = opts.status
    this.outsideWindow = opts.outsideWindow ?? false
  }
}
