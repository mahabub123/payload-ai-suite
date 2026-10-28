import config from '@payload-config'
import { getPayload } from 'payload'

export interface ProductCard {
  id: string
  slug: string
  title: string
  priceMinor: number | null
  currency: 'BDT'
  imageUrl?: string
  inStock: boolean
}

type Doc = Record<string, any>

const toCard = (d: Doc): ProductCard => ({
  id: String(d.id),
  slug: String(d.slug ?? d.id),
  title: String(d.title ?? ''),
  priceMinor: typeof d.priceInBDT === 'number' ? d.priceInBDT : null,
  currency: 'BDT',
  imageUrl: d.gallery?.[0]?.image?.sizes?.card?.url ?? d.gallery?.[0]?.image?.url,
  inStock: d.enableVariants ? true : (d.inventory ?? 0) > 0,
})

/** Storefront reads go through the Local API with access enforced (overrideAccess: false). */
export const listProducts = async (locale: 'en' | 'bn' = 'en', limit = 12): Promise<ProductCard[]> => {
  const payload = await getPayload({ config })
  const res = await payload.find({ collection: 'products', locale, limit, depth: 2, overrideAccess: false, sort: '-createdAt' })
  return (res.docs as Doc[]).map(toCard)
}

export const getProduct = async (slug: string, locale: 'en' | 'bn' = 'en') => {
  const payload = await getPayload({ config })
  const res = await payload.find({
    collection: 'products',
    where: { slug: { equals: slug } },
    locale,
    limit: 1,
    depth: 2,
    overrideAccess: false,
  })
  const doc = res.docs[0] as Doc | undefined
  return doc ? { ...toCard(doc), brand: doc.brand as string | undefined, specs: (doc.specs ?? []) as { label: string; value: string }[] } : null
}

export const formatBDT = (minor: number | null): string =>
  minor == null ? '—' : `৳${(minor / 100).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`
