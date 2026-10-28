/**
 * Business concept adapter contracts (design doc §3).
 * Implementations and presets live in payload-ai-adapters; the types live
 * here so core and every module can depend on them without a cycle.
 *
 * Rules:
 * - Money is always integer minor units.
 * - Every function takes an AdapterContext. When `system` is false the adapter MUST call the
 *   Local API with `overrideAccess: false` and the caller's `req`/`user`, so it never widens access.
 * - When `system` is true (jobs, indexing) the adapter may use overrideAccess but MUST still scope
 *   by tenant when `tenant` is set and MUST skip drafts / unpublished docs for anything shopper-facing.
 */
import type { Payload, PayloadRequest, TypedUser } from 'payload'

export type ConceptName =
  | 'offering'
  | 'category'
  | 'customer'
  | 'order'
  | 'cart'
  | 'knowledge'
  | 'lead'
  | 'review'
  | 'booking'

export const CONCEPTS: readonly ConceptName[] = [
  'offering',
  'category',
  'customer',
  'order',
  'cart',
  'knowledge',
  'lead',
  'review',
  'booking',
]

export interface AdapterContext {
  payload: Payload
  req?: PayloadRequest
  user?: TypedUser | null
  /** Verified customer id (logged-in customer or verified channel identity). */
  customerId?: string
  locale?: string
  tenant?: string | number
  /** True for jobs/indexing. Never true for a shopper request. */
  system?: boolean
}

export interface Money {
  /** Integer minor units (e.g. paisa, cents). */
  amount: number
  currency: string
}

export type AttributeValue = string | number | boolean | string[]

/* ---------- Offering ---------- */

export interface OfferingSummary {
  id: string
  title: string
  slug?: string
  url?: string
  price?: Money
  compareAtPrice?: Money
  inStock?: boolean
  stock?: number | null
  imageUrl?: string
  categoryIds: string[]
  tags?: string[]
}

export interface OfferingVariant {
  id: string
  title: string
  price?: Money
  inStock?: boolean
  stock?: number | null
  options: Record<string, string>
}

export interface Offering extends OfferingSummary {
  description?: string
  attributes: Record<string, AttributeValue>
  variants?: OfferingVariant[]
  images: string[]
  status?: 'published' | 'draft'
  locale?: string
  updatedAt?: string
}

export interface OfferingQuery {
  text?: string
  ids?: string[]
  categoryIds?: string[]
  priceMin?: number
  priceMax?: number
  inStock?: boolean
  attributes?: Record<string, string | string[]>
  sort?: 'relevance' | 'price-asc' | 'price-desc' | 'newest'
  limit?: number
  page?: number
}

export interface Facets {
  categories: { id: string; title: string }[]
  attributes: Record<string, string[]>
  priceRange?: { min: number; max: number; currency: string }
}

export interface OfferingAdapter {
  collection: string
  fields: Record<string, string>
  get(id: string, ctx: AdapterContext): Promise<Offering | null>
  search(q: OfferingQuery, ctx: AdapterContext): Promise<{ items: OfferingSummary[]; total: number }>
  checkStock(
    id: string,
    variantId: string | undefined,
    ctx: AdapterContext,
  ): Promise<{ inStock: boolean; stock: number | null }>
  /** Published offerings for indexing. */
  iterate(opts: { since?: Date; batchSize?: number }, ctx: AdapterContext): AsyncIterable<Offering>
  /** Text used to embed an offering. */
  toEmbeddingText(o: Offering): string
  /** Real values for validating AI-parsed filters (§10.2). */
  facets(ctx: AdapterContext): Promise<Facets>
  /** Map a raw Payload doc of `collection` to an Offering (used by afterChange hooks). */
  fromDoc(doc: Record<string, unknown>, ctx: AdapterContext): Offering
}

/* ---------- Category ---------- */

export interface Category {
  id: string
  title: string
  slug?: string
  parentId?: string
}

export interface CategoryAdapter {
  collection: string
  fields: Record<string, string>
  list(ctx: AdapterContext): Promise<Category[]>
  get(id: string, ctx: AdapterContext): Promise<Category | null>
}

/* ---------- Customer ---------- */

export interface Customer {
  id: string
  email?: string
  name?: string
  phone?: string
  createdAt?: string
  marketingOptIn?: boolean
}

export interface CustomerAdapter {
  collection: string
  fields: Record<string, string>
  /** The customer behind ctx (user or verified customerId), or null. */
  current(ctx: AdapterContext): Promise<Customer | null>
  get(id: string, ctx: AdapterContext): Promise<Customer | null>
  findByEmail(email: string, ctx: AdapterContext): Promise<Customer | null>
  iterate(opts: { batchSize?: number }, ctx: AdapterContext): AsyncIterable<Customer>
}

/* ---------- Order / booking ---------- */

export interface OrderItem {
  offeringId: string
  variantId?: string
  title: string
  quantity: number
  price: Money
}

export interface OrderSummary {
  id: string
  number?: string
  status: string
  total: Money
  createdAt: string
  itemCount: number
}

export interface Order extends OrderSummary {
  customerId?: string
  customerEmail?: string
  items: OrderItem[]
  paymentStatus?: string
  shipping?: { status?: string; carrier?: string; trackingNumber?: string; trackingUrl?: string; eta?: string }
}

