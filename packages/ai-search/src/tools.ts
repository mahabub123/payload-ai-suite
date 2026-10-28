import { z } from 'zod'
import type { AITool, Money, OfferingSummary, ToolContext } from 'payload-ai-core'
import { defineTool } from 'payload-ai-core'
import { TOOL_NAMES } from './constants'
import { getSearchEngine } from './engine'
import { toMajor } from './filters'
import { getRecommendations } from './recs'

export interface CompactOffering {
  id: string
  title: string
  /** Display price, e.g. "BDT 2,500.00" (from the catalog, minor units converted). */
  price?: string
  inStock?: boolean
}

export const formatMoney = (m: Money | undefined): string | undefined => {
  if (!m) return undefined
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: m.currency, currencyDisplay: 'code' }).format(toMajor(m.amount, m.currency)).replace(/ /g, ' ')
  } catch {
    return `${m.currency} ${toMajor(m.amount, m.currency)}`
  }
}

export const compact = (o: OfferingSummary): CompactOffering => ({
  id: o.id,
  title: o.title,
  price: formatMoney(o.price),
  inStock: o.inStock,
})

const searchInput = z.object({
  query: z.string().min(1).max(200).describe('What the shopper is looking for, in their words.'),
  maxPrice: z.number().positive().optional().describe('Maximum price in major currency units (e.g. 3000 for 3,000 taka).'),
  minPrice: z.number().nonnegative().optional().describe('Minimum price in major currency units.'),
  categoryIds: z.array(z.string()).max(5).optional().describe('Category ids, only if known from a previous tool result.'),
  inStock: z.boolean().optional().describe('Only items available now.'),
  limit: z.number().int().min(1).max(8).optional().describe('Max results (default 5, at most 8).'),
})

export const searchOfferingsTool: AITool<z.infer<typeof searchInput>, { mode: string; total: number; items: CompactOffering[] }> = defineTool({
  name: TOOL_NAMES.search,
  description:
    'Search the catalog (semantic + keyword). Returns compact results (id, title, price, inStock); the shopper sees product cards. Use getOffering for details.',
  tier: 'read',
  requires: ['offering'],
  input: searchInput,
  async run(input, ctx: ToolContext) {
    const limit = input.limit ?? 5
    const res = await getSearchEngine(ctx.payload, ctx.services).search(
      {
        q: input.query,
        filters: { priceMin: input.minPrice, priceMax: input.maxPrice, categoryIds: input.categoryIds, inStock: input.inStock },
        priceUnit: 'major',
        limit,
        source: 'assistant',
      },
      ctx,
    )
    const items = res.items.slice(0, limit).map(({ score: _score, ...o }) => o)
    return {
      data: { mode: res.mode, total: res.total, items: items.map(compact) },
      cards: items.length ? [{ type: 'products', items }] : [],
    }
  },
})

const recommendInput = z.object({
  kind: z.enum(['similar', 'bought-together', 'for-you']).default('similar'),
  offeringId: z.string().optional().describe('Required for similar / bought-together.'),
  limit: z.number().int().min(1).max(8).optional(),
})

export const recommendOfferingsTool: AITool<z.infer<typeof recommendInput>, { kind: string; items: CompactOffering[] }> = defineTool({
  name: TOOL_NAMES.recommend,
  description:
    'Recommend offerings: "similar" to an offering, "bought-together" with an offering, or "for-you" from this shopper\'s views and purchases.',
  tier: 'read',
  requires: ['offering'],
  input: recommendInput,
  async run(input, ctx: ToolContext) {
    const res = await getRecommendations(
      getSearchEngine(ctx.payload, ctx.services),
      { kind: input.kind, offering: input.offeringId, limit: input.limit ?? 4 },
      ctx,
    )
    return {
      data: { kind: res.kind, items: res.items.map(compact) },
      cards: res.items.length ? [{ type: 'products', items: res.items }] : [],
    }
  },
})

export const searchTools = (opts: { recommendations: boolean }): AITool[] =>
  opts.recommendations ? [searchOfferingsTool, recommendOfferingsTool] : [searchOfferingsTool]
