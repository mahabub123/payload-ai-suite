# payload-ai-channels

The same shopping assistant on **WhatsApp Business**, **Facebook Messenger** and **email**, with one history per customer.

```ts
import { aiChannels, type AiChannelsOptions } from 'payload-ai-channels'

plugins: [
  aiCore({ ... }),
  aiAssistant({ ... }),
  aiChannels({
    whatsapp: {
      phoneNumberIdEnv: 'WHATSAPP_PHONE_NUMBER_ID',
      accessTokenEnv: 'WHATSAPP_ACCESS_TOKEN',
      appSecretEnv: 'META_APP_SECRET',
      verifyTokenEnv: 'WHATSAPP_VERIFY_TOKEN',
      templates: { reengage: { name: 'reengage_v1', language: 'en_US' } }, // optional
    },
    messenger: { pageAccessTokenEnv: 'MESSENGER_PAGE_TOKEN', appSecretEnv: 'META_APP_SECRET', verifyTokenEnv: 'MESSENGER_VERIFY_TOKEN' },
    email: { provider: 'postmark', signingSecretEnv: 'INBOUND_EMAIL_SECRET', replyFrom: 'Shop <help@shop.example>' },
  }),
]
```

Every channel is optional; pass `false` or leave it out to switch it off.

## How it works

1. `GET|POST /api/ai/channels/:channel/webhook` (`:channel` = `whatsapp` | `messenger` | `email`).
   The POST reads the **raw body** and checks the provider signature over those exact bytes. A bad signature gets `401`.
   Each message is stored once in `ai-channel-messages`, which has a unique index on `(channel, externalMessageId)`. One
   `ai-channels-inbound` job is queued per new message and the endpoint answers `200` at once. When a provider sends the
   same message again (a retry or a replayed request), nothing new is queued.
2. **`ai-channels-inbound` job.** It finds or creates the `ai-channel-identities` row. The external id is stored as
   `hashId` (for joining) and encrypted (so we can reply). It then updates `lastInboundAt` and builds an `AIContext`:
   - actor `{ kind: 'channel', roles: [], channel: { name, externalIdHash, verified }, customerId? }`
   - surface `'channel'`

   It runs `runAssistantTurn` from `payload-ai-assistant`, using one conversation per identity. For email, the
   conversation is one per thread. The module budget is checked for each message. When the budget is spent, the user gets
   a polite "busy" reply. Channel actors have no suite roles, so staff-tier tools are never offered to them.
3. **`ai-channels-send` job.** It joins the assistant's text with the cards rendered as plain text. Prices, stock and
   order data come from the card data, never from the model's text. Replies are split to fit each channel's limit:
   WhatsApp 4096 characters, Messenger 2000. Transient failures (HTTP 429, 5xx, network errors) are retried with
   exponential backoff, first inside the job and then through the job's own retries. Permanent failures are recorded as
   `failed`. Parts already sent are tracked, so a retry never sends them twice.
4. **24-hour window (WhatsApp, Messenger).** If the user's last message is more than 24 hours old, WhatsApp sends the
   configured approved template instead of free text. When no template is configured, the send is skipped and the
   reason `outside_24h_window_no_template` is recorded. Messenger has no template, so it is always skipped in that case.

### Linking a chat to a customer account

Looking up orders needs a verified identity. A user links their chat by sending `link`, or by sending their account
email address. The assistant also prompts them when it returns a `verify` card.

- A 6-digit code is emailed (`payload.sendEmail`) to the address on the account. The account is found with the customer
  adapter's `findByEmail`.
- The chat reply is the same whether or not the email exists.
- The code is stored hashed. It expires after 10 minutes (`linkCodeTtlMinutes`) and is discarded after 5 wrong tries
  (`linkMaxAttempts`). A new code can be requested at most once a minute.
- `unlink` removes the link.

### Confirming actions

Some tools need confirmation, such as a return request. For these the reply says
`Reply YES K7P2QX to confirm or NO K7P2QX to cancel`. A `YES <code>` reply calls `services.actions.confirm`, using the
channel message id as the idempotency key, so a message the provider delivers twice never runs the action twice. To
confirm, the identity must be verified, and staff-tier actions are always refused.

