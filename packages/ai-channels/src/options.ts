export type ChannelName = 'whatsapp' | 'messenger' | 'email'

export const CHANNEL_NAMES: readonly ChannelName[] = ['whatsapp', 'messenger', 'email']

export interface WhatsAppOptions {
  /** Env var holding the WhatsApp Business phone number id. */
  phoneNumberIdEnv: string
  /** Env var holding the (system user) access token. */
  accessTokenEnv: string
  /** Env var holding the Meta app secret (X-Hub-Signature-256). */
  appSecretEnv: string
  /** Env var holding the verify token you typed into the Meta webhook setup. */
  verifyTokenEnv: string
  /** Approved templates used outside the 24-hour customer-service window. */
  templates?: { reengage: { name: string; language: string } }
  /** Graph API version, default 'v21.0'. */
  graphVersion?: string
}

export interface MessengerOptions {
  pageAccessTokenEnv: string
  appSecretEnv: string
  verifyTokenEnv: string
  graphVersion?: string
}

export type EmailProvider = 'generic' | 'postmark' | 'sendgrid' | 'mailgun'

export interface EmailChannelOptions {
  provider: EmailProvider
  /**
   * Env var with the webhook secret.
   * generic: HMAC key for `X-Signature` over `${X-Timestamp}.${rawBody}`;
   * postmark / sendgrid: `user:password` expected as HTTP Basic auth on the webhook URL;
   * mailgun: the HTTP webhook signing key.
   */
  signingSecretEnv: string
  /** From address for replies, e.g. 'Shop <support@example.com>'. */
  replyFrom: string
}

export interface AiChannelsOptions {
  whatsapp?: WhatsAppOptions | false
  messenger?: MessengerOptions | false
  email?: EmailChannelOptions | false
  /** One-time code lifetime for linking a channel to an account. Default 10 minutes. */
  linkCodeTtlMinutes?: number
  /** Wrong-code attempts before the pending code is discarded. Default 5. */
  linkMaxAttempts?: number
  /** Disable the whole module. */
  disabled?: boolean
}
