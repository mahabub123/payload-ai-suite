import type {
  AdapterContext,
  AttributeValue,
  CategoryAdapter,
  Facets,
  Offering,
  OfferingAdapter,
  OfferingQuery,
  OfferingSummary,
  OfferingVariant,
} from '@payload-ai-suite/ai-core'
import type { Where } from 'payload'
import { and, find, findOne, iterateDocs } from '../local'
import type { Doc } from '../mapping/values'
import { fillPattern, getPath, relDoc, relIds, toIso, toNum, toStr, toText, uploadUrl, uploadUrls } from '../mapping/values'
import type { Resolution, ResolveEnv, ResolvedTarget } from '../resolve'
import type { PriceSpec } from './common'
import { clampLimit, labelOf, money, orNull, readOpts, reader, since } from './common'

export interface OfferingInternals {
  target: ResolvedTarget
  variants?: ResolvedTarget
  price: PriceSpec
  /** Map a populated product doc (e.g. in order/cart items) without fetching. */
  fromDoc(doc: Doc, ctx: AdapterContext): Offering
  variantFromDoc(doc: Doc, ctx: AdapterContext): OfferingVariant
}

const attrValue = (v: unknown): AttributeValue | undefined => {
  if (v == null || v === '') return undefined
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  if (Array.isArray(v)) {
    const vals = v.map(labelOf).filter((x): x is string => !!x)
    return vals.length ? vals : undefined
  }
  return labelOf(v) ?? toStr(v)
}

const summaryOf = (o: Offering): OfferingSummary => ({
  id: o.id,
  title: o.title,
  slug: o.slug,
  url: o.url,
  price: o.price,
  compareAtPrice: o.compareAtPrice,
  inStock: o.inStock,
  stock: o.stock,
  imageUrl: o.imageUrl,
  categoryIds: o.categoryIds,
  tags: o.tags,
})

