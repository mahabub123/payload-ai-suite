/**
 * Seed the dev store: categories, ~30 products (English + Bangla, BDT minor units, some variants),
 * content (pages, posts, FAQs, policies), staff users, customers A and B with orders, reviews.
 *
 *   pnpm --filter dev-store seed          # skips when products already exist
 *   pnpm --filter dev-store seed --force  # seeds anyway (unique slugs/emails must not collide)
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Payload } from 'payload'
import { categories, colorHex, faqs, pages, policies, posts, products, reviews, type SeedProduct } from './data'

const here = path.dirname(fileURLToPath(import.meta.url))
try {
  process.loadEnvFile(path.resolve(here, '../../.env'))
} catch {
  // no .env: rely on the environment
}

export const PASSWORD = process.env.SEED_PASSWORD || 'Passw0rd!dev'

export const STAFF = [
  { email: 'super@example.test', name: 'Super Admin', roles: ['super-admin'] },
  { email: 'admin@example.test', name: 'Store Admin', roles: ['admin'] },
  { email: 'content@example.test', name: 'Content Editor', roles: ['content'] },
  { email: 'marketing@example.test', name: 'Marketing Approver', roles: ['marketing'] },
  { email: 'support@example.test', name: 'Support Agent', roles: ['support'] },
  { email: 'manager@example.test', name: 'Store Manager', roles: ['manager'] },
] as const

export const CUSTOMERS = {
  A: { email: 'ayesha@example.test', name: 'Ayesha Rahman', phone: '+8801711000001', marketingOptIn: true },
  B: { email: 'bilal@example.test', name: 'Bilal Hossain', phone: '+8801811000002', marketingOptIn: false },
} as const

/** Minimal Lexical document from paragraphs. */
export const richText = (...paragraphs: string[]) => ({
  root: {
    type: 'root',
    format: '' as const,
    indent: 0,
    version: 1,
    direction: 'ltr' as const,
    children: paragraphs.map((text) => ({
      type: 'paragraph',
      format: '' as const,
      indent: 0,
      version: 1,
      direction: 'ltr' as const,
      textFormat: 0,
      textStyle: '',
      children: [{ type: 'text', text, format: 0, style: '', mode: 'normal', detail: 0, version: 1 }],
    })),
  },
})

/** Postgres ids (see payload-types.ts). */
type ID = number
const opts = { overrideAccess: true, depth: 0 } as const

const placeholderImage = async (hex: string): Promise<Buffer> => {
  const sharp = (await import('sharp')).default
  return sharp({ create: { width: 600, height: 600, channels: 3, background: hex } }).png().toBuffer()
}

const createMedia = async (payload: Payload, p: SeedProduct): Promise<ID> => {
  const data = await placeholderImage(colorHex[p.color] ?? '#9ca3af')
  const doc = await payload.create({
    collection: 'media',
    data: { alt: p.en },
    file: { data, mimetype: 'image/png', name: `${p.slug}.png`, size: data.length },
    ...opts,
  })
  await payload.update({ collection: 'media', id: doc.id, locale: 'bn', data: { alt: p.bn }, ...opts })
  return doc.id
}

const ensureVariantType = async (payload: Payload, name: 'size' | 'color', cache: Map<string, ID>) => {
  const key = `type:${name}`
  if (cache.has(key)) return cache.get(key)!
  const t = await payload.create({ collection: 'variantTypes', data: { name, label: name === 'size' ? 'Size' : 'Colour' }, ...opts })
  cache.set(key, t.id)
  return t.id
}

const ensureVariantOption = async (payload: Payload, type: 'size' | 'color', value: string, cache: Map<string, ID>) => {
  const key = `opt:${type}:${value}`
  if (cache.has(key)) return cache.get(key)!
  const variantType = await ensureVariantType(payload, type, cache)
  const o = await payload.create({
    collection: 'variantOptions',
    data: { variantType, label: value, value: value.toLowerCase() },
    ...opts,
  })
  cache.set(key, o.id)
  return o.id
}

