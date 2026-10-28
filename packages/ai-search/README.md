# payload-ai-search

Smart Search & Recommendations for the Payload AI Suite (design doc §10.2). It combines semantic and keyword search, turns plain-language queries into real catalog filters, and serves similar, bought-together and for-you recommendations. It also runs a weekly learning loop, and search keeps working when AI calls fail.

```ts
import { aiCore } from 'payload-ai-core'
import { aiSearch } from 'payload-ai-search'

plugins: [
  aiCore({ /* providers, routes, adapters … */ }),
  aiSearch({
    hybrid: true,                 // vector + full-text RRF (false = keyword only, no model calls)
    recommendations: true,
    queryUnderstanding: { minWords: 4, timeoutMs: 150 }, // or false
    pageSize: 24,
    boosts: { 'prod-123': 1.5 },  // multiplier; <= 0 hides
    synonyms: { tee: ['t-shirt'] },
  }),
]
```

Requires the `offering` concept. Without an `order` adapter, bought-together and purchase-based for-you return nothing.

## Endpoints

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/api/ai/search?q=&filters=&cursor=&limit=&session=` | anyone, `budget:false`, 60/min | Returns `SearchResponse` with `searchId`. `filters` is JSON `{categoryIds, priceMin, priceMax (minor units), inStock, attributes}` |
| POST | `/api/ai/search/events` | anyone, 120/min | `SearchEventBody`: `click`, `add-to-cart` or `impression`, with `searchId` |
| GET | `/api/ai/recs?offering=&kind=similar\|bought-together\|for-you&session=` | anyone, `budget:false` | `RecsResponse`. Similar and bought-together send `Cache-Control: public, s-maxage=3600, stale-while-revalidate`; for-you sends `private` |

## Search pipeline

1. A deterministic price parser runs on every query. For example, "under 3,000 taka" becomes `priceMax 300000` in BDT minor units. It also reads ranges, `5k`, currency symbols and Bangla digits.
2. Queries of at least `minWords` words also go to the `fast` model, which returns a typed filter object `{text, categoryIds, priceMin, priceMax, color, size, inStock, attributes}`. The call is raced against `timeoutMs`. Every value is checked against `adapter.facets()`, which is cached for 5 minutes, and anything that isn't a real value is dropped. The dropped values are listed in `parsedFilters.dropped`.
3. The query embedding is served from an LRU cache keyed by the normalised query. It runs alongside step 2 and has its own timeout (`embedTimeoutMs`, default 250 ms).
4. Retrieval calls `services.vectors.query('ai_offerings', {embedding, text, k, where})`, which does the hybrid RRF inside the store. Synonym variants run as extra keyword lists and are merged in with RRF.
5. Business rules: boosts are applied first, then in-stock items are ranked ahead of out-of-stock ones. Results are paginated with an opaque cursor, and facet counts cover the whole result set.
6. Fallbacks: if the budget is spent, the embedding fails or times out, or the vector store errors, search switches to keyword mode (vector full-text, then `adapter.search`). `mode` and `fallbackReason` report what happened. Search never fails because of AI.
7. Each first page writes one `ai-search-events` row: query, filters, top result ids, a hashed session id, a zero-result flag, latency and mode.

Programmatic use: `searchOffers(payload, { q, filters, cursor, limit }, ctx)`.

## Indexing

- `afterChange` and `afterDelete` hooks on the mapped offering collections queue `ai-search-index-offering`. Drafts are skipped, and unpublishing removes the offering from the index.
- The job loads the offering with `adapter.get`, embeds `adapter.toEmbeddingText`, and upserts it unless its content hash is unchanged.
- `ai-search-reindex` reindexes everything in batches of 100. It is scheduled nightly at 03:00 for drift repair, and the hash check makes it cheap.
- `onInit` calls `vectors.ensureTable(OFFERINGS_TABLE, activeEmbedding.dims)`. For production, generate a migration with `offeringsMigrationSQL(services.vectors, dims)`.

## Recommendations

- **similar**: vector neighbours of the offering. Computed lazily, stored in `ai-recs` for 24 h, and edge-cached. If embedding fails, it falls back to the same category.
- **bought-together**: the nightly `ai-search-recs-cooccurrence` job reads orders from the last 180 days, counts pairs once per order, and stores the top 12 for each offering.
- **for-you**: a weighted centroid of the session's clicks and add-to-carts plus the customer's recent purchases. Items the shopper has already seen are excluded.

## Learning loop

`ai-search-learning-report` runs weekly (Monday 04:00) and writes an `ai-search-reports` row with:
- zero-result queries
- low-click queries (at least 3 searches and CTR below 5%)
- AI-suggested synonyms and missing products, both stored as `pending`

Content staff set a synonym to `approved`, and it applies at query time right away (the cache is cleared by a hook).

## Agent tools

- `searchOfferings` (read). Input: `{query, maxPrice?, minPrice? (major units), categoryIds?, inStock?, limit ≤ 8}`. Returns `{id, title, price, inStock}` plus a `products` card.
- `recommendOfferings` (read). Input: `{kind, offeringId?, limit ≤ 8}`.

## Collections

`ai-search-events` (staff read; written only by endpoints), `ai-recs`, and `ai-search-reports` (content role can approve). All are in the AI Suite admin group.
