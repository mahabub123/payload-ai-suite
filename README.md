# Payload AI Suite

AI features for any business or ecommerce site built on **Payload CMS v3**. It is a set of normal Payload plugins: one shared AI core and modules you turn on one at a time. There is no separate AI backend. Everything runs inside your Payload app, on your Postgres database (with pgvector), through Payload's access control.

- **Provider-agnostic.** OpenAI, Anthropic, Google, OpenRouter, Ollama or any OpenAI-compatible endpoint. Each task class (`fast`, `chat`, `write`, `reason`, `embed`, `image`) has its own ordered fallback list.
- **Business adapters.** Modules work with concepts (offering, order, cart, knowledge, booking and so on), never with hard-coded collection names. There are presets for the official Ecommerce plugin, service businesses and content sites.
- **Agentic but safe.** The AI only looks things up and prepares actions. Anything involving money, publishing, sending or customer data needs a person or a verified customer to confirm it.
- **Measured.** Every model call is logged with tokens, cost and outcome. Budgets apply per site, tenant and module.

The full design is in [`docs/DESIGN.md`](docs/DESIGN.md), and coding rules are in [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md).

## Package map

| Package | What it does | Phase |
| --- | --- | --- |
| `@payload-ai-suite/ai-core` | Providers and router, agent/tool runtime, knowledge index (pgvector), prompts, guardrails, memory, usage, budgets, audit, settings UI | 0 |
| `@payload-ai-suite/ai-adapters` | `createAdapters({ preset, overrides, custom })` maps concepts to your collections | 0 |
| `@payload-ai-suite/ai-content` | Content Studio: descriptions, SEO, translation, tagging, bulk enrichment | 1 |
| `@payload-ai-suite/ai-search` | Hybrid semantic + keyword search, natural-language filters, recommendations | 1 |
| `@payload-ai-suite/ai-assistant` | Storefront chatbot: product Q&A, cart, order tracking, returns, leads, bookings, hand-off | 2 |
| `@payload-ai-suite/ai-marketing` | Email and campaign drafts, sequences, segments, approval before sending | 3 |
| `@payload-ai-suite/ai-support` | Ticket triage, suggested replies, auto-answer, review insights | 3 |
| `@payload-ai-suite/ai-channels` | The same assistant on WhatsApp, Messenger and email | 3 |
| `@payload-ai-suite/ai-insights` | Ask-your-data via typed metric tools, briefings, anomaly alerts | 4 |
| `@payload-ai-suite/ai-media` | Alt text, tagging, background removal, variations | 4 |
| `@payload-ai-suite/ai-copilot` | Staff assistant in the admin, bulk edits with preview, automations | 4 |
| `@payload-ai-suite/ai-react` | Search keeps a tight latency budget: the query embedding gets 250 ms (`embedTimeoutMs`) and query understanding 150 ms (`queryUnderstanding.timeoutMs`). If a call misses its deadline, that request falls back to keyword search. The result still arrives a moment later and is cached, so repeat queries get the full hybrid search. Gateways such as OpenRouter took 1–2 s per embedding in testing, so through a gateway a first-time query always falls back. Raise the timeouts if you would rather wait than fall back, or use a direct embedding provider.

Storefront components: `AISuiteProvider`, `AssistantWidget`, `SearchBox`, `SearchResults`, `RecommendationsBlock`, hooks | — |
| `@payload-ai-suite/ai-suite` | **One-line install** that composes core and modules, and re-exports everything | — |
| `apps/dev-store` | Payload 3 + Next 16 demo store on the official Ecommerce plugin (BDT + USD, English + Bangla) | — |
| `apps/dev-services` | Demo for the services preset (a clinic: services, bookings, staff, locations) | — |
| `tooling/` | Evals, k6 load tests, Playwright e2e, red-team prompts | — |

## Quick start

You need Node 22+, pnpm 10 and Docker.

```bash
docker compose up -d                 # Postgres 17 + pgvector on :5433, Mailpit on :8025 (SMTP :1025)
pnpm install
cp apps/dev-store/.env.example apps/dev-store/.env
pnpm dev:store                       # http://localhost:3000 (storefront), /admin (Payload admin)
pnpm --filter dev-store seed         # ~30 products, content, staff + customers A/B with orders
```

