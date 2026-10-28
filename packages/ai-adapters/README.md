# @payload-ai-suite/ai-adapters

Business concept adapters for the Payload AI Suite (design doc §3). The AI modules never hard-code collection
names. They work with **concepts** (Offering, Category, Customer, Order, Cart, Knowledge, Lead, Review, Booking)
and use this package to map those concepts onto your collections and fields. Every call goes through the Payload Local API with the caller's
access. The adapter contracts are defined in `@payload-ai-suite/ai-core` (`contracts/adapters.ts`).

```ts
import { createAdapters } from '@payload-ai-suite/ai-adapters'

aiSuite({
  adapters: createAdapters({ preset: 'ecommerce' }), // zero config for @payloadcms/plugin-ecommerce
})
```

`createAdapters(options)` returns an `AdapterProvider`:

- `mappedCollections()` gives the concept → collection slugs at config time, without a Payload instance. It lists
  candidate slugs, so intersect them with `config.collections` before you attach hooks.
- `validate(payload)` checks every mapped collection and field path against `payload.config` and returns one
  result per concept: `{ concept, ok, collection, problems, warnings }`. It descends into groups, named or unnamed tabs,
  rows, collapsibles, arrays, blocks (including `blockReferences`) and across relationship, upload and join fields.
- `build(payload)` returns an `AdapterSet` that holds only the concepts that passed validation. The core turns off
  the tools that need a missing concept. `formatValidation(results)` produces startup log lines.

## Presets

| preset | concepts | defaults |
|---|---|---|
| `ecommerce` | offering, category, customer, order, cart, knowledge, lead, review | Official Ecommerce plugin: `products` (+ `variants`, `variantTypes`, `variantOptions`), `carts`, `orders`, customers = `users` filtered by `roles` contains `'customer'` (when that field exists), `categories`, knowledge = whichever of `pages`/`posts`/`faqs`/`policies` exist, leads → `leads` or `ai-tickets`, reviews → `reviews`/`product-reviews` if present |
| `services` | offering, category, customer, booking, knowledge, lead, review | `services`, `bookings` (or `appointments`), `staff`, `locations`, customers = `customers` or `users` |
| `content` | category, customer, knowledge, lead | knowledge = `pages`, `posts`, `faqs`, `authors`. No offering. |
| `custom` | only what you map | everything comes from `custom` |

Preset defaults are **candidates**: the first collection or field that exists wins. A default that is missing is
dropped with a warning. Anything you set explicitly must exist. If it doesn't, `validate` reports a problem and the concept is disabled.
"Wrong map fails loudly."

### Ecommerce plugin facts the preset relies on (verified against 3.92.1)

- Prices: `priceIn<CODE>` number fields, plus a `priceIn<CODE>Enabled` checkbox, sit inside an unnamed group/row,
  so the data is top level: `priceInUSD`, `priceInBDT`. They are stored in **minor units** (the plugin UI multiplies by
  `10^decimals`). The preset detects the currency from the first `priceIn<CODE>` field on `products`. Set
  `offering.currency` to pick a different one.
- Stock: `inventory` on products. When `enableVariants` is set, stock lives on each `variants` doc, which also holds
  `inventory`, `priceIn<CODE>`, `options` (→ `variantOptions` `{label, value, variantType}`) and `product`. The
  offering's `stock` is the sum across variants and `inStock` is true if any variant is in stock.
- The plugin does not add `title`, `slug`, `gallery`, `description` or `categories`. Your site adds them, as the official
  template does. The preset tries `title`, `slug`, `description`, `gallery.0.image` (template gallery rows),
  `gallery.0`, `image` and `categories`.
- Orders: `items[] { product, variant?, quantity }` with no per-line price, plus `amount` (total, minor units), `currency`,
  `status` (`processing|completed|cancelled|refunded`), `customer` (→ `users`) and `customerEmail`. There is no order
  number field, so the order **id** is the number. Line prices and titles come from the populated variant or product.
- Carts: `items[] { product, variant?, quantity }`, `customer`, `subtotal` (computed by the plugin hook), `currency`,
  `purchasedAt`, and a hidden `secret` for guest carts. When the adapter creates a guest cart it returns
  `cart.secret` once (`CartWithSecret`). To reach an existing guest cart, pass `cartSecret` (on `addItem` input or the
  `get` ctx), or let the request carry `?secret=`.
- There are no returns. `order.createReturnRequest` creates an **`ai-tickets`** doc instead: `source: 'assistant'`,
  `subject`, `customerId`, `customerEmail`, `linkedOrderId`, `topic: 'return' | 'exchange'`, `transcript` (JSON with
  reason and items), `status: 'open'`.

## Overrides

`overrides` (and `custom`) are per-concept partial configs merged over the preset:

- `collection` replaces the preset's slug.
- `fields` merges key by key. Values are **dot paths**: `'name'`, `'meta.title'`, `'gallery.0.image'`,
  `'gallery.0'`, `'details.material'`, `'category.title'` (paths continue across relationships). `null` removes a default.
- Any other option replaces the preset's. Set a concept to `false` to turn it off.
- `tenantField` (top level, default `'tenant'`) scopes reads and creates when `ctx.tenant` is set. It is applied only to
  collections that have the field. You can set it per concept, or turn it off with `tenantField: null`.
