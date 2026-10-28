import { z } from 'zod'
import { defineTool } from 'payload-ai-core'
import type { ToolContext, Visibility } from 'payload-ai-core'
import { truncate } from '../state'

const visibilityFor = (ctx: ToolContext): Visibility[] => (ctx.actor.customerId ? ['public', 'customers'] : ['public'])

const lookup = async (query: string, ctx: ToolContext, k: number) => {
  const { hits, citations } = await ctx.services.knowledge.search(query, ctx, { k, visibility: visibilityFor(ctx) })
  return {
    data: {
      results: hits.map((h, i) => ({
        ref: i + 1,
        title: h.title,
        url: h.url,
        content: ctx.services.guardrails.quote('knowledge', truncate(h.content, 700)),
      })),
    },
    citations,
    cards: citations.length ? [{ type: 'citations' as const, citations }] : [],
  }
}

export const getPolicy = defineTool({
  name: 'getPolicy',
  description: 'Look up a store policy (shipping, returns, exchange, warranty, payment, privacy). Cite the sources.',
  tier: 'read',
  input: z.object({ topic: z.string().min(2).max(120) }),
  run: ({ topic }, ctx) => lookup(`${topic} policy`, ctx, 3),
})

export const searchKnowledge = defineTool({
  name: 'searchKnowledge',
  description: 'Search FAQs, pages and help articles for an answer. Answer only from results and cite them.',
  tier: 'read',
  input: z.object({ query: z.string().min(2).max(200) }),
  run: ({ query }, ctx) => lookup(query, ctx, 5),
})