With no provider key set, or with `AI_MOCK=1`, the suite runs against an in-process mock model, so it works offline and costs nothing. To use real models, add `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY` and/or `OLLAMA_BASE_URL` to `.env` and set `AI_MOCK=0`.

Seed accounts all use the password `Passw0rd!dev` (override with `SEED_PASSWORD`):

| Account | Role |
| --- | --- |
| `super@example.test` | super admin (models, keys, budgets) |
| `admin@example.test` | store admin |
| `content@` / `marketing@` / `support@` / `manager@example.test` | staff roles |
| `ayesha@example.test` (A) and `bilal@example.test` (B) | customers with orders DS-1001/DS-1002 and DS-2001 |

To run the services demo, create the `payload_ai_services` database, copy `apps/dev-services/.env.example` to `apps/dev-services/.env`, then run `pnpm dev:services` (port from `NEXT_PUBLIC_SERVER_URL`) and `pnpm --filter dev-services seed`.

Emails, such as one-time codes for guest order lookup, arrive in Mailpit at http://localhost:8025.

## One-line install

```ts
// payload.config.ts
import { ecommercePlugin } from '@payloadcms/plugin-ecommerce'
import { aiSuite } from '@payload-ai-suite/ai-suite'

export default buildConfig({
  // ...
  plugins: [
    ecommercePlugin({ /* ... */ }),          // first: aiSuite maps the collections it creates
    aiSuite({
      preset: 'ecommerce',
      overrides: {
        offering: { collection: 'products', fields: { title: 'name', price: 'priceBDT', image: 'gallery.0' } },
        knowledge: { collections: ['pages', 'faqs', 'policies'] },
      },
      providers: [
        { id: 'openai', type: 'openai', apiKeyEnv: 'OPENAI_API_KEY' },
        { id: 'anthropic', type: 'anthropic', apiKeyEnv: 'ANTHROPIC_API_KEY' },
      ],
      routes: {
        fast: ['openai:gpt-5-mini'],
        chat: ['anthropic:claude-sonnet-5-5', 'openai:gpt-5-mini'],
        embed: ['openai:text-embedding-3-small'],
      },
      locales: ['en', 'bn'],
      budgets: { monthlyMicros: 100_000_000, perModule: { assistant: 0.6, search: 0.2 } },
      modules: {
        content: true,
        search: { hybrid: true, recommendations: true },
        assistant: { handoff: 'support' },
        marketing: { approvalRole: 'marketing-approver' },
        support: true,
        insights: true,
      },
    }),
  ],
})
```

`aiSuite()` builds the adapters, installs `aiCore()`, then installs each enabled module in phase order: content, search, assistant, marketing, support, channels, insights, media, copilot. It returns them as one plugin. Each module is still a normal plugin (`aiContent()`, `aiSearch()` and so on), and all of them are re-exported from `@payload-ai-suite/ai-suite` if you prefer to compose them yourself.

### Database setup

The suite keeps its vectors in two raw-SQL tables (`ai_knowledge`, `ai_offerings`) that Payload doesn't know about. Keep Payload's dev-mode schema push away from them, or push will try to drop them and fail:

```ts
import { postgresAdapter } from '@payloadcms/db-postgres'
import { aiSuiteTablesFilter } from '@payload-ai-suite/ai-suite'

db: postgresAdapter({ pool: { connectionString: process.env.DATABASE_URI }, tablesFilter: aiSuiteTablesFilter() })
```

In production, create the tables from a committed migration (`writeVectorMigration` from `@payload-ai-suite/ai-suite`; see `apps/dev-store/src/migrations`). If the pgvector extension is missing, the suite logs one warning and runs keyword-only search instead of failing.

Jobs run on three queues: `default` (on-demand work such as indexing and triage), `ai-default` and `ai-nightly` (scheduled work). Make sure `jobs.autoRun` or your worker covers all three.

Bad combinations fail at boot with a clear message. Examples: `channels` without `assistant`, a raw `apiKey` in config, budget shares adding up to more than 1, `allowTenantKeys` without `tenant`, or an unknown module name.

### Module switches

Each entry under `modules` accepts `true` (use the defaults), an options object, or `false`/omitted (not installed: no collections, endpoints or UI). At runtime, `ai-settings → enabledModules` can also switch an installed module off. That hides its UI and blocks its endpoints without deleting any data.

