/**
 * Offline fixture world for mock-mode evals: the dev-store seed catalog + knowledge, and the seeded orders.
 * Shares the seed data module so goldens, seed and evals never drift apart.
 */
import { categories, faqs, policies, products } from '../../../apps/dev-store/src/seed/data'

export { categories, products }

export interface KnowledgeEntry {
  id: string
  title: Record<'en' | 'bn', string>
  text: Record<'en' | 'bn', string>
  kind: string
}

export const knowledge: KnowledgeEntry[] = [
  ...policies.map((p) => ({
    id: `policy:${p.slug}`,
    kind: p.kind,
    title: { en: p.en[0], bn: p.bn[0] },
    text: { en: p.en[1].join(' '), bn: p.bn[1].join(' ') },
  })),
  ...faqs.map((f, i) => ({
    id: `faq:${i}`,
    kind: f.topic,
    title: { en: f.en[0], bn: f.bn[0] },
    text: { en: f.en[1], bn: f.bn[1] },
  })),
]

export const orders = [
  { number: 'DS-1001', customer: 'customerA', status: 'completed', shipping: 'delivered', carrier: 'Pathao', tracking: 'PTH-77810021', items: ['red-jamdani-saree', 'sundarbans-honey-500g'] },
  { number: 'DS-1002', customer: 'customerA', status: 'processing', shipping: 'shipped', carrier: 'RedX', tracking: 'RDX-55120987', items: ['walton-smartphone-x9'] },
  { number: 'DS-2001', customer: 'customerB', status: 'processing', shipping: 'packed', carrier: 'Pathao', tracking: 'PTH-77810444', items: ['rechargeable-desk-fan', 'white-cotton-panjabi'] },
] as const

export const productBySlug = (slug: string) => products.find((p) => p.slug === slug)
export const isInStock = (slug: string) => {
  const p = productBySlug(slug)
  return Boolean(p && (p.variants ? p.variants.inventoryEach > 0 : p.inventory > 0))
}
