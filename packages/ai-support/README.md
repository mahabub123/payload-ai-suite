# payload-ai-support

Support inbox module (design doc §10.5): ticket triage, grounded suggested replies and thread summaries, guarded auto-answers, weekly review insights and review moderation.

```ts
import { aiCore } from 'payload-ai-core'
import { aiSupport } from 'payload-ai-support'

plugins: [
  aiCore({ /* … */ }),
  aiSupport({
    autoAnswerConfidence: 0.85,
    autoAnswerTopics: ['order-status', 'shipping', 'store-hours', 'returns-policy'], // [] disables auto-answers
    topics: ['order-status', 'shipping', 'store-hours', 'returns-policy', 'refund', 'product-question', 'complaint'],
    reviewModeration: true,
  }),
]
```

## Tickets
`ai-tickets` is owned by ai-core; this module only extends it (and throws at config time if it is missing):
- adds an `afterChange` hook (existing hooks preserved) that queues `ai-support-triage` on create;
- adds fields `replies[]`, `triageConfidence`, `triagedAt`, `autoAnswered` and the `TicketAIPanel` UI field;
- adds the `SuggestReplyButton` to the edit view controls.

**Triage job** (`fast` model, ticket quoted as data): topic (from `topics`, `other` always allowed), priority, sentiment, language, order number → `order.findByNumberAndEmail` (system lookup, must match the ticket email) → `linkedOrderId`.

**Auto-answer** happens only when *all* hold: topic is in `autoAnswerTopics`, triage confidence ≥ `autoAnswerConfidence`, the ticket has no replies yet, and the answer is grounded (knowledge hits for public/customer policies or linked order data). The `write` model must also report `answerable` with confidence ≥ the bar, and the reply must pass `guardrails.checkOutput` and `moderate`. The reply is delivered, recorded in `replies`, the ticket set to `pending`, and the action audited. Anything else waits for a person.

**Delivery** — the `ai-support-reply` hook: other modules register a listener in their `onInit`:

```ts
import { onSupportReply } from 'payload-ai-support'
onSupportReply(payload, async ({ ticket, body, html, auto }) => {
  if (ticket.source !== 'channel') return false
  await sendOnWhatsApp(ticket, body)
  return true // handled
})
```
When no listener handles it, the reply goes by email (`payload.sendEmail`) to `customerEmail`.

## Endpoints (`/api` prefix)
| | access | |
| --- | --- | --- |
| `POST /ai/support/tickets/:id/suggest` | support | suggested reply grounded in policies (knowledge search) + linked order + thread, and a thread summary; both stored on the ticket; returns citations |
| `POST /ai/support/tickets/:id/reply` | support | `{ body, status? }` — the agent's (edited) reply is sent, recorded and audited |
| `POST /ai/support/review-flags/:id/release` | support | un-hold a flagged review |

## Reviews
- **Moderation** (hook on the review collections from the adapter map, when `reviewModeration`): `ai-support-review-moderate` runs `guardrails.moderate` + a `fast` abuse/spam classifier; flagged reviews are held through `review.setHeld` and listed in `ai-review-flags` for staff.
- **Weekly insights** (`ai-support-review-insights`, Mondays 06:00): per offering → `ai-review-insights` { offeringId, periodStart/End, reviewCount, summary, themes, sentimentBreakdown (from ratings), flagged ids }. Idempotent per offering + period.
