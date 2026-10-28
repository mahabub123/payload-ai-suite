# payload-ai-copilot

Staff copilot for the Payload admin plus AI automations with approval steps (design doc §10.8).
Requires `aiCore()` before it in `plugins[]` (or enable via `aiSuite({ modules: { copilot: {...} } })`).

```ts
import { aiCopilot } from 'payload-ai-copilot'

plugins: [aiCore({...}), aiCopilot({ automations: true, collections: ['products', 'reviews', 'posts'], maxBulkItems: 200 })]
```

## Options (`AiCopilotOptions`)
| option | default | |
|---|---|---|
| `automations` | `true` | adds `ai-automations`, `ai-automation-runs`, jobs, hooks and approval endpoints |
| `collections` | mapped concept collections + `pages`/`posts` (those that exist) | allow-list the copilot may read / propose edits on, and that automations can trigger on |
| `maxBulkItems` | `200` | max docs per changeset (instruction-based AI rewrites capped at 25 per proposal) |
| `defaultApprovalRole` | `'store-admin'` | approver role when an automation names none |
| `adminPanel` | `true` | registers `CopilotProvider` in `admin.components.providers` (existing providers kept) |

## Copilot chat
`POST /api/ai/copilot/chat` (staff, SSE) — `{ message, conversationId?, page? }`. Agent on the `admin` surface with staff-tier tools
(never offered on storefront/channel surfaces or to non-staff):

- `findDocuments` — structured filter only (`{field, op, value}` / `{and}` / `{or}`; ops `equals, not_equals, in, not_in, greater_than(_equal), less_than(_equal), like, contains, exists`). Unknown operators/keys are rejected. Runs with the staff user, `overrideAccess: false`.
- `summarizeDocument`, `draftContent` — read / generate only.
- `proposeBulkEdit` — computes a per-doc before/after diff (static `set` or AI `instructions`) and saves an `ai-copilot-changesets` record with status `proposed`. Never writes. Emits an `action-result` card with `actionId: "changeset:<id>"`, which the admin panel renders as a diff with Apply / Discard.
- `copilotSearchKnowledge` — knowledge search incl. staff-visibility docs.

`POST /api/ai/copilot/changesets/:id/apply` — writes as the calling staff user (`overrideAccess: false`), as a draft when the collection has drafts, skips docs changed since the proposal, audits each doc, idempotent (re-apply returns stored results). `POST /api/ai/copilot/changesets/:id/discard`.

Conversations are stored via core memory on channel `admin`.

## Automations
`ai-automations`: `trigger` (`collection` + `operation` create/update/delete + structured `condition`, or `schedule` + 5-field UTC cron), `steps[]` (`classify | summarize | draft | extract`, `promptSlug` or `instructions`, `outputKey`), `approval { required, role }`, `action` (`notify` admin/email, `create-draft` with `fieldMapping` like `{ title: "outputs.summary" }`, `tag` a field of the trigger doc from `valueFrom`; optional `when` filter over `{ outputs, doc }`).

- Allow-listed collections get one extra `afterChange`/`afterDelete` hook (existing hooks preserved). It looks up enabled automations (cached 30 s, invalidated on change), creates an `ai-automation-runs` record (`queued`) and queues `ai-copilot-automation-run`. Copilot's own writes (`req.context.aiCopilotWrite`) never trigger automations; trigger failures are logged, never thrown.
- `ai-copilot-automation-dispatch` runs every 5 minutes (task `schedule`) and queues schedule-triggered automations.
- Runs needing approval stop at `awaiting-approval`; `POST /api/ai/automations/runs/:id/approve|reject` checks the approval role (store-admin/super-admin always pass). Actions run only after approval. Each run records inputs (redacted snapshot), outputs, `costMicros`, error.

Example: `reviewAlertAutomation('reviews', ['owner@shop.test'])` — "new review → summarize → alert if negative".

## Client exports
`payload-ai-copilot/client`: `CopilotProvider`, `CopilotPanel`, `DiffViewer`.
