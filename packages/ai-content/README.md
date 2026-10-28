# @payload-ai-suite/ai-content — Catalog & Content Studio

AI writing help for staff inside the Payload admin (design §10.3). Nothing publishes automatically:
single-field results are inserted into the form for the editor to save, bulk results become drafts after review.

```ts
import { aiCore } from '@payload-ai-suite/ai-core'
import { aiContent } from '@payload-ai-suite/ai-content'

plugins: [
  aiCore({ /* providers, routes, adapters … */ }),
  aiContent({
    fields: { products: ['title', 'description', 'meta.title', 'meta.description'], posts: ['excerpt', 'content'] },
    aiTagsField: true,
    bulk: { concurrency: 1, batchConcurrency: 8, maxItems: 500 },
  }),
]
```

## Options (`AiContentOptions`)

| option | default | meaning |
| --- | --- | --- |
| `fields` | — | `{ [collection]: fieldPath[] }`. Replaces auto-detection for that collection; also enables non-offering collections (posts, pages…). Dotted paths reach named groups/tabs. |
| `autoDetectOfferingFields` | `true` | Offering collections (from the adapter preset) get every visible, editable text/textarea/richText field except identifiers (`slug`, `sku`, …). |
| `aiTagsField` | `false` | Adds `aiTags` (text, hasMany, sidebar) to offering collections only. |
| `photoPanel` | `true` | Sidebar "Generate from photo / spec" panel on offering collections (a `ui` field, stores nothing). |
| `bulkAction` | `true` | "AI enrich N selected" bar above the list view. |
| `bulk.concurrency` / `bulk.batchConcurrency` / `bulk.maxItems` / `bulk.queue` | `1` / `8` / `500` / default | Bulk job tuning. |

## Actions & prompts

Registered as version-0 defaults (`ai-prompts` rows override): `content.describe` (write), `content.describe-photo`
(vision), `content.rewrite`, `content.shorten`, `content.tone`, `content.translate`, `content.seo` (structured,
title ≤ 60 / description ≤ 160 — enforced after generation too), `content.faq`, `content.blog`, `content.landing`,
`content.attributes`, `content.tags` (categories must come from the category adapter list — unknowns are dropped),
`content.extract` (photo/spec → listing draft). Variables: `locale`, `language`, `localeNote` (Bangla-specific
wording for `bn`), `fieldLabel`, `format`, `lengthHint`, `instructions`, `product`, `source`, `spec`, `categories`, `tone`.
Prices and stock are never sent as context.

## Endpoints (`/api` prefix, core guard pipeline)

- `POST /ai/content/generate` — roles `content` (+ store-admin/super-admin). Body: `{ action, collection, docId?, field, locale?, instructions?, tone?, targetLocale?, context?, currentValue?, imageUrl?, template?, stream? }`.
  Long text into textarea/richText streams SSE (`text` deltas, then `done` with `messageId` = generation id); short / structured returns JSON `{ generationId, output, data?, value?, model, costMicros }`. `value` is Lexical JSON for rich text (Markdown → Lexical with the field's own editor config).
- `PATCH /ai/content/generations/:id` — `{ accepted: boolean }`; records the decision (acceptance metric) and returns the field-ready `value`.
- `POST /ai/content/bulk` — store-admin. `{ collection, ids? | where?, action, template?, fields[], locale?, … }`. Resolves ids with the caller's access, creates an `ai-bulk-runs` row and queues `ai-content-bulk`.
- `GET /ai/content/bulk/:runId`, `POST /ai/content/bulk/:runId/review` — `{ decision: 'accept-all' | 'discard-all' }` or `{ items: [{ id, accept }] }`. Accepted values are written with the reviewer's access as a **draft** (`draft: true`, `_status: 'draft'`) when the collection has drafts.

## Data

- `ai-generations`: target collection/doc/field, action, prompt slug + version, output, `data`, `accepted` (null = pending), model, `costMicros`, `bulkRun`.
- `ai-bulk-runs`: status `queued → running → review → done`, counts, errors, whether provider batch was used.

The bulk job (`ai-content-bulk`, retries 2, idempotent per doc+field) writes **only** pending generations. When the
route has a batch-capable model it sends calls with `needs: ['batch']` and higher concurrency; otherwise sequential.

## Admin UI (`@payload-ai-suite/ai-content/client`)

`AIFieldButton` (attached to `admin.components.afterInput`, existing components kept), `AIGeneratePanel`,
`BulkEnrichAction` (`beforeListTable`), `BulkReviewView` (custom view `/admin/ai-content/bulk/:runId`).
Run `payload generate:importmap` after installing.
