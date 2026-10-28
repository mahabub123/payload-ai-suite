# Payload AI Suite — System Design (condensed from the design doc, Oct 28 2026)

## 1. Vision & goals
One installable product that makes any business/ecommerce site on Payload CMS v3 AI-powered: shared AI core + switchable modules.
- Payload-only: everything runs inside the business's Payload app as plugins; no separate AI backend.
- Any business type via adapters; ready preset for Payload's official Ecommerce plugin.
- Modular: each module its own plugin on one core.
- Agentic but safe: AI looks things up and prepares actions; money, publishing, sending and customer-data changes need a person or verified customer to confirm.
- Provider-agnostic: switch vendor per task in config.
- Measurable: every AI action logged with cost, outcome, revenue impact where possible.
Non-goals v1: non-Payload sites; training/fine-tuning; fully autonomous money/refund/publish/email; automatic price changes, credit or legal decisions.

## 2. Modules (package — what — phase)
- ai-core (0): providers & router, agent/tool runtime, knowledge index, prompts, guardrails, usage, budgets, audit, settings UI.
- ai-content (1): descriptions from specs/photos, SEO meta, blog/landing copy, translations, attribute extraction, auto-tagging & categories, bulk enrichment, brand voice.
- ai-search (1): hybrid semantic+keyword search, natural-language filters ("red dress under 3,000 taka"), similar, bought-together, personalized, zero-result fixes.
- ai-assistant (2): website chatbot: product Q&A, guided shopping, add to cart, order tracking, return/exchange requests, FAQ, lead capture & booking, human hand-off, multilingual.
- ai-marketing (3): email compose, campaign/promo copy, abandoned-cart & win-back sequences, subject variants, segments from behavior, social posts.
- ai-support (3): ticket triage (topic, priority, sentiment), suggested replies, thread summaries, auto-answer above a confidence bar, review summaries & moderation.
- ai-channels (3): same assistant on WhatsApp Business, Messenger, email; one history per customer.
- ai-insights (4): ask your data (sales/products/customers), daily/weekly briefings, anomaly alerts, review/feedback themes.
- ai-media (4): alt text, image tagging, background removal, product image variations & lifestyle shots, image-to-listing.
- ai-copilot (4): staff assistant in admin, bulk edits with preview, event-driven AI workflows ("new review → summarize → alert if negative") with approval steps.

## 3. Business adapters
Modules never hard-code collection names; they use concepts: Offering, Category, Customer, Order/booking, Cart, Knowledge, Lead/ticket, Review (+ Booking for services).
Adapter = field map + typed functions (getOffering, searchOfferings, getOrderForCustomer, addToCart, createReturnRequest…). Run through Payload Local API with caller's access (overrideAccess: false).
Presets: ecommerce (official Ecommerce plugin: products, variants, carts, orders, customers — zero config), services (services, bookings, staff, locations), content (pages, posts, FAQs, authors), custom (config object maps any collection/field; missing concepts disable the tools that need them).
```ts
aiSuite({ preset: 'ecommerce', overrides: {
  offering: { collection: 'products', fields: { title: 'name', price: 'priceBDT', image: 'gallery.0' } },
  knowledge: { collections: ['pages', 'faqs', 'policies'] } } })
```
At startup core validates every mapped collection & field and logs which tools are available; wrong map fails loudly.

## 4. NFRs (assumed)
Catalog ≤50k offerings, 200k knowledge chunks. 1M visits/mo, 10k assistant conversations/day, 100k searches/day, peaks 10×.
Search p95 < 300 ms end to end, < 150 ms without query understanding; AI rewriting skipped when slow.
Assistant TTFT p95 < 2 s; tool calls p95 < 300 ms. Staff short fields p95 < 5 s; bulk work as jobs.
99.9% suite endpoints excl. providers; checkout never depends on AI. RPO 15 min / RTO 1 h.
Retention: shopper chats 90 d, staff chats 1 y, usage 2 y, audit 3 y (configurable).
Cost: monthly AI budget per site/tenant and per module; warn 80%, stop 100%; search falls back to keyword when spent.
Security: customer sees only own orders; staff only within role and tenant (automated tests).
Privacy: minimum personal data to providers; no-training setting; delete on request.
Languages: any Payload locale; Bangla + English tested first. Payload 3.x, Postgres adapter, Node LTS. MongoDB out of scope.