### Email

The sender's address is matched to a customer with `findByEmail` and treated as verified. Replies only ever go back to
that same address, so a forged `From:` never shows the forger any account data. Confirmation codes are also sent only to
that address.

Quoted replies, `On … wrote:` blocks, Outlook headers and signatures are removed before the text reaches the assistant.
Threads are matched first by `References` / `In-Reply-To` and then by the subject without its `Re:` prefix. Replies go
out through `payload.sendEmail` (configure a Payload email adapter) with `In-Reply-To` and `References` set.

## Setup per channel

Your webhook base URL is `https://<your-site>/api/ai/channels/<channel>/webhook`.

### WhatsApp Business (Cloud API)

1. In Meta for Developers, create an app and add **WhatsApp**. Note the **Phone number ID**, and create a
   **System User access token** with the `whatsapp_business_messaging` permission.
2. Under **App settings → Basic**, copy the **App secret**.
3. Under **WhatsApp → Configuration → Webhook**, set:
   - Callback URL: `https://<site>/api/ai/channels/whatsapp/webhook`
   - Verify token: any random string, which must equal `WHATSAPP_VERIFY_TOKEN`

   Then subscribe to the **messages** field.
4. Optional: create and get approval for a re-engagement template, then set `templates.reengage`.
5. Set these env vars: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`.

### Messenger

1. In the same app or another one, add **Messenger** and connect your Page. Generate a **Page access token** with
   `pages_messaging`.
2. Under **Webhooks**, set:
   - Callback URL: `https://<site>/api/ai/channels/messenger/webhook`
   - Verify token: `MESSENGER_VERIFY_TOKEN`

   Then subscribe to `messages` and `messaging_postbacks`.
3. Set these env vars: `MESSENGER_PAGE_TOKEN`, `META_APP_SECRET`, `MESSENGER_VERIFY_TOKEN`.

### Email (inbound)

Point your provider's inbound webhook at `https://<site>/api/ai/channels/email/webhook`.

| provider   | how requests are authenticated | `signingSecretEnv` value |
|------------|--------------------------------|--------------------------|
| `postmark` | Inbound webhook URL with HTTP Basic auth: `https://user:pass@<site>/api/ai/channels/email/webhook` | `user:pass` |
| `sendgrid` | Inbound Parse URL with HTTP Basic auth (same form as Postmark). Leave "send raw" off. | `user:pass` |
| `mailgun`  | Route `forward("https://<site>/api/ai/channels/email/webhook")`. The `timestamp`/`token`/`signature` fields are checked with HMAC-SHA256, timestamps older than 5 minutes are rejected, and a token that was already used is rejected. | HTTP webhook signing key |
| `generic`  | JSON `{ messageId, from, subject, text, inReplyTo?, references?, date? }` with headers `X-Timestamp` (unix seconds) and `X-Signature` = hex HMAC-SHA256 of `${timestamp}.${rawBody}`. Requests more than 5 minutes off are rejected. | HMAC key |

Set `replyFrom` to an address your Payload email adapter is allowed to send from.

### Jobs

Replies are sent from the Payload Jobs Queue (`ai-channels-inbound`, `ai-channels-send`, both on the `default` queue).
Turn on `jobs.autoRun` or run a worker, or nothing will be answered.

## Other APIs

- `queueChannelReply(payload, { identityId, text, cards?, subject? })` sends a message to a channel identity from somewhere else,
  for example a support agent's reply. The window and template rules still apply.
- `renderCard`, `renderReply`, `splitMessage`, `stripQuotedReply` and the drivers (`createWhatsAppDriver`, …) are
  exported for reuse and tests.

## Collections

- `ai-channel-identities`: channel, externalIdHash, encrypted external id, customerId, verifiedAt, the pending code
  (hash, expiry, attempts), lastInboundAt, conversationId, pending confirmations.
- `ai-channel-messages`: one row per inbound or outbound message, with direction, status
  (received / processed / queued / sent / skipped / failed / …), the conversation, the reason, provider ids and the
  number of parts sent. Unique on `(channel, externalMessageId)`.

Staff with the `support` role can read both collections. Only the module writes to them.
