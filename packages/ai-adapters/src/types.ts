import type { ConceptName, ReturnRequestInput, Order, AdapterContext, Visibility } from '@payload-ai-suite/ai-core'
import type { CollectionSlug, Where } from 'payload'

/** A collection slug; typed against the site's generated types when present, any string otherwise. */
export type Slug = CollectionSlug | (string & {})

export type PresetName = 'ecommerce' | 'services' | 'content' | 'custom'

/**
 * How "published" is decided for shopper-facing reads.
 * - 'auto' (default): `_status === 'published'` when the collection has drafts enabled, otherwise everything.
 * - false: no check.
 * - { field, equals }: a site field (e.g. `{ field: 'status', equals: 'approved' }`).
 */
export type PublishedCheck = 'auto' | false | { field: string; equals: string | number | boolean }

/**
 * Logical field -> dot path in the collection (`'gallery.0.image'`, `'meta.title'`, `'priceInBDT'`).
 * `null` removes a preset default.
 */
export type FieldMap<F extends string> = Partial<Record<F, string | null>>

export interface ConceptBase<F extends string> {
  collection?: Slug
  fields?: FieldMap<F>
  /** Tenant field on this collection. Default: top-level `tenantField` ('tenant'). `null` disables scoping. */
  tenantField?: string | null
  published?: PublishedCheck
  /** Extra filter ANDed into every read (e.g. `{ type: { equals: 'product' } }`). */
  where?: Where
}

/* ---------- per concept ---------- */

export type OfferingField =
  | 'title'
  | 'slug'
  | 'description'
  | 'price'
  | 'priceEnabled'
  | 'compareAtPrice'
  | 'currency'
  | 'stock'
  | 'inStock'
  | 'image'
  | 'images'
  | 'categories'
  | 'tags'
  | 'enableVariants'
  | 'createdAt'
  | 'updatedAt'

export type VariantField = 'title' | 'product' | 'options' | 'price' | 'priceEnabled' | 'stock'

export interface OfferingConfig extends ConceptBase<OfferingField> {
  /** ISO currency code. Ecommerce preset auto-detects it from the first `priceIn<CODE>` field. */
  currency?: string
  /** 'minor' (default; ecommerce plugin stores cents/paisa) or 'major' (decimal numbers, converted). */
  priceUnit?: 'minor' | 'major'
  /** Decimals used when priceUnit is 'major'. Default 2. */
  currencyDecimals?: number
  /** Public URL pattern; `{slug}` and `{id}` are substituted. */
  urlPattern?: string
  /** Attribute name -> dot path. Values are exposed in `attributes` and facets, and filterable. */
  attributes?: Record<string, string>
  /** Fields matched with `like` for text search. Default: the mapped title. */
  searchFields?: string[]
  /** Variant collection (ecommerce plugin `variants`). false disables variants. */
  variants?: false | { collection?: Slug; fields?: FieldMap<VariantField> }
  /** When stock is not tracked (no stock field), report in stock. Default true. */
  inStockWhenUntracked?: boolean
}

export type CategoryField = 'title' | 'slug' | 'parent'
export type CategoryConfig = ConceptBase<CategoryField>

export type CustomerField = 'email' | 'name' | 'phone' | 'createdAt' | 'marketingOptIn'
export interface CustomerConfig extends ConceptBase<CustomerField> {
  /** Restrict to customers when the auth collection also holds staff. Ignored if the field doesn't exist. */
  role?: { field: string; value: string } | false
}

export type OrderField =
  | 'number'
  | 'status'
  | 'total'
  | 'currency'
  | 'customer'
  | 'customerEmail'
  | 'items'
  | 'itemOffering'
  | 'itemVariant'
  | 'itemQuantity'
  | 'itemPrice'
  | 'itemTitle'
  | 'paymentStatus'
  | 'shippingStatus'
  | 'carrier'
  | 'trackingNumber'
  | 'trackingUrl'
  | 'eta'
  | 'createdAt'

export type ReturnField =
  | 'source'
  | 'subject'
  | 'customerId'
  | 'customerEmail'
  | 'linkedOrderId'
  | 'topic'
  | 'transcript'
  | 'status'

export interface ReturnsConfig {
  /** Default 'ai-tickets' (owned by ai-core). */
  collection?: Slug
  fields?: FieldMap<ReturnField>
  /** Static data merged into the created document. */
  data?: Record<string, unknown>
  /**
   * 'caller': created with the caller's access (overrideAccess: false) — the target collection must allow create
   * for customers. 'system': created with overrideAccess after ownership has been verified.
   * Default: 'system' when the target is ai-tickets (staff-only create), otherwise 'caller'.
   */
  createAs?: 'caller' | 'system'
  /** Full control over the created document. */
  toData?: (input: ReturnRequestInput, order: Order, ctx: AdapterContext) => Record<string, unknown>
}