- `published`: `'auto'` (default; `_status === 'published'` when drafts are enabled), `false`, or
  `{ field: 'status', equals: 'approved' }`. Shopper-facing reads (offerings, categories, knowledge, reviews) only
  return published docs, and so do `system` jobs.

```ts
createAdapters({
  preset: 'ecommerce',
  overrides: {
    offering: {
      collection: 'products',
      fields: { title: 'name', price: 'priceBDT', image: 'gallery.0' },
      currency: 'BDT',                       // ISO code for Money
      priceUnit: 'minor',                    // or 'major' (decimals; converted with currencyDecimals, default 2)
      urlPattern: '/products/{slug}',        // {any.path} or {id}
      attributes: { material: 'details.material', color: 'color' }, // filterable + facets
      searchFields: ['name', 'sku'],
      variants: false,
    },
    knowledge: {
      collections: [
        'pages',
        'faqs',
        { collection: 'policies', fields: { body: ['content', 'extra.layout'], visibility: 'audience' }, urlPattern: '/policies/{slug}' },
      ],
    },
    order: { returns: { collection: 'returns', fields: { subject: 'title', linkedOrderId: 'order' }, data: { channel: 'ai' } } },
    customer: { role: { field: 'roles', value: 'customer' } },
    review: { published: { field: 'status', equals: 'approved' }, held: { field: 'status', heldValue: 'held', releasedValue: 'approved' } },
  },
})
```

### Custom mapping example

```ts
createAdapters({
  preset: 'custom',
  custom: {
    offering: {
      collection: 'listings',
      fields: { title: 'name', price: 'rent', image: 'photos.0', categories: 'area', stock: null },
      currency: 'BDT',
      priceUnit: 'major',
      urlPattern: '/rent/{slug}',
    },
    lead: { collection: 'enquiries', fields: { name: 'fullName', email: 'email', message: 'body' } },
    knowledge: { collections: ['pages', 'faqs'] },
  },
})
// order, cart, customer, booking, ... are absent → ok:false "not configured" → tools needing them are disabled.
```

### Concept field keys

- offering: `title slug description price priceEnabled compareAtPrice currency stock inStock image images categories tags enableVariants createdAt updatedAt`. Variant keys: `title product options price priceEnabled stock`.
- category: `title slug parent` · customer: `email name phone createdAt marketingOptIn`
- order: `number status total currency customer customerEmail items itemOffering itemVariant itemQuantity itemPrice itemTitle paymentStatus shippingStatus carrier trackingNumber trackingUrl eta createdAt`. The `item*` keys are relative to `items`.
- cart: `items itemOffering itemVariant itemQuantity itemPrice customer subtotal currency purchasedAt updatedAt`
- knowledge (per collection): `title body(string | string[]) slug updatedAt visibility`. Without an explicit body, every rich text and blocks field found is used.
- lead: `name email phone message source meta` · review: `offering rating title body author createdAt status`
- booking: `service start end staff location status name email phone notes customer`. Options:
  `services: { collection, durationField, defaultDurationMinutes }`, `staff: { collection, servicesField, locationField } | false`,
  `locations: { collection, hoursField } | false` (rows `{ day: 'mon'|'monday', open: '09:00', close: '17:00' }`),
  `openingHours`, `slotStepMinutes`, `utcOffsetMinutes`, `tentativeStatus` (default `'tentative'`), `freeStatuses`, `maxSlots`.

## Field-mapping engine

Exported for modules that read mapped docs directly:

- `getPath` and `setPath`: dot paths, array indexes, fan-out over arrays, polymorphic relations, and localized `{ en, bn }` maps.
- `relId`, `relIds` and `relDoc`: relationship ids from raw ids or from populated docs.
- `uploadUrl` and `uploadUrls`: URLs from upload docs or from wrapper rows such as `{ image }`.
- `lexicalToText`: flattens a Lexical JSON tree. `toText` also flattens blocks.
- `toMinor`: converts an amount to integer minor units.
- `fillPattern`: fills `{field}` placeholders in a URL pattern.
- `resolveFieldPath` and `hasFieldPath`: look up a dot path in the collection schema.

## Access & safety rules (enforced in code)

- When `ctx.system` is falsy, every Local API call uses `overrideAccess: false` with `req`, `user` and `locale`.
- `order.getForCustomer` and `listForCustomer` filter by the owner (`ctx.customerId ?? ctx.user.id`), **and** check
  `customer` on the returned doc. With no identity they return `null` or `[]`.
- `order.findByNumberAndEmail` throws `AIError('forbidden')` unless `ctx.system`, and it matches the email case-insensitively.
- `createReturnRequest` re-checks ownership, then checks that the items and quantities belong to the order. It creates
  the ticket with the caller's access. Set `returns.createAs: 'system'` if your tickets collection doesn't allow
  customer creates.
- Booking availability is the one deliberate exception. It reads busy times (bookings and the staff roster) with
  system access, scoped by tenant, because shoppers can't read other people's bookings. It uses only times and ids,
  and it returns no booking data. `bookTentative` re-checks the slot, then creates the booking with the caller's access.

## Testing

`@payload-ai-suite/ai-adapters/testing` exports `createFakePayload()`, an in-memory Local API for adapter-backed
tests. It supports `where` operators, sort, pagination, depth population (relationship, upload and join), simple
collection access, and a call log that records `overrideAccess`, `user` and `where`. The contract tests in `src/__tests__` run
the presets against the **real** `@payloadcms/plugin-ecommerce` collection factories.