## 5. Capacity
Assistant ≈ 92% of input tokens: 60k calls/day × 3,500 in (system 600 + history 1,000 + tool results 1,900) / 250 out. ~46 concurrent streams at peak.
Search peak ≈ 12/s; query embeddings cached (half hit); NL filter parsing only on queries > 3 words (400 in / 60 out).
Vectors: 250k × 1536 dims. Full re-embed: 100 per call, ~5 calls/s.

## 6. Architecture
Surfaces (storefront widgets, admin UI, channel webhooks) → Suite API /api/ai/* (+ /api/ai/channels/*) → guard pipeline (identity → tenant → access → rate limit → budget → input validation → Turnstile for anonymous) → modules → AI core → adapters (Local API with caller's access) + knowledge index (pgvector) → Postgres (collections, vectors, job queue); jobs worker (index, send, triage, reports); AI providers; messaging APIs; optional Redis.
Monorepo: packages/{ai-core, ai-adapters, ai-content, ai-search, ai-assistant, ai-marketing, ai-support, ai-channels, ai-insights, ai-media, ai-copilot, ai-react, ai-suite}, apps/{dev-store, dev-services}, tooling/.
Each package is a normal Payload plugin `(options) => (config) => config`. aiSuite() runs ai-core first then enabled modules. Admin components exported via `/client` and `/rsc` because Payload v3 references them by path.

## 7. AI core
1. Provider registry & model router. One AIProvider interface. Connection types: native (OpenAI, Anthropic, Google, Azure, Bedrock, Mistral, Groq, xAI, DeepSeek, Cohere via Vercel AI SDK), OpenAI-compatible (OpenRouter, Together, Fireworks, DeepInfra, Perplexity, Ollama/vLLM/LM Studio, LiteLLM: base URL + key + headers; models from /models or by hand), custom adapter class. OpenRouter also via its own AI SDK provider.
   Models registered with capabilities (chat, streaming, tools, structured output, vision, embeddings+dims, image gen, prompt caching, batch), limits, prices (per M tokens / per image; gateway-reported cost stored instead when present), languages verified.
   Routing: task classes fast/chat/write/reason/embed/image → ordered model list across providers; first healthy capable model; fallback on timeout, 5xx, rate limit, open circuit breaker. Overrides per module, tenant, locale.
   Keys: env var names by default; optional tenant BYOK stored AES-256-GCM, never returned to browser, tenant-only. "Test connection" = 1-token call + tool-call check.
   Embedding changes: each index records model+dims; switching builds a new index in background and swaps; never mix vectors from two models.
   Normalized behavior: one message/tool-call format, one stream format, one usage format, one error taxonomy (rate limit, auth, bad request, overloaded, content filtered, timeout) driving retries/fallbacks. Timeouts, retries, prompt caching, batch applied by core.
2. Agent runtime & tool registry: tools with Zod input, description, risk tier; loop max 5 steps; tiers: read (auto, caller access), low-risk act (auto, reversible, logged: add to cart, save lead, tentative booking), confirm (confirmation card; runs only after customer/staff taps Confirm: return request, cancel order, send email), staff only (publish, bulk edits, campaign send, refunds; never from shopper channel; staff approval in admin).
3. Prompt library: versioned templates per task & locale, variables, output schemas, model class, shared brand-voice block; one active version per slug; evals before activation.
4. Knowledge & retrieval: pgvector ai_knowledge (chunks of pages/posts/FAQs/policies) and ai_offerings (one vector per offering with price, stock, category filter columns). Hybrid ranking: vector similarity + Postgres full-text. Indexing in jobs from afterChange, skips drafts, re-embeds only changed chunks (content hash).
5. Guardrails: input checks (length, injection patterns, abuse), shared system policy (stay on topic, never invent prices/stock, cite sources), output checks (links only to allowed domains, prices & stock match tool results, sanitized HTML), moderation on shopper-facing text.
6. Memory: per-thread with rolling summary; optional customer memory (preferences, sizes, past purchases) shown to and deletable by customer; never shared across customers/tenants.
7. Usage, budgets, audit: one usage row per model call (tokens, cost, latency, module, outcome); budgets per tenant & module with pre-call checks; append-only audit log for settings changes, prompt activations, approvals and every Confirm/Staff-only tool run.

## 8. Data model
Suite owns its collections; never adds fields to business collections except optional AI fields the site enables (e.g. aiTags). Every record carries `tenant` when Multi-Tenant is on.
core: ai-settings (global: enabled modules, model per task class, brand voice, limits, budgets, retention; super admin; keys stay in env), ai-prompts (slug, task, locale, template, schema, model class, version, status), ai-conversations (channel, module, customer/user/visitorId hashed, status, summary, handedOff, tags), ai-messages (role, parts JSON, toolCalls, citations, tokens, model, latency, feedback), ai-actions (tool, input, status proposed/confirmed/done/rejected/failed, confirmedBy, result, idempotencyKey), ai-usage + ai-usage-daily (module, task, model, tokens, costMicros, latency, outcome), ai-audit (actor, action, target, before/after, requestId), ai_knowledge table (source, chunk, content, hash, locale, visibility, embedding), ai-providers (name, type, baseURL, headers, keyRef or encryptedKey, tenant, status, lastHealthCheck), ai-models (provider, modelId, capabilities, contextWindow, maxOutput, embedDims, prices, languagesVerified, enabled), ai-routes (taskClass, scope global/module/tenant/locale, models ordered, timeoutMs, maxRetries), ai-tickets (shared; see note).
search: ai_offerings table (offeringId, title, price, currency, inStock, categoryIds, locale, embedding), ai-search-events (query, filters, results, clickedId, sessionId hashed), ai-recs (offeringId, kind, items, computedAt).
content: ai-generations (target doc+field, prompt version, output, accepted).
marketing: ai-campaigns + ai-email-drafts (segment, steps, subject, html, text, status, approvedBy, sentAt), ai-segments (definition structured filter, size, refreshedAt).
support: ai-tickets (source, customer, topic, priority, sentiment, status, suggestedReply, assignee), ai-review-insights (offeringId, summary, themes, flagged).
channels: ai-channel-identities (channel, externalId hashed, customer, verifiedAt).
insights: ai-insight-reports (question, metric calls, answer, period).
copilot: ai-automations + ai-automation-runs (trigger, steps, approval rule; run status, outputs).
Rules: money in integer minor units; customer ids hashed where only used for joining; vectors in plugin-owned tables via committed migrations (CREATE EXTENSION vector); segments stored as structured filters, never SQL.
NOTE (implementation decision): ai-tickets is owned by ai-core (minimal schema) because the assistant's hand-off (phase 2) precedes ai-support (phase 3); ai-support adds triage behavior, views and hooks on top.

## 9. APIs
All under /api/ai, guard pipeline, error shape { code, message, details?, requestId }.
POST /api/ai/assistant/chat (visitor/customer/staff; SSE text, product cards, confirmation cards)
POST /api/ai/actions/:id/confirm (customer/staff; Idempotency-Key header required)
GET /api/ai/search?q=&filters=&cursor= (anyone)
GET /api/ai/recs?offering=&kind= (anyone)
POST /api/ai/search/events (storefront)
POST /api/ai/content/generate (staff; streams) · POST /api/ai/content/bulk (staff admin; returns job id)
POST /api/ai/marketing/drafts (staff) · POST /api/ai/marketing/campaigns/:id/approve (approver)
POST /api/ai/support/tickets/:id/suggest (support staff)
POST /api/ai/insights/ask (manager; streams answer + chart data)
POST /api/ai/media/:op (staff: alt text, tag, remove background, variations)
POST /api/ai/copilot/chat (staff)
POST /api/ai/channels/:channel/webhook (signature verified)
GET /api/ai/usage (admin)
Channels: verify provider signature on raw body, dedupe by message id, map to customer through ai-channel-identities, same assistant & tools. Order lookups need verified identity: link channel once with a one-time code to account email/phone. Replies via the channel API in a job, respecting rules (WhatsApp 24-hour window; approved templates outside it).
One-line install (see packages/ai-suite README): aiSuite({ preset, providers, routes, allowTenantKeys, modules: { content, search: {hybrid, recommendations}, assistant: {tools, handoff}, marketing: {approvalRole}, support: {autoAnswerConfidence}, channels: {whatsapp: {phoneNumberIdEnv}, messenger}, insights, media, copilot: {automations} }, locales, budgets: { monthlyMicros, perModule }, tenant: { field } }). Options typed with CollectionSlug.

## 10. Module deep dives
10.1 Assistant: guard (identity, Turnstile first anonymous message, limits, budget) → save user msg; context = system policy + brand voice + thread summary + last turns + page context → tools: searchOfferings, getOffering, checkStock, getPolicy, searchKnowledge, addToCart, getOrderStatus, proposeReturn, captureLead, bookSlot, handOff → structured cards rendered by ai-react (prices/stock from tools) → order tools need logged-in customer or verified channel identity; guests: order number + email then one-time code → hand-off creates ai-tickets with summary + transcript; shopper sees expected reply time → every conversation tags outcome: answered, added to cart, ordered within 24 h, handed off, abandoned (conversion & deflection per prompt version).
10.2 Search: short queries straight to search; longer ones → fast model → typed filter object (category, price range, color, size, in stock) validated against real catalog values. Retrieval: pgvector top 100 with SQL filters + full-text top 100 → reciprocal rank fusion → business rules (in stock first, boosted) → top 24. Fallback: AI parsing slow (>150 ms) or budget spent → plain keyword search. Recs: similar = vector neighbours; bought-together = nightly order co-occurrence; for-you = recent views + purchases; stored in ai-recs, edge-cached. Learning loop: weekly report of zero-result and low-click queries with AI-suggested synonyms and missing products for staff approval.
10.3 Content Studio: AI buttons on mapped fields (write, rewrite, shorten, tone, translate, SEO meta, FAQ from description); product from photo/spec sheet (vision extracts attributes into a review form); auto-tagging & category suggestions checked against existing categories only; bulk enrichment: select → template → job writes drafts → review screen accept-all/each/discard (provider batch mode); rich text: model writes Markdown → Lexical via the rich-text package converter. Nothing publishes automatically.
10.4 Marketing: segments: staff describe audience → reason model → structured filter over orders/customers, shows count + sample, staff save; runs through adapters, never model SQL. Campaigns & sequences: abandoned cart, welcome, win-back, post-purchase review request; AI drafts each step (subject variants, body, product blocks from recs); marketing approver approves; sends are jobs via the email adapter with per-recipient idempotency and unsubscribe handling. Social/promo copy drafts with per-platform character limits.
10.5 Support Inbox: every ticket (form, email, channel, hand-off) triaged in a job: topic, priority, sentiment, language, linked order. Suggested reply grounded in policies + the order; agent edits & sends. Auto-answer only for allow-listed topics above the confidence bar. Reviews: weekly summaries per product, themes, moderation flags (abuse/spam) held for staff.
10.6 Insights: model never writes SQL; picks typed metric tools revenue(period, groupBy), topProducts, repeatRate, cartAbandonment, searchZeroResults, aiImpact — read-only, through adapters, tenant-scoped. Text + chart data; numbers in text must match tool output (checked). Scheduled daily/weekly briefings and anomaly alerts (metric outside normal band) as jobs posting to admin + email.
10.7 Media: alt text & tags on upload (job from Media afterChange). Background removal & variations via image model class; outputs saved as NEW Media docs, never replacing originals. Generated images labelled AI-generated in metadata.
10.8 Copilot: admin chat with staff tools (find, summarize, draft, bulk-edit preview); writes always shown as a diff for approval. Automations: trigger (collection event or schedule) → AI steps (classify, summarize, draft) → optional approval → action (notify, create draft, tag). Each run recorded in ai-automation-runs with inputs, outputs, cost.

## 11. Failure modes — AI may fail, the store may not
LLM slow/down: 30 s timeout, retry once, fallback model, circuit breaker opens after 5 failures in 60 s; assistant says busy + contact options. Embedding down: keyword search; content waits in embed queue. Budget exhausted: blocked before provider call; assistant offers contact; search keyword; staff "limit reached". Tool error: "I couldn't check that right now" + hand-off; never guess prices/stock/order status. Wrong adapter map: startup validation disables the tool and logs why. Stale index: embed on change + nightly drift repair. Channel API down: outbound queued & retried; inbound deduped. Email failure: transient retried, permanent not; never double-sent. Jobs worker down: jobs persist & resume. Model invents fact: cards from tools; output check compares numbers; citations required. Action confirmed twice: idempotency key.

## 12. Security
Model is untrusted: acts only through tools; tools act with caller's Payload access; risky needs confirmation.
Access matrix: Models/keys/budgets/modules → super admin only. Prompts/brand voice/automations → super admin, store admin. Content & media AI → + content role. Campaign approve/send → + marketing approver. Support replies → + support role. Insights → + manager role. Search/recs/assistant Q&A → everyone incl. anonymous. Own order status/returns → logged-in customer (own only); anonymous after order no. + email + one-time code. Add to cart/leads/bookings → customers and visitors.
Threats: AI proxy abuse (Turnstile, per-visitor/IP limits, short max output, topic policy, budgets, WAF); prompt injection (tiers in code, retrieved text as quoted data, no write tools above Low-risk on shopper channels, confirmation cards); cross-customer orders (session/verified identity, adapter filters by customer, tests); price/stock lies (rendered from tools, output check); insights leak (metric tools, read-only, tenant-scoped); key leak (server-only, env, log scrubbing); XSS (sanitized markdown/HTML); marketing spam (approval, unsubscribe, daily limits); channel spoofing (signatures, dedupe); personal data (aiExclude fields never leave server; opt-in deletable customer memory; no-training; DPAs). AI notice in assistant; label AI images.

## 13. Observability
One requestId through every model call & tool run. JSON logs (requestId, traceId, module, task, prompt version, model, tenant, actor type, tokens, cost, latency, outcome; never full prompts). OpenTelemetry spans guard→retrieval→model→tool→save (GenAI semconv). Sentry with scrubbing.
Metrics: assistant → conversations leading to order within 24 h (+ deflection, hand-off, thumbs-down); search → search→add-to-cart (+ zero-result, CTR, fallback); recs → revenue from recommended items; content → acceptance rate; marketing → revenue per email; support → first-response time; insights → weekly active managers.
Alerts: provider error > 5% for 5 min; TTFT p95 > 3 s; search p95 > 300 ms; oldest job > 10 min; dead-lettered job; budget 80/100%; daily spend > 2× 7-day avg; thumbs-down > 20% over 100 ratings per prompt version.
Quality loop: golden sets per module & language run on every prompt/model change; ship only without regression. Cost levers: cheapest capable model, compact tool results, summaries, prompt caching, batch, cache query embeddings & SEO outputs by hash.

## 14. Testing
CI: dev-store (Ecommerce plugin) and dev-services with real Postgres + pgvector and mock models. Unit (Vitest): router, tiers, prompt rendering, chunker, filter parser, cost/budget math, sanitizer. Plugin config snapshots (adds only own config; keeps existing hooks/onInit; disabling removes endpoints/UI). Adapter contract tests per preset. Access & isolation (customer A vs B; tenant A vs B incl. vectors/usage/chats; visitor can't reach Confirm without verification). Agent behavior (mock model scripts). Jobs/channels (retries, idempotent sends, webhook signatures, dedupe, WhatsApp window). E2E Playwright + Mailpit. Evals in tooling/. Load k6 (50 streams, 15 searches/s). Security (injection, XSS, oversized input, replayed webhooks, budget bypass).

## 15/16. Decisions & roadmap
Vercel AI SDK provider layer; pgvector in same Postgres; hybrid ranking with RRF; typed metric tools not text-to-SQL; Payload Jobs Queue; Postgres only v1; human in the loop.
Phases: 0 core + adapters + ecommerce preset + dev-store + eval/CI; 1 content + search; 2 assistant; 3 marketing, support, channels; 4 insights, media, copilot, services & content presets. Each module behind its own switch in ai-settings; turning it off hides UI and blocks endpoints without deleting data.