export interface ReturnRequestInput {
  orderId: string
  items: { offeringId: string; variantId?: string; quantity: number }[]
  reason: string
  kind: 'return' | 'exchange'
}

export interface OrderAdapter {
  collection: string
  fields: Record<string, string>
  /** Must return null (not throw) when the order does not belong to ctx's customer. */
  getForCustomer(orderId: string, ctx: AdapterContext): Promise<Order | null>
  listForCustomer(ctx: AdapterContext, opts?: { limit?: number }): Promise<OrderSummary[]>
  /** Guest verification step: system-only lookup by order number + email. */
  findByNumberAndEmail(number: string, email: string, ctx: AdapterContext): Promise<Order | null>
  /** Orders in a period, for insights/recs/segments (system or staff ctx). */
  iterate(opts: { from?: Date; to?: Date; batchSize?: number }, ctx: AdapterContext): AsyncIterable<Order>
  createReturnRequest(input: ReturnRequestInput, ctx: AdapterContext): Promise<{ id: string; status: string }>
}

/* ---------- Cart ---------- */

export interface Cart {
  id: string
  items: { offeringId: string; variantId?: string; title: string; quantity: number; price?: Money }[]
  subtotal?: Money
  customerId?: string
  updatedAt?: string
}

export interface CartAdapter {
  collection: string
  fields: Record<string, string>
  get(ctx: AdapterContext & { cartId?: string }): Promise<Cart | null>
  addItem(
    input: { offeringId: string; variantId?: string; quantity: number; cartId?: string },
    ctx: AdapterContext,
  ): Promise<Cart>
  listAbandoned(opts: { olderThan: Date; limit?: number }, ctx: AdapterContext): Promise<Cart[]>
}

/* ---------- Knowledge ---------- */

export type Visibility = 'public' | 'customers' | 'staff'

export interface KnowledgeDoc {
  sourceCollection: string
  sourceId: string
  title: string
  /** Plain text (rich text already flattened). */
  text: string
  url?: string
  locale?: string
  visibility: Visibility
  updatedAt?: string
}

export interface KnowledgeAdapter {
  collections: string[]
  iterate(opts: { since?: Date; batchSize?: number }, ctx: AdapterContext): AsyncIterable<KnowledgeDoc>
  /** Returns null for drafts / docs that must not be indexed. */
  toKnowledgeDoc(collection: string, doc: Record<string, unknown>, ctx: AdapterContext): KnowledgeDoc | null
}

/* ---------- Lead / ticket ---------- */

export interface LeadInput {
  name?: string
  email?: string
  phone?: string
  message: string
  source: string
  meta?: Record<string, unknown>
}

export interface LeadAdapter {
  collection: string
  fields: Record<string, string>
  create(input: LeadInput, ctx: AdapterContext): Promise<{ id: string }>
}

/* ---------- Review ---------- */

export interface Review {
  id: string
  offeringId: string
  rating?: number
  title?: string
  body: string
  authorName?: string
  createdAt: string
  status?: string
}

export interface ReviewAdapter {
  collection: string
  fields: Record<string, string>
  listForOffering(offeringId: string, ctx: AdapterContext, opts?: { limit?: number }): Promise<Review[]>
  iterate(opts: { since?: Date; batchSize?: number }, ctx: AdapterContext): AsyncIterable<Review>
  /** Hold a review for staff (moderation flag). */
  setHeld?(id: string, held: boolean, ctx: AdapterContext): Promise<void>
}

/* ---------- Booking (services preset) ---------- */

export interface Slot {
  start: string
  end: string
  staffId?: string
  locationId?: string
}

export interface BookingAdapter {
  collection: string
  fields: Record<string, string>
  availability(
    input: { offeringId: string; from: Date; to: Date; locationId?: string },
    ctx: AdapterContext,
  ): Promise<Slot[]>
  bookTentative(
    input: { offeringId: string; slot: Slot; name?: string; email?: string; phone?: string; notes?: string },
    ctx: AdapterContext,
  ): Promise<{ id: string; status: 'tentative' }>
}

/* ---------- Set ---------- */

export interface AdapterSet {
  offering?: OfferingAdapter
  category?: CategoryAdapter
  customer?: CustomerAdapter
  order?: OrderAdapter
  cart?: CartAdapter
  knowledge?: KnowledgeAdapter
  lead?: LeadAdapter
  review?: ReviewAdapter
  booking?: BookingAdapter
}

export interface AdapterValidationResult {
  concept: ConceptName
  ok: boolean
  collection?: string
  problems: string[]
}

/** What payload-ai-adapters hands to the core. */
export interface AdapterProvider {
  preset: string
  /**
   * Config-time map of concept -> collection slugs (no Payload instance needed).
   * Used to attach afterChange/afterDelete hooks (indexing, triage, alt text) at config time.
   */
  mappedCollections(): Partial<Record<ConceptName, string[]>>
  /** Build adapters (called once at init, after collections exist). */
  build(payload: Payload): AdapterSet
  /** Validate every mapped collection and field against payload.config. */
  validate(payload: Payload): AdapterValidationResult[]
}
