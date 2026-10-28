# payload-ai-react

Client-only storefront React components and hooks for the Payload AI Suite. React 19, no server dependencies; types come from `payload-ai-core/wire`.

```tsx
'use client'
import { AISuiteProvider, AssistantWidget, SearchBox, RecommendationsBlock } from 'payload-ai-react'

<AISuiteProvider baseUrl="/api/ai" locale="bn" turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}>
  <SearchBox onSubmit={(q) => router.push(`/search?q=${encodeURIComponent(q)}`)} />
  <RecommendationsBlock offeringId={product.id} kind="similar" title="You may also like" />
  <AssistantWidget page={{ offeringId: product.id, cartId }} greeting="Hi! How can I help?" loginUrl="/login" />
</AISuiteProvider>
```

## Hooks

- `useAssistantChat({ page?, storageKey?, resume? })` → `{ messages, conversationId, streaming, aiNotice, handedOff, error, send(text), stop(), confirmAction(actionId), rejectAction(actionId), feedback(messageId, 'up'|'down', comment?), reset(), verify: { status, message, start({orderNumber,email}), confirm(code) } }`. The conversation id is kept in localStorage and resumed via `GET /assistant/conversations/:id`. `confirmAction` sends a stable `Idempotency-Key` per action.
- `useSearch({ initialQuery?, filters?, mode?, debounceMs?, limit? })` → debounced search with `items`, `total`, `facets`, `parsedFilters`, `mode`, `loadMore()` (cursor pagination), `searchId`.
- `useRecommendations({ offeringId, kind, limit })`.
- `useSearchEvents()` → `trackClick`, `trackAddToCart`, `trackImpression` (fire-and-forget, `keepalive`).

## Components

`AssistantWidget` (floating launcher or `inline`; AI notice; `role="log"` message list with `aria-live`; Escape closes and focus returns to the launcher; safe Markdown), `CardView` and one component per wire card (`ProductCard`, `ProductsCard`, `StockBadge`, `CartCard`, `OrderCard`, `OrdersCard`, `ConfirmationCard`, `ActionResultCard`, `HandoffCard`, `SlotsCard`, `BookingCard`, `CitationsList`, `VerifyCard`, `ChartCard`), `SearchBox` (ARIA combobox), `SearchResults`, `RecommendationsBlock`.

Styling: default CSS injected once via `<AISuiteStyles />` (disable with `defaultStyles={false}`); theme with CSS variables on `.ais-root` (`--ais-accent`, `--ais-bg`, `--ais-fg`, `--ais-border`, `--ais-radius`, `--ais-font`…) or your own classes. Labels: English and Bangla built in, override with `labels`.

## Utilities

`parseSSE(stream)`, `createSSEParser(onMessage)`, `readWireEvents(stream)`, `formatMoney(money, locale)` (integer minor units → `Intl.NumberFormat`), `renderMarkdown(md)` (escapes all HTML; only p/br/strong/em/code/pre/lists and http(s)/mailto/tel/relative links), `chatReducer`.
