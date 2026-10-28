# payload-ai-assistant

Website sales & support assistant for Payload CMS v3 (design doc §10.1). Requires `aiCore()` before it in `plugins[]` (or use `aiSuite({ modules: { assistant: {...} } })`).

```ts
import { aiAssistant } from 'payload-ai-assistant'

plugins: [
  aiCore({ ... }),
  aiSearch(),            // optional; registers the hybrid `searchOfferings` first
  aiAssistant({
    tools: ['catalog', 'cart', 'orders', 'returns', 'knowledge'], // default: all groups whose concepts are mapped
    handoff: 'support',               // or false
    expectedReplyTime: 'within 2 hours',
    greeting: 'Hi! How can I help?',
    maxSteps: 5,
    otp: { ttlMinutes: 10, sendVia: 'email', maxAttempts: 5 },
    contact: { email: 'help@shop.com', phone: '+880…', whatsapp: '+880…', hours: '10:00–20:00' },
  }),
]
```

## Endpoints (all under `/api`)

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| POST | `/ai/assistant/chat` | anyone (Turnstile on first message) | body `ChatRequestBody`; SSE `StreamWireEvent`s (`meta` with `aiNotice`, `text`, `tool`, `card`, `done`) |
| POST | `/ai/assistant/verify/start` | anyone | `{ orderNumber, email, conversationId? }` → always the same generic message; emails a 6‑digit code only if the order matches |
| POST | `/ai/assistant/verify/confirm` | anyone | `{ code, conversationId }` → binds the verified customer/order to this conversation + visitor for 24 h |
| POST | `/ai/assistant/feedback` | conversation owner | `{ messageId, rating: 'up'\|'down', comment? }` |
| GET | `/ai/assistant/conversations/:id` | conversation owner | stored messages (with cards) for widget resume |
| GET / DELETE | `/ai/assistant/memory` | customer | view / delete opt-in customer memory |

Confirmation cards are confirmed through the core endpoint `POST /api/ai/actions/:id/confirm` (Idempotency-Key header).

## Tools

| Group | Tool | Tier | Requires |
| --- | --- | --- | --- |
| catalog | `searchOfferings` (fallback, only if ai-search did not register one), `getOffering`, `checkStock` | read | offering |
| knowledge | `getPolicy`, `searchKnowledge` (citations) | read | knowledge service |
| cart | `addToCart` | low | cart, offering |
| orders | `getOrderStatus`, `listMyOrders` (only for a customer / verified guest), `requestOrderVerification` (only when not verified → verify card) | read | order |
| returns | `proposeReturn` → confirmation card; `createReturnRequest` runs only after Confirm | confirm | order |
| leads | `captureLead` | low | lead |
| booking | `checkAvailability` (read), `bookSlot` (low, tentative; slot re-checked) | | booking |
| — | `handOff` → `ai-tickets` doc (`source: 'handoff'`, transcript, summary), conversation marked handed off, handoff card | low | |

Order tools never reveal another customer's order: they go through `getForCustomer` with the caller's identity, double-check `customerId`, and answer "not found" otherwise. Merchant/knowledge text is passed to the model wrapped in `guardrails.quote()`; tool availability is decided in code, so injected text cannot unlock tools.

## Reusing the turn (ai-channels)

```ts
import { runAssistantTurn } from 'payload-ai-assistant'

for await (const ev of runAssistantTurn({ ctx, conversationId, message, page, channel: 'whatsapp' })) { ... }
```

`runAssistantTurn({ ctx, conversationId?, message, page?, channel?, options? }): AsyncIterable<StreamWireEvent>` — guardrails → memory → system prompt (`assistant-system`, en + bn defaults; policy, brand voice, summary, quoted page context, customer memory) → agent → wire events → save → outcome. Budget/provider failures never throw: the shopper gets a "busy" message with contact options and a hand-off card. Set `ctx.actor.customerId` for verified channel identities.

## Outcomes

Each turn tags `answered` / `added_to_cart` / `handed_off`. The job `ai-assistant-outcomes` (every 30 min) tags `ordered_within_24h` (order by the conversation's customer within 24 h) and `abandoned` (idle, no outcome).

## Collections

`ai-assistant-verifications` (hidden, system-written): hashed one-time codes, encrypted order number/email, attempts, expiry.
