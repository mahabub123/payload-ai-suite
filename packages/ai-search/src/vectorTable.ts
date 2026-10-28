import type { Offering, OfferingSummary, VectorStore, VectorTableSpec } from '@payload-ai-suite/ai-core'
import { OFFERINGS_TABLE_NAME } from './constants'

/** One vector per offering, with SQL filter columns (design doc §7.4, §8). Money in minor units. */
export const OFFERINGS_TABLE: VectorTableSpec = {
  name: OFFERINGS_TABLE_NAME,
  columns: {
    offering_id: 'text',
    title: 'text',
    price: 'bigint',
    currency: 'text',
    in_stock: 'boolean',
    category_ids: 'text[]',
    tags: 'text[]',
    attributes: 'jsonb',
    slug: 'text',
    url: 'text',
    image_url: 'text',
    content_hash: 'text',
  },
}

/** SQL for a committed migration creating ai_offerings (production; dev uses ensureTable in onInit). */
export const offeringsMigrationSQL = (vectors: Pick<VectorStore, 'migrationSQL'>, dims: number): string =>
  vectors.migrationSQL(OFFERINGS_TABLE, dims)

export type OfferingRowFields = Record<keyof typeof OFFERINGS_TABLE.columns, unknown>

export const offeringToFields = (o: Offering, contentHash: string): OfferingRowFields => ({
  offering_id: o.id,
  title: o.title,
  price: o.price?.amount ?? null,
  currency: o.price?.currency ?? null,
  in_stock: o.inStock !== false,
  category_ids: o.categoryIds ?? [],
  tags: o.tags ?? [],
  attributes: o.attributes ?? {},
  slug: o.slug ?? null,
  url: o.url ?? null,
  image_url: o.imageUrl ?? o.images?.[0] ?? null,
  content_hash: contentHash,
})

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : [])
const optStr = (v: unknown): string | undefined => (v == null || v === '' ? undefined : String(v))

export const rowToSummary = (row: { id: string; fields: Record<string, unknown> }): OfferingSummary => {
  const f = row.fields
  const amount = f.price == null ? undefined : Number(f.price)
  return {
    id: String(f.offering_id ?? row.id),
    title: String(f.title ?? ''),
    slug: optStr(f.slug),
    url: optStr(f.url),
    imageUrl: optStr(f.image_url),
    price: amount != null && Number.isFinite(amount) && f.currency ? { amount, currency: String(f.currency) } : undefined,
    inStock: f.in_stock !== false,
    categoryIds: strArr(f.category_ids),
    tags: strArr(f.tags),
  }
}
