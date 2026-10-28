/**
 * Deterministic in-process driver (no network, no model). Mirrors the shape of the real pipeline:
 * tool choice -> tool execution over fixtures -> answer composed only from tool output, hybrid search
 * (fake embeddings + keyword, RRF), template content. Used in CI to validate goldens, scorers and the
 * runner, and as the "mock" baseline route.
 */
import { fakeEmbedding } from '@payload-ai-suite/ai-core/testing'
import { categories, isInStock, knowledge, orders, productBySlug, products } from '../lib/fixtures'
import { normalize } from '../lib/scoring'
import type { AssistantCase, AssistantOutput, ContentCase, ContentOutput, Driver, Locale, SearchCase, SearchOutput } from '../lib/types'

const money = (minor: number) => `৳${(minor / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const BN_DIGITS = '০১২৩৪৫৬৭৮৯'
const bnNum = (s: string) => s.replace(/\d/g, (d) => BN_DIGITS[Number(d)])

const docText = (p: (typeof products)[number]) => {
  const cat = categories.find((c) => c.slug === p.category)
  return `${p.en} ${p.bn} ${p.brand} ${p.tags.join(' ')} ${p.color} ${cat?.en ?? ''} ${cat?.bn ?? ''} ${p.descEn} ${p.descBn}`
}
const index = products.map((p) => ({ slug: p.slug, text: normalize(docText(p)), vec: fakeEmbedding(docText(p), 256) }))

const STOP = new Set(['a', 'an', 'the', 'for', 'with', 'under', 'below', 'less', 'than', 'taka', 'tk', 'do', 'you', 'have', 'any', 'i', 'want', 'need', 'show', 'me', 'is', 'in', 'stock', 'available', 'what', 'your', 'can', 'does', 'how', 'there', 'on', 'of', 'my', 'it', 'to', 'add', 'cart', 'please', 'policy', 'নিয়ম', 'যাবে', 'করা', 'টাকার', 'নিচে', 'কম', 'আছে', 'কি', 'চাই', 'দেখান'])
/** Very light Bangla stemming: drop common case suffixes (বিকাশে -> বিকাশ, ঢাকার -> ঢাকা). */
const stem = (t: string) => (/[\u0980-\u09FF]/.test(t) && t.length > 3 ? t.replace(/(ের|তে|কে|য়ে|ে|র)$/u, '') : t)
const tokens = (q: string) =>
  normalize(q)
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem)

/** "under 3,000 taka" / "৩০০০ টাকার নিচে" -> max price in minor units. */
export const parsePriceMax = (q: string): number | undefined => {
  const t = normalize(q)
  const m = t.match(/(?:under|below|less than|max|upto|up to)\s*৳?\s*(\d+)/) ?? t.match(/(\d+)\s*(?:taka|tk|টাকা)?\s*(?:er|র)?\s*(?:নিচে|এর নিচে|কম|মধ্যে)/)
  return m ? Number(m[1]) * 100 : undefined
}

export const mockSearch = (query: string, limit = 24): string[] => {
  const max = parsePriceMax(query)
  const qt = tokens(query)
  const qv = fakeEmbedding(query, 256)
  const eligible = index.filter((d) => max === undefined || productBySlug(d.slug)!.price <= max)
  const kw = eligible
    .map((d) => ({ slug: d.slug, s: qt.filter((t) => d.text.includes(t)).length }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
  const vec = eligible
    .map((d) => ({ slug: d.slug, s: d.vec.reduce((acc, v, i) => acc + v * qv[i], 0) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 20)
  const fused = new Map<string, number>()
  kw.forEach((x, i) => fused.set(x.slug, (fused.get(x.slug) ?? 0) + 2 / (60 + i + 1)))
  vec.forEach((x, i) => fused.set(x.slug, (fused.get(x.slug) ?? 0) + 1 / (60 + i + 1)))
  return [...fused.entries()]
    .map(([slug, s]) => ({ slug, s: s * (isInStock(slug) ? 1.05 : 1) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.slug)
}

const INJECTION = /(ignore (all|previous|the above)|system prompt|you are now|developer mode|<script|reveal your|আগের নির্দেশ)/i
const RE = {
  human: /\b(human|agent|real person|talk to someone)\b|মানুষ|প্রতিনিধি/i,
  order: /\b(orders?|tracking|where is my)\b|অর্ডার|কোথায়/i,
  policy: /\b(policy|return|refund|exchange|delivery|shipping|warranty|payment|bkash|cod)\b|ফেরত|ডেলিভারি|রিফান্ড|ওয়ারেন্টি|পেমেন্ট|বিকাশ/i,
  stock: /\b(in stock|available|stock)\b|স্টকে|পাওয়া যাবে/i,
  cart: /\b(add .* to (my )?cart|add to cart|buy)\b|কার্টে/i,
}

const pickTitle = (slug: string, locale: Locale) => {
  const p = productBySlug(slug)!
  return locale === 'bn' ? p.bn : p.en
}

export const mockAssistant = (c: AssistantCase): AssistantOutput => {
  const { message: msg, locale } = c
  const actor = c.actor ?? 'visitor'
  const bn = locale === 'bn'
  if (INJECTION.test(msg) || msg.length > 2000) {
    return { text: bn ? 'দুঃখিত, আমি শুধু এই দোকানের কেনাকাটায় সাহায্য করতে পারি।' : 'Sorry, I can only help with shopping at this store.', tools: [], cards: [] }
  }
  if (RE.human.test(msg)) {
    return { text: bn ? 'আমি আপনাকে আমাদের সাপোর্ট টিমের সাথে যুক্ত করছি।' : 'I have passed this to our support team; expect a reply within 2 hours.', tools: ['handOff'], cards: [{ type: 'handoff', ticketId: 't1', expectedReply: 'within 2 hours' }] }
  }
  const orderNo = msg.match(/\b[A-Z]{2}-\d{4}\b/i)?.[0]?.toUpperCase()
  if (orderNo || (RE.order.test(msg) && !RE.policy.test(msg))) {
    if (actor === 'visitor') {
      return { text: bn ? 'অর্ডারের তথ্য দেখতে লগ ইন করুন বা অর্ডার নম্বর ও ইমেইল দিয়ে যাচাই করুন।' : 'Please log in, or verify with your order number and email, so I can look up your order.', tools: ['requestOrderVerification'], cards: [{ type: 'verify', reason: 'order-lookup', methods: ['login', 'order-email-otp'] }] }
    }
    const mine = orders.filter((o) => o.customer === actor)
    if (!orderNo) {
      return { text: mine.map((o) => `${o.number}: ${o.shipping}`).join('\n'), tools: ['listMyOrders'], cards: [{ type: 'orders', orders: mine.map((o) => ({ number: o.number, status: o.status })) }] }
    }
    const o = mine.find((x) => x.number === orderNo)
    if (!o) return { text: bn ? 'আপনার অ্যাকাউন্টে এই অর্ডারটি পাইনি।' : "I couldn't find that order on your account.", tools: ['getOrderStatus'], cards: [] }
    const text = bn
      ? `অর্ডার ${o.number}: ${o.shipping} — ${o.carrier}, ট্র্যাকিং ${o.tracking}।`
      : `Order ${o.number} is ${o.shipping} via ${o.carrier}. Tracking number: ${o.tracking}.`
    return { text, tools: ['getOrderStatus'], cards: [{ type: 'order', order: { number: o.number, status: o.status, shipping: { status: o.shipping, carrier: o.carrier, trackingNumber: o.tracking } } }] }
  }
  if (RE.policy.test(msg) && !RE.cart.test(msg)) {
    const qt = tokens(msg)
    const best = knowledge
      .map((k) => ({ k, s: qt.filter((t) => normalize(`${k.title[locale]} ${k.text[locale]} ${k.kind}`).includes(t)).length }))
      .sort((a, b) => b.s - a.s)[0]
    if (best && best.s > 0) {
      return { text: best.k.text[locale], tools: ['getPolicy'], cards: [{ type: 'citations', citations: [{ title: best.k.title[locale], sourceCollection: 'policies', sourceId: best.k.id }] }] }
    }
  }
  const hits = mockSearch(msg, 3)
  if (!hits.length) return { text: bn ? 'দুঃখিত, মিল পাওয়া যায়নি।' : "Sorry, I couldn't find a match.", tools: ['searchOfferings'], cards: [] }
  if (RE.cart.test(msg)) {
    const slug = hits[0]
    return { text: bn ? `${pickTitle(slug, locale)} কার্টে যোগ করা হয়েছে।` : `Added ${pickTitle(slug, locale)} to your cart.`, tools: ['searchOfferings', 'addToCart'], cards: [{ type: 'cart', cart: { items: [{ offeringId: slug, quantity: 1 }] } }] }
  }
  if (RE.stock.test(msg)) {
    const slug = hits[0]
    const ok = isInStock(slug)
    const text = bn ? `${pickTitle(slug, locale)} ${ok ? 'স্টকে আছে' : 'এখন স্টকে নেই'}।` : `${pickTitle(slug, locale)} is ${ok ? 'in stock' : 'out of stock'}.`
    return { text, tools: ['searchOfferings', 'checkStock'], cards: [{ type: 'stock', offeringId: slug, inStock: ok, stock: null }] }
  }
  const lines = hits.map((s) => {
    const p = productBySlug(s)!
    const price = money(p.price)
    return `${pickTitle(s, locale)} — ${bn ? bnNum(price) : price}${isInStock(s) ? '' : bn ? ' (স্টক শেষ)' : ' (out of stock)'}`
  })
  return { text: lines.join('\n'), tools: ['searchOfferings'], cards: [{ type: 'products', items: hits.map((s) => ({ id: s, title: pickTitle(s, locale), price: { amount: productBySlug(s)!.price, currency: 'BDT' } })) }] }
}

export const mockContent = (c: ContentCase): ContentOutput => {
  const p = productBySlug(c.product)
  if (!p) return { text: '', error: `unknown product ${c.product}` }
  const bn = c.locale === 'bn'
  const cat = categories.find((x) => x.slug === p.category)
  if (c.task === 'seo-meta') {
    return { text: bn ? `${p.bn} — ${p.brand}। ${p.descBn}`.slice(0, 155) : `${p.en} by ${p.brand}. ${p.descEn}`.slice(0, 155) }
  }
  if (c.task === 'social-post') {
    return { text: bn ? `নতুন এসেছে: ${p.bn}! ${p.descBn} এখনই অর্ডার করুন।` : `Just in: ${p.en}! ${p.descEn} Order now.` }
  }
  return {
    text: bn
      ? `${p.bn}। ${p.descBn} ${p.brand} এর এই ${cat?.bn ?? ''} পণ্যটি প্রতিদিনের ব্যবহারের জন্য উপযুক্ত এবং যত্ন সহকারে বাছাই করা।`
      : `${p.en}. ${p.descEn} This ${cat?.en.toLowerCase() ?? ''} piece from ${p.brand} is carefully selected for everyday use and makes a thoughtful gift.`,
  }
}

export const createMockDriver = (): Driver => ({
  name: 'mock',
  async assistant(c) {
    const t = performance.now()
    return { ...mockAssistant(c), latencyMs: performance.now() - t }
  },
  async search(c: SearchCase): Promise<SearchOutput> {
    const t = performance.now()
    return { slugs: mockSearch(c.query, c.k ?? 24), mode: 'hybrid', latencyMs: performance.now() - t }
  },
  async content(c) {
    const t = performance.now()
    return { ...mockContent(c), latencyMs: performance.now() - t }
  },
})
