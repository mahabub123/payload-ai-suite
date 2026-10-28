import { z } from 'zod'
import { AIError, defineTool } from '@payload-ai-suite/ai-core'
import type { OfferingSummary } from '@payload-ai-suite/ai-core'
import { truncate } from '../state'

/** Compact offering for the model: ids and key fields only. */
export const compactOffering = (o: OfferingSummary) => ({
  id: o.id,
  title: o.title,
  price: o.price,
  inStock: o.inStock,
  url: o.url,
})

/** Fallback registered only when ai-search has not registered its own searchOfferings. */
export const searchOfferingsFallback = defineTool({
  name: 'searchOfferings',
  description:
    'Search the catalog for products/services. Use for any shopping question ("red dress under 3000"). Prices and stock are shown to the shopper as cards.',
  tier: 'read',
  requires: ['offering'],
  input: z.object({
    query: z.string().min(1).max(200),
    priceMin: z.number().int().nonnegative().optional().describe('minor units'),
    priceMax: z.number().int().nonnegative().optional().describe('minor units'),
    inStock: z.boolean().optional(),
    categoryId: z.string().optional(),
    limit: z.number().int().min(1).max(12).optional(),
  }),
  async run(input, ctx) {
    const adapter = ctx.adapters.offering
    if (!adapter) throw new AIError('unavailable', 'Catalog not available')
    const { items, total } = await adapter.search(
      {
        text: input.query,
        priceMin: input.priceMin,
        priceMax: input.priceMax,
        inStock: input.inStock,
        categoryIds: input.categoryId ? [input.categoryId] : undefined,
        limit: input.limit ?? 6,
      },
      ctx.adapterCtx,
    )
    return {
      data: { total, items: items.map(compactOffering) },
      cards: items.length ? [{ type: 'products', items }] : [],
    }
  },
})

export const getOffering = defineTool({
  name: 'getOffering',
  description: 'Get details of one product/service by id (description, attributes, variants).',
  tier: 'read',
  requires: ['offering'],
  input: z.object({ id: z.string().min(1) }),
  async run({ id }, ctx) {
    const o = await ctx.adapters.offering!.get(id, ctx.adapterCtx)
    if (!o) return { data: { found: false } }
    const g = ctx.services.guardrails
    // Merchant-authored text is untrusted data for the model.
    const description = o.description ? g.quote('offering-description', truncate(o.description, 800)) : undefined
    const { description: _d, attributes, variants, images: _i, ...summary } = o
    return {
      data: {
        found: true,
        ...compactOffering(o),
        description,
        attributes,
        variants: variants?.slice(0, 20).map((v) => ({ id: v.id, title: v.title, price: v.price, inStock: v.inStock, options: v.options })),
      },
      cards: [{ type: 'product', offering: { ...summary, description: truncate(o.description, 400) || undefined } }],
    }
  },
})

export const checkStock = defineTool({
  name: 'checkStock',
  description: 'Check live stock for a product (optionally a variant). Never guess stock.',
  tier: 'read',
  requires: ['offering'],
  input: z.object({ offeringId: z.string().min(1), variantId: z.string().optional() }),
  async run({ offeringId, variantId }, ctx) {
    const s = await ctx.adapters.offering!.checkStock(offeringId, variantId, ctx.adapterCtx)
    return {
      data: { offeringId, variantId, inStock: s.inStock, stock: s.stock },
      cards: [{ type: 'stock', offeringId, variantId, inStock: s.inStock, stock: s.stock }],
    }
  },
})