export interface OrderConfig extends ConceptBase<OrderField> {
  /** Fallback currency when the order has none. */
  currency?: string
  priceUnit?: 'minor' | 'major'
  currencyDecimals?: number
  returns?: ReturnsConfig
}

export type CartField =
  | 'items'
  | 'itemOffering'
  | 'itemVariant'
  | 'itemQuantity'
  | 'itemPrice'
  | 'customer'
  | 'subtotal'
  | 'currency'
  | 'purchasedAt'
  | 'updatedAt'

export interface CartConfig extends ConceptBase<CartField> {
  currency?: string
}

export type KnowledgeField = 'title' | 'body' | 'slug' | 'updatedAt' | 'visibility'

export interface KnowledgeCollectionConfig {
  collection: Slug
  /** `body` may list several paths; they are concatenated. */
  fields?: Partial<Record<Exclude<KnowledgeField, 'body'>, string | null>> & { body?: string | string[] | null }
  urlPattern?: string
  /** Visibility when the doc has no visibility field value. Default 'public'. */
  visibility?: Visibility
  published?: PublishedCheck
  tenantField?: string | null
}

export interface KnowledgeConfig {
  collections?: (Slug | KnowledgeCollectionConfig)[]
}

export type LeadField = 'name' | 'email' | 'phone' | 'message' | 'source' | 'meta'
export interface LeadConfig extends ConceptBase<LeadField> {
  data?: Record<string, unknown>
  /** Default: 'system' when the target is ai-tickets (staff-only create), otherwise 'caller'. */
  createAs?: 'caller' | 'system'
}

export type ReviewField = 'offering' | 'rating' | 'title' | 'body' | 'author' | 'createdAt' | 'status'
export interface ReviewConfig extends ConceptBase<ReviewField> {
  /** How to hold a review: boolean field, or a status field with held/released values. */
  held?: false | { field: string; heldValue?: string | boolean; releasedValue?: string | boolean }
}

export type BookingField =
  | 'service'
  | 'start'
  | 'end'
  | 'staff'
  | 'location'
  | 'status'
  | 'name'
  | 'email'
  | 'phone'
  | 'notes'
  | 'customer'

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
/** Opening hours as local "HH:mm" ranges per weekday. */
export type WeeklyHours = Partial<Record<Weekday, [string, string][]>>

export interface BookingConfig extends ConceptBase<BookingField> {
  tentativeStatus?: string
  /** Statuses that do not block a slot. Default ['cancelled', 'canceled', 'rejected']. */
  freeStatuses?: string[]
  services?: { collection?: Slug; durationField?: string | null; defaultDurationMinutes?: number }
  /** Staff who perform services; a slot is free if any qualified staff member is free. */
  staff?: false | { collection?: Slug; servicesField?: string | null; locationField?: string | null }
  /** Locations with an opening-hours array field: `[{ day: 'mon', open: '09:00', close: '17:00' }]`. */
  locations?: false | { collection?: Slug; hoursField?: string | null }
  /** Default opening hours (when no location hours). Default Mon–Sat 09:00–17:00. */
  openingHours?: WeeklyHours
  slotStepMinutes?: number
  /** Offset of the business's local time from UTC in minutes (e.g. 360 for Asia/Dhaka). Default 0. */
  utcOffsetMinutes?: number
  maxSlots?: number
}

export interface ConceptConfigs {
  offering: OfferingConfig
  category: CategoryConfig
  customer: CustomerConfig
  order: OrderConfig
  cart: CartConfig
  knowledge: KnowledgeConfig
  lead: LeadConfig
  review: ReviewConfig
  booking: BookingConfig
}

/** Per-concept partial config. `false` disables a concept the preset would provide. */
export type ConceptOverrides = { [K in ConceptName]?: ConceptConfigs[K] | false }

export interface AdaptersOptions {
  preset: PresetName
  /** Merged over the preset: `collection` replaces, `fields` merge key by key, other options replace. */
  overrides?: ConceptOverrides
  /** Full concept map for preset 'custom' (also merged over any other preset, like overrides). */
  custom?: ConceptOverrides
  /** Multi-Tenant field name used for scoping when ctx.tenant is set. Default 'tenant'. */
  tenantField?: string
  /** Prefix for relative upload URLs. Default payload.config.serverURL. */
  serverURL?: string
}