export const seed = async (payload: Payload, { force = false } = {}) => {
  const existing = await payload.count({ collection: 'products', overrideAccess: true })
  if (existing.totalDocs > 0 && !force) {
    payload.logger.info(`[seed] ${existing.totalDocs} products already exist — skipping (use --force).`)
    return
  }
  const log = (m: string) => payload.logger.info(`[seed] ${m}`)

  // --- users ---
  const staffIds: Record<string, ID> = {}
  for (const s of STAFF) {
    const u = await payload.create({ collection: 'users', data: { ...s, roles: [...s.roles], password: PASSWORD }, ...opts })
    staffIds[s.email] = u.id
  }
  const customerIds: Record<'A' | 'B', ID> = { A: 0, B: 0 }
  for (const k of ['A', 'B'] as const) {
    const u = await payload.create({ collection: 'users', data: { ...CUSTOMERS[k], roles: ['customer'], password: PASSWORD }, ...opts })
    customerIds[k] = u.id
  }
  log(`users: ${STAFF.length} staff, 2 customers (password: ${PASSWORD})`)

  // --- categories ---
  const catIds: Record<string, ID> = {}
  for (const c of categories) {
    const doc = await payload.create({ collection: 'categories', data: { title: c.en, slug: c.slug }, locale: 'en', ...opts })
    await payload.update({ collection: 'categories', id: doc.id, data: { title: c.bn }, locale: 'bn', ...opts })
    catIds[c.slug] = doc.id
  }
  log(`categories: ${categories.length}`)

  // --- products (+ variants) ---
  const productIds: Record<string, ID> = {}
  const variantIds: Record<string, ID> = {}
  const cache = new Map<string, ID>()
  for (const p of products) {
    const image = await createMedia(payload, p)
    const variantTypeIds = p.variants ? [await ensureVariantType(payload, p.variants.type, cache)] : []
    const doc = await payload.create({
      collection: 'products',
      locale: 'en',
      data: {
        title: p.en,
        slug: p.slug,
        description: richText(p.descEn),
        gallery: [{ image }],
        categories: [catIds[p.category]],
        brand: p.brand,
        tags: [...p.tags, p.color],
        specs: (p.specs ?? []).map(([label, value]) => ({ label, value })),
        inventory: p.inventory,
        priceInBDTEnabled: true,
        priceInBDT: p.price,
        ...(p.usd ? { priceInUSDEnabled: true, priceInUSD: p.usd } : {}),
        enableVariants: Boolean(p.variants),
        ...(p.variants ? { variantTypes: variantTypeIds } : {}),
        _status: 'published',
      },
      ...opts,
    })
    await payload.update({
      collection: 'products',
      id: doc.id,
      locale: 'bn',
      data: { title: p.bn, description: richText(p.descBn), _status: 'published' },
      ...opts,
    })
    productIds[p.slug] = doc.id
    for (const value of p.variants?.values ?? []) {
      const option = await ensureVariantOption(payload, p.variants!.type, value, cache)
      const v = await payload.create({
        collection: 'variants',
        data: {
          title: `${p.en} — ${value}`,
          product: doc.id,
          options: [option],
          inventory: p.variants!.inventoryEach,
          priceInBDTEnabled: true,
          priceInBDT: p.price,
          _status: 'published',
        },
        ...opts,
      })
      variantIds[`${p.slug}:${value}`] = v.id
    }
  }
  log(`products: ${products.length} (${Object.keys(variantIds).length} variants)`)

  // --- knowledge content ---
  for (const pg of pages) {
    const d = await payload.create({ collection: 'pages', locale: 'en', data: { title: pg.en[0], slug: pg.slug, content: richText(...pg.en[1]), _status: 'published' }, ...opts })
    await payload.update({ collection: 'pages', id: d.id, locale: 'bn', data: { title: pg.bn[0], content: richText(...pg.bn[1]), _status: 'published' }, ...opts })
  }
  for (const po of posts) {
    const d = await payload.create({
      collection: 'posts',
      locale: 'en',
      data: {
        title: po.en[0],
        slug: po.slug,
        excerpt: po.en[1],
        content: richText(...po.en[2]),
        author: staffIds['content@example.test'],
        publishedAt: new Date().toISOString(),
        relatedProducts: po.related.map((s) => productIds[s]),
        _status: 'published',
      },
      ...opts,
    })
    await payload.update({ collection: 'posts', id: d.id, locale: 'bn', data: { title: po.bn[0], excerpt: po.bn[1], content: richText(...po.bn[2]), _status: 'published' }, ...opts })
  }
  for (const [i, f] of faqs.entries()) {
    const d = await payload.create({ collection: 'faqs', locale: 'en', data: { question: f.en[0], answer: f.en[1], topic: f.topic, order: i }, ...opts })
    await payload.update({ collection: 'faqs', id: d.id, locale: 'bn', data: { question: f.bn[0], answer: f.bn[1] }, ...opts })
  }
  for (const pol of policies) {
    const d = await payload.create({
      collection: 'policies',
      locale: 'en',
      data: { title: pol.en[0], slug: pol.slug, kind: pol.kind, content: richText(...pol.en[1]), summary: pol.en[1][0], _status: 'published' },
      ...opts,
    })
    await payload.update({ collection: 'policies', id: d.id, locale: 'bn', data: { title: pol.bn[0], content: richText(...pol.bn[1]), summary: pol.bn[1][0], _status: 'published' }, ...opts })
  }
  log(`content: ${pages.length} pages, ${posts.length} posts, ${faqs.length} FAQs, ${policies.length} policies`)

  // --- orders ---
  const price = (slug: string) => products.find((p) => p.slug === slug)!.price
  const day = 24 * 60 * 60 * 1000
  const orders = [
    { orderNumber: 'DS-1001', customer: 'A' as const, status: 'completed' as const, shippingStatus: 'delivered' as const, carrier: 'Pathao', trackingNumber: 'PTH-77810021', placed: -10, eta: -6, items: [['red-jamdani-saree', 1], ['sundarbans-honey-500g', 2]] as const },
    { orderNumber: 'DS-1002', customer: 'A' as const, status: 'processing' as const, shippingStatus: 'shipped' as const, carrier: 'RedX', trackingNumber: 'RDX-55120987', placed: -2, eta: 2, items: [['walton-smartphone-x9', 1]] as const },
    { orderNumber: 'DS-2001', customer: 'B' as const, status: 'processing' as const, shippingStatus: 'packed' as const, carrier: 'Pathao', trackingNumber: 'PTH-77810444', placed: -1, eta: 3, items: [['rechargeable-desk-fan', 1], ['white-cotton-panjabi:M', 1]] as const },
  ]
  for (const o of orders) {
    const items = o.items.map(([ref, quantity]) => {
      const [slug, variant] = ref.split(':')
      return { product: productIds[slug], ...(variant ? { variant: variantIds[`${slug}:${variant}`] } : {}), quantity }
    })
    const amount = o.items.reduce((sum, [ref, q]) => sum + price(ref.split(':')[0]) * q, 0)
    await payload.create({
      collection: 'orders',
      data: {
        orderNumber: o.orderNumber,
        customer: customerIds[o.customer],
        customerEmail: CUSTOMERS[o.customer].email,
        items,
        amount,
        currency: 'BDT',
        status: o.status,
        shippingStatus: o.shippingStatus,
        carrier: o.carrier,
        trackingNumber: o.trackingNumber,
        estimatedDelivery: new Date(Date.now() + o.eta * day).toISOString(),
        // Placed in the past so insights periods (which end at today's midnight) see them.
        createdAt: new Date(Date.now() + o.placed * day).toISOString(),
      },
      ...opts,
    })
  }
  log(`orders: ${orders.length} (A: DS-1001, DS-1002; B: DS-2001)`)

  // Abandoned cart for customer B (marketing abandoned-cart sequence demo).
  try {
    await payload.create({
      collection: 'carts',
      data: { customer: customerIds.B, currency: 'BDT', items: [{ product: productIds['nakshi-kantha-throw'], quantity: 1 }] },
      ...opts,
    })
  } catch (e) {
    log(`cart skipped: ${(e as Error).message}`)
  }

  // --- reviews ---
  for (const r of reviews) {
    await payload.create({
      collection: 'reviews',
      data: {
        product: productIds[r.product],
        customer: customerIds[r.customer],
        authorName: CUSTOMERS[r.customer].name,
        rating: r.rating,
        title: r.title,
        body: r.body,
        locale: r.locale,
        status: r.status,
      },
      ...opts,
    })
  }
  log(`reviews: ${reviews.length}`)
  log('done. Admin: http://localhost:3000/admin — super@example.test')
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const { getPayload } = await import('payload')
  const { default: config } = await import('../payload.config')
  const payload = await getPayload({ config })
  try {
    await seed(payload, { force: process.argv.includes('--force') })
  } finally {
    await payload.destroy?.()
  }
  process.exit(0)
}