export const createOfferingAdapter = (
  env: ResolveEnv,
  r: Resolution,
  deps: { category?: CategoryAdapter } = {},
): OfferingAdapter & { internals: OfferingInternals } => {
  const t = r.main!
  const vt = r.extra.variants
  const f = t.fields
  const o = r.options as {
    currency: string
    priceUnit?: 'minor' | 'major'
    currencyDecimals?: number
    urlPattern?: string
    attributes?: Record<string, string>
    searchFields?: string[]
    inStockWhenUntracked?: boolean
  }
  const price: PriceSpec = { currency: o.currency, unit: o.priceUnit ?? 'minor', decimals: o.currencyDecimals ?? 2 }
  const untracked = o.inStockWhenUntracked ?? true
  const attributes = o.attributes ?? {}

  const variantFromDoc = (doc: Doc, ctx: AdapterContext): OfferingVariant => {
    const read = reader(env, vt!, ctx)
    const options: Record<string, string> = {}
    const opts = read(doc, 'options')
    for (const opt of Array.isArray(opts) ? opts : []) {
      const od = relDoc(opt)
      if (!od) continue
      const type = relDoc(od.variantType)
      const key = toStr(type?.label ?? type?.name) ?? 'option'
      options[key] = toStr(od.label ?? od.value) ?? ''
    }
    const enabled = read(doc, 'priceEnabled')
    const stock = vt!.fields.stock ? (toNum(read(doc, 'stock')) ?? 0) : null
    return {
      id: String(doc.id),
      title: toStr(read(doc, 'title')) ?? Object.values(options).join(' / '),
      price: enabled === false ? undefined : money(read(doc, 'price'), price),
      stock,
      inStock: stock == null ? untracked : stock > 0,
      options,
    }
  }

  const applyVariants = (off: Offering, variants: OfferingVariant[]) => {
    off.variants = variants
    if (!variants.length) return off
    const tracked = variants.filter((v) => v.stock != null)
    off.stock = tracked.length ? tracked.reduce((s, v) => s + (v.stock ?? 0), 0) : null
    off.inStock = variants.some((v) => v.inStock)
    if (!off.price) {
      const prices = variants.map((v) => v.price).filter((p): p is NonNullable<typeof p> => !!p)
      if (prices.length) off.price = prices.reduce((a, b) => (b.amount < a.amount ? b : a))
    }
    return off
  }

  const variantsEnabled = (doc: Doc, ctx: AdapterContext) =>
    !!vt && (f.enableVariants ? reader(env, t, ctx)(doc, 'enableVariants') === true : true)

  const fromDoc = (doc: Doc, ctx: AdapterContext): Offering => {
    const read = reader(env, t, ctx)
    const id = String(doc.id)
    const slug = toStr(read(doc, 'slug'))
    const stockRaw = f.stock ? toNum(read(doc, 'stock')) : undefined
    const stock = f.stock ? (stockRaw ?? 0) : null
    const inStockField = f.inStock ? read(doc, 'inStock') : undefined
    const images = uploadUrls(read(doc, 'images'), env.serverURL)
    const attrs: Record<string, AttributeValue> = {}
    const ro = readOpts(env, ctx)
    for (const [name, path] of Object.entries(attributes)) {
      const v = attrValue(getPath(doc, path, ro))
      if (v !== undefined) attrs[name] = v
    }
    const tagsRaw = read(doc, 'tags')
    const tags = Array.isArray(tagsRaw) ? tagsRaw.map(labelOf).filter((x): x is string => !!x) : undefined
    const status = doc._status === 'draft' ? 'draft' : doc._status === 'published' ? 'published' : undefined
    const off: Offering = {
      id,
      title: toStr(read(doc, 'title')) ?? '',
      slug,
      url: fillPattern(o.urlPattern, doc, { slug, id }),
      price: read(doc, 'priceEnabled') === false ? undefined : money(read(doc, 'price'), price, read(doc, 'currency')),
      compareAtPrice: money(read(doc, 'compareAtPrice'), price, read(doc, 'currency')),
      stock,
      inStock: typeof inStockField === 'boolean' ? inStockField : stock == null ? untracked : stock > 0,
      imageUrl: uploadUrl(read(doc, 'image'), env.serverURL) ?? images[0],
      images,
      categoryIds: relIds(read(doc, 'categories')),
      tags,
      description: toText(read(doc, 'description')) || undefined,
      attributes: attrs,
      status,
      locale: ctx.locale,
      updatedAt: toIso(read(doc, 'updatedAt') ?? doc.updatedAt),
    }
    // Join field (`variants.docs`) populated on the doc.
    const joined = getPath(doc, 'variants.docs')
    if (vt && variantsEnabled(doc, ctx) && Array.isArray(joined) && joined.every((d) => relDoc(d) && typeof d === 'object')) {
      const visible = (joined as Doc[]).filter((d) => !vt.published || getPath(d, vt.published.field) === vt.published.equals)
      applyVariants(off, visible.map((d) => variantFromDoc(d, ctx)))
    }
    return off
  }

  const loadVariants = async (off: Offering, doc: Doc, ctx: AdapterContext) => {
    if (!vt || !variantsEnabled(doc, ctx)) return off
    const res = await find(vt, ctx, {
      where: { [vt.fields.product ?? 'product']: { equals: doc.id } },
      publishedOnly: true,
      depth: 2,
      limit: 100,
    })
    return applyVariants(off, res.docs.map((d) => variantFromDoc(d, ctx)))
  }

  const toMajor = (minor: number) => (price.unit === 'major' ? minor / 10 ** price.decimals : minor)

  const buildWhere = (q: OfferingQuery): Where | undefined => {
    const parts: (Where | undefined)[] = []
    const text = q.text?.trim()
    if (text) {
      const fieldsToSearch = o.searchFields?.length ? o.searchFields : [f.title, f.slug].filter(Boolean)
      parts.push({ or: fieldsToSearch.map((p) => ({ [p]: { like: text } })) })
    }
    if (q.ids?.length) parts.push({ id: { in: q.ids } })
    if (q.categoryIds?.length && f.categories) parts.push({ [f.categories]: { in: q.categoryIds } })
    if (f.price && q.priceMin != null) parts.push({ [f.price]: { greater_than_equal: toMajor(q.priceMin) } })
    if (f.price && q.priceMax != null) parts.push({ [f.price]: { less_than_equal: toMajor(q.priceMax) } })
    if (q.inStock) {
      if (f.inStock) parts.push({ [f.inStock]: { equals: true } })
      else if (f.stock) {
        const inStock: Where = { [f.stock]: { greater_than: 0 } }
        // Variant products keep stock on variants; they are checked after the query.
        parts.push(f.enableVariants && vt ? { or: [inStock, { [f.enableVariants]: { equals: true } }] } : inStock)
      }
    }
    for (const [name, val] of Object.entries(q.attributes ?? {})) {
      const path = attributes[name]
      if (!path) continue
      parts.push(Array.isArray(val) ? { [path]: { in: val } } : { [path]: { equals: val } })
    }
    return and(...parts)
  }

  const sortOf = (q: OfferingQuery) => {
    if (q.sort === 'price-asc' && f.price) return f.price
    if (q.sort === 'price-desc' && f.price) return `-${f.price}`
    if (q.sort === 'newest') return `-${f.createdAt ?? 'createdAt'}`
    return undefined
  }

  const adapter: OfferingAdapter & { internals: OfferingInternals } = {
    collection: t.collection,
    fields: { ...f },
    internals: { target: t, variants: vt, price, fromDoc, variantFromDoc },

    async get(id, ctx) {
      const doc = await orNull(findOne(t, id, ctx, { publishedOnly: true, depth: 1 }))
      if (!doc) return null
      return loadVariants(fromDoc(doc, ctx), doc, ctx)
    },

    async search(q, ctx) {
      const limit = clampLimit(q.limit, 12)
      const res = await find(t, ctx, {
        where: buildWhere(q),
        publishedOnly: true,
        limit,
        page: Math.max(1, q.page ?? 1),
        sort: sortOf(q),
        depth: 1,
      })
      let items = res.docs.map((d) => fromDoc(d, ctx))
      if (q.inStock) items = items.filter((i) => i.inStock !== false)
      return { items: items.map(summaryOf), total: res.totalDocs }
    },

    async checkStock(id, variantId, ctx) {
      if (variantId && vt) {
        const v = await orNull(
          findOne(vt, variantId, ctx, { publishedOnly: true, depth: 0, where: { [vt.fields.product ?? 'product']: { equals: id } } }),
        )
        if (!v) return { inStock: false, stock: 0 }
        const mapped = variantFromDoc(v, ctx)
        return { inStock: !!mapped.inStock, stock: mapped.stock ?? null }
      }
      const off = await adapter.get(id, ctx)
      if (!off) return { inStock: false, stock: 0 }
      return { inStock: off.inStock !== false, stock: off.stock ?? null }
    },

    async *iterate(opts, ctx) {
      for await (const doc of iterateDocs(t, ctx, {
        publishedOnly: true,
        where: since(f.updatedAt ?? 'updatedAt', opts.since),
        batchSize: opts.batchSize,
        depth: 1,
      })) {
        yield await loadVariants(fromDoc(doc, ctx), doc, ctx)
      }
    },

    toEmbeddingText(off) {
      const attrs = Object.entries(off.attributes ?? {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
      const variantOpts = new Map<string, Set<string>>()
      for (const v of off.variants ?? [])
        for (const [k, val] of Object.entries(v.options)) variantOpts.set(k, (variantOpts.get(k) ?? new Set()).add(val))
      return [
        off.title,
        off.tags?.length ? `Tags: ${off.tags.join(', ')}` : '',
        ...attrs,
        ...[...variantOpts].map(([k, vals]) => `${k}: ${[...vals].join(', ')}`),
        off.description ?? '',
      ]
        .filter(Boolean)
        .join('\n')
    },

    async facets(ctx) {
      const out: Facets = { categories: [], attributes: {} }
      if (deps.category) out.categories = (await deps.category.list(ctx)).map((c) => ({ id: c.id, title: c.title }))
      const attrSets: Record<string, Set<string>> = {}
      const add = (k: string, v: unknown) => {
        const vals = Array.isArray(v) ? v : [v]
        for (const x of vals) if (x != null && x !== '') (attrSets[k] ??= new Set()).add(String(x))
      }
      const ro = readOpts(env, ctx)
      if (Object.keys(attributes).length) {
        const sample = await find(t, ctx, { publishedOnly: true, limit: 500, depth: 1 })
        for (const d of sample.docs) for (const [name, path] of Object.entries(attributes)) add(name, attrValue(getPath(d, path, ro)))
      }
      if (vt) {
        const vs = await find(vt, ctx, { publishedOnly: true, limit: 500, depth: 2 })
        for (const d of vs.docs) for (const [k, v] of Object.entries(variantFromDoc(d, ctx).options)) add(k, v)
      }
      for (const [k, s] of Object.entries(attrSets)) out.attributes[k] = [...s].sort()
      if (f.price) {
        const where = f.priceEnabled ? { [f.priceEnabled]: { not_equals: false } } : undefined
        const [lo, hi] = await Promise.all([
          find(t, ctx, { publishedOnly: true, limit: 1, sort: f.price, depth: 0, where: and(where, { [f.price]: { exists: true } }) }),
          find(t, ctx, { publishedOnly: true, limit: 1, sort: `-${f.price}`, depth: 0, where: and(where, { [f.price]: { exists: true } }) }),
        ])
        const min = lo.docs[0] && money(getPath(lo.docs[0], f.price), price)
        const max = hi.docs[0] && money(getPath(hi.docs[0], f.price), price)
        if (min && max) out.priceRange = { min: min.amount, max: max.amount, currency: price.currency }
      }
      return out
    },

    fromDoc,
  }
  return adapter
}
