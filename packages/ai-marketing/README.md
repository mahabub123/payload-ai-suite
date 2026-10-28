# payload-ai-marketing

Marketing & email module (design doc §10.4): AI segments, AI-drafted campaigns and triggered sequences, human approval, idempotent sending with unsubscribe handling, and social copy within platform limits.

```ts
import { aiCore } from 'payload-ai-core'
import { aiMarketing } from 'payload-ai-marketing'

plugins: [
  aiCore({ /* … */ }),
  aiMarketing({
    approvalRole: 'marketing-approver', // suite role; store-admin & super-admin always pass
    dailySendLimit: 2000,
    fromAddress: 'Shop <news@shop.example>',
    unsubscribeUrlBase: 'https://shop.example/api/ai/marketing/unsubscribe',
    fourEyes: true, // the author of a campaign cannot approve it
    sequences: { abandonedCart: true, welcome: true, winBack: true, postPurchaseReview: true },
  }),
]
```

Requires the `customer` and `order` concepts; `offering`, `category` and `cart` are used when mapped.

## Collections
| slug | purpose |
| --- | --- |
| `ai-segments` | name, description, `definition` (structured filter, never SQL), size, masked sample, refreshedAt |
| `ai-campaigns` | kind (`one-off`, `abandoned-cart`, `welcome`, `win-back`, `post-purchase-review`), segment, steps (delayHours, subjectVariants, chosenSubject, markdown, html, text, productBlocks), status, approval fields |
| `ai-email-drafts` | one row per recipient per step: hashed + plain email, subject, html, text, status (`queued`/`sending`/`sent`/`failed`/`skipped`), **unique** `idempotencyKey`, sentAt, error |
| `ai-unsubscribes` | hashed email (unique), source |

`status`, `approvedBy`, `approvedAt` and `author` cannot be written through the API; only the module's endpoints change them. Editing campaign content after approval revokes the approval (and the send job also refuses content whose hash differs from the approved one).

## Endpoints (`/api` prefix)
| | access | |
| --- | --- | --- |
| `POST /ai/marketing/segments/preview` | staff | `{ description }` → `reason` model → structured filter → `{ definition, explanation, size, sample }`; or `{ definition }` to re-evaluate |
| `POST /ai/marketing/segments` | staff | save `{ name, description?, definition }` |
| `POST /ai/marketing/drafts` | staff | compose a step with the `write` model + brand voice: 3–5 subject variants, Markdown → sanitized HTML + text, product blocks (explicit ids → `ai-recs` for `anchorOfferingId` → newest in-stock). `save: true` writes it into `campaignId`/`stepIndex` |
| `POST /ai/marketing/campaigns/:id/request-approval` | staff | draft → pending-approval |
| `POST /ai/marketing/campaigns/:id/approve` | approvalRole, store-admin | `{ chosenSubjects?, scheduledAt? }`; audits, queues `ai-marketing-send` (one-off) or activates the sequence |
| `POST /ai/marketing/campaigns/:id/pause` | approvalRole, store-admin | `{ paused }`; un-pausing needs approval again |
| `GET/POST /ai/marketing/unsubscribe?token=` | anyone | signed token (HMAC via `services.crypto.hashId`, email encrypted); POST is RFC 8058 one-click |
| `POST /ai/marketing/social` | staff | `{ brief, platforms: ['x','facebook','instagram','linkedin'], offeringId? }`; limits x 280, facebook 63 206, instagram 2 200, linkedin 3 000 enforced in code |

## Jobs
- `ai-marketing-send` — sends one step. Per-recipient idempotency key `hash(campaign:step:email[:ref])`: a re-run never sends twice; a send interrupted mid-flight is marked failed rather than retried. Skips unsubscribed and `marketingOptIn === false` customers. Daily limit (UTC) — overflow is re-queued for the next day. Every email has an unsubscribe link and `List-Unsubscribe` / `List-Unsubscribe-Post` headers. Permanent errors (SMTP 5xx, invalid address, HTTP 4xx) → `failed`; transient errors leave the draft `queued` and fail the job so the queue retries. Next steps are queued after `delayHours`, only to recipients who got the previous step (abandoned-cart follow-ups only while the cart is still abandoned).
- `ai-marketing-sequences` (hourly) — finds recipients due for step 0 of approved sequences: abandoned carts (`cart.listAbandoned`), new customers (welcome), recent orders (post-purchase review), segment members (win-back).
- `ai-marketing-segment-refresh` (daily) — recomputes size + sample.

## Admin UI
`CampaignApproval` (`payload-ai-marketing/client`) is mounted in the `ai-campaigns` edit view (`beforeDocumentControls`): subject-variant picker per step, sandboxed HTML preview, optional schedule, approve and pause.