| Key | Notable options |
| --- | --- |
| `content` | `fields`, `aiTagsField`, `bulk` |
| `search` | `hybrid`, `recommendations`, `queryUnderstanding`, `synonyms`, `currency`, `embedTimeoutMs` |
| `assistant` | `tools` (catalog, cart, orders, returns, leads, booking, knowledge), `handoff`, `otp`, `contact` |
| `marketing` | `approvalRole`, `dailySendLimit`, `sequences`, `fourEyes` |
| `support` | auto-answer confidence, triage |
| `channels` | `whatsapp`, `messenger`, `email` (env var names only); needs `assistant` |
| `insights` / `media` / `copilot` | `copilot.automations`, ... |

Storefront components:

```tsx
import { AISuiteProvider, AssistantWidget, SearchBox, SearchResults, RecommendationsBlock } from '@payload-ai-suite/ai-react'
```

## Security model (summary)

- **The model is untrusted.** It can only act through tools, and every tool runs with the caller's Payload access (`overrideAccess: false`). Retrieved content is passed to the model as quoted data, never as instructions.
- **Risk tiers are enforced in code:**
  - *read*: runs automatically.
  - *low-risk act*: runs automatically, is reversible and logged (for example add to cart, save a lead, tentative booking).
  - *confirm*: shows a confirmation card and runs only after the customer or staff member taps Confirm (for example a return request, cancelling an order, sending an email).
  - *staff only*: publishing, bulk edits, campaign sends and refunds. Never available from shopper channels.
- **Customers only ever see their own orders.** Guests prove ownership with order number + email + a one-time code. Staff stay inside their role and tenant. Automated isolation tests cover customer A vs B and tenant A vs B, including vectors, usage and chats.
- **Access matrix (design §12):** models, keys and budgets are super-admin only; prompts and automations are store admin; content and media AI need the content role; campaign approval needs the marketing approver; support replies need the support role; insights need the manager role.
- **Abuse controls:** Turnstile on a visitor's first message, per-visitor and per-IP rate limits, input length and injection checks, and budgets checked before every call. Search falls back to keyword search when the budget is spent. Checkout never depends on AI.
- **Output checks:** prices and stock are rendered from tool cards, never from model text. Links are restricted to allowed domains, HTML is sanitized, and shopper-facing text goes through moderation.
- **Secrets:** API keys live in environment variables, and config only stores the variable *names*. Optional tenant keys (BYOK) are encrypted with AES-256-GCM and never sent to the browser. Logs are scrubbed.
- **Audit:** an append-only audit log records settings changes, prompt activations, approvals and every confirm or staff-only tool run.

## Testing

```bash
pnpm typecheck                         # all packages and apps
pnpm test                              # Vitest: every package + tooling
pnpm evals                             # golden sets (EN + BN) in mock mode; non-zero exit on regression
pnpm evals --mode live --target http://localhost:3000 --route anthropic:claude-sonnet-5-5 --record rec.json
pnpm evals --mode replay --recording rec.json   # rescore a recorded run offline
pnpm evals --update-baseline           # accept current metrics for this route (tooling/evals/baseline.json)
pnpm --filter @payload-ai-suite/tooling redteam --target http://localhost:3000
pnpm --filter @payload-ai-suite/tooling e2e     # Playwright (starts dev-store with AI_MOCK=1; uses Mailpit)
AI_MOCK=1 AI_MOCK_DELAY_MS=40 pnpm --filter dev-store start
k6 run -e BASE_URL=http://localhost:3000 tooling/load/k6-assistant.js   # 50 SSE streams, TTFT p95 < 2 s
k6 run -e BASE_URL=http://localhost:3000 tooling/load/k6-search.js      # 15 req/s, p95 < 300 ms
```

CI (`.github/workflows/ci.yml`) runs install, typecheck, unit tests and mock-mode evals. It also runs a Postgres + pgvector service with migrations, a migration-drift check and seeding, and runs e2e and red-team on `main`. `nightly.yml` runs recorded evals and red-team against real model routes (using provider secrets), plus the k6 load tests against the delayed-stream mock.

## License

MIT. See [LICENSE](LICENSE).
