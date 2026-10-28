import { z } from 'zod'
import type { TaskConfig } from 'payload'
import type { AIContext, CoreServices } from '@payload-ai-suite/ai-core'
import { getAI } from '@payload-ai-suite/ai-core'
import { MODULE, PROMPTS, SLUGS, TASKS } from './constants'
import { errMessage, local, tenantData, tenantWhere } from './db'
import { learningSuggestPrompt, renderInline } from './prompts'
import { normalizeQuery } from './lru'

export interface SearchEventRow {
  type: string
  searchId?: string
  query?: string
  normalizedQuery?: string
  zeroResults?: boolean
}

export interface QueryStats {
  query: string
  searches: number
  zeroResults: number
  clicks: number
  ctr: number
}

/**
 * Aggregate a week of events: per normalised query, searches / zero results / clicks
 * (clicks and add-to-carts joined to their search by searchId).
 */
export const analyzeEvents = (
  events: SearchEventRow[],
  opts: { minSearches?: number; lowCtr?: number; top?: number } = {},
): { searches: number; zeroResultRate: number; zeroResult: QueryStats[]; lowClick: QueryStats[] } => {
  const minSearches = opts.minSearches ?? 3
  const lowCtr = opts.lowCtr ?? 0.05
  const top = opts.top ?? 50
  const byQuery = new Map<string, QueryStats>()
  const searchQuery = new Map<string, string>()
  let searches = 0
  let zero = 0
  for (const e of events) {
    if (e.type !== 'search') continue
    const q = e.normalizedQuery || normalizeQuery(e.query ?? '')
    if (!q) continue
    searches++
    if (e.zeroResults) zero++
    const s = byQuery.get(q) ?? { query: q, searches: 0, zeroResults: 0, clicks: 0, ctr: 0 }
    s.searches++
    if (e.zeroResults) s.zeroResults++
    byQuery.set(q, s)
    if (e.searchId) searchQuery.set(e.searchId, q)
  }
  const clicked = new Set<string>()
  for (const e of events) {
    if ((e.type !== 'click' && e.type !== 'add-to-cart') || !e.searchId) continue
    const q = searchQuery.get(e.searchId)
    // one click per search counts toward CTR
    if (!q || clicked.has(e.searchId)) continue
    clicked.add(e.searchId)
    byQuery.get(q)!.clicks++
  }
  const all = [...byQuery.values()].map((s) => ({ ...s, ctr: s.searches ? s.clicks / s.searches : 0 }))
  const zeroResult = all.filter((s) => s.zeroResults === s.searches).sort((a, b) => b.searches - a.searches).slice(0, top)
  const lowClick = all
    .filter((s) => s.zeroResults < s.searches && s.searches >= minSearches && s.ctr < lowCtr)
    .sort((a, b) => b.searches - a.searches)
    .slice(0, top)
  return { searches, zeroResultRate: searches ? zero / searches : 0, zeroResult, lowClick }
}

export const suggestionSchema = z.object({
  synonyms: z.array(z.object({ term: z.string(), synonyms: z.array(z.string()) })).default([]),
  missingProducts: z.array(z.object({ query: z.string(), suggestion: z.string() })).default([]),
})

const suggest = async (services: CoreServices, ctx: AIContext, queries: string[]): Promise<z.infer<typeof suggestionSchema>> => {
  let categories = '(unknown)'
  try {
    const f = await services.adapters.offering?.facets(ctx.adapterCtx)
    if (f) categories = f.categories.slice(0, 150).map((c) => c.title).join(', ')
  } catch {
    // keep unknown
  }
  let system: string
  let promptRef: { slug: string; version: number } | undefined
  try {
    const r = await services.prompts.render(PROMPTS.learningSuggest, { categories }, ctx)
    system = r.system
    promptRef = { slug: r.slug, version: r.version }
  } catch {
    system = renderInline(learningSuggestPrompt.system, { categories })
  }
  const r = await services.ai.generateObject(
    {
      task: 'fast',
      system,
      prompt: services.guardrails.quote('queries', queries.join('\n')),
      schema: suggestionSchema,
      schemaName: 'SearchSuggestions',
      maxOutputTokens: 800,
      promptRef,
    },
    ctx,
  )
  return r.object
}

/** Build and store one weekly report. AI suggestions are best-effort; the report is stored regardless. */
export const runLearningReport = async (
  services: CoreServices,
  ctx: AIContext,
  opts: { days?: number; now?: Date } = {},
): Promise<{ id?: string | number; searches: number; synonyms: number; missing: number }> => {
  const payload = ctx.payload
  const end = opts.now ?? new Date()
  const start = new Date(end.getTime() - (opts.days ?? 7) * 86400_000)
  const events: SearchEventRow[] = []
  const db = local(payload)
  for (let page = 1; page <= 100; page++) {
    const r = await db.find({
      collection: SLUGS.events,
      where: tenantWhere(payload, ctx.tenant, { createdAt: { greater_than: start.toISOString() } }),
      limit: 1000,
      page,
      depth: 0,
      overrideAccess: true,
      select: { type: true, searchId: true, query: true, normalizedQuery: true, zeroResults: true },
    })
    events.push(...(r.docs as SearchEventRow[]))
    if (!r.hasNextPage) break
  }
  const stats = analyzeEvents(events)

  let synonyms: { term: string; synonyms: string; status: 'pending' }[] = []
  let missingProducts: { query: string; suggestion: string; status: 'pending' }[] = []
  let aiError: string | undefined
  const queries = [...stats.zeroResult, ...stats.lowClick].map((s) => s.query).slice(0, 60)
  if (queries.length) {
    try {
      const s = await suggest(services, ctx, queries)
      synonyms = s.synonyms
        .filter((x) => x.term.trim() && x.synonyms.length)
        .slice(0, 30)
        .map((x) => ({ term: x.term.trim().toLowerCase(), synonyms: x.synonyms.map((y) => y.trim()).filter(Boolean).join(', '), status: 'pending' as const }))
      missingProducts = s.missingProducts.slice(0, 30).map((x) => ({ query: x.query, suggestion: x.suggestion, status: 'pending' as const }))
    } catch (e) {
      aiError = errMessage(e).slice(0, 300)
    }
  }

  const doc = await db.create({
    collection: SLUGS.reports,
    data: {
      title: `Search report ${start.toISOString().slice(0, 10)} – ${end.toISOString().slice(0, 10)}`,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      searches: stats.searches,
      zeroResultRate: Math.round(stats.zeroResultRate * 1000) / 1000,
      zeroResultQueries: stats.zeroResult.map(({ query, searches }) => ({ query, searches })),
      lowClickQueries: stats.lowClick.map(({ query, searches, clicks, ctr }) => ({ query, searches, clicks, ctr: Math.round(ctr * 1000) / 1000 })),
      synonyms,
      missingProducts,
      aiError,
      ...tenantData(payload, ctx.tenant),
    },
    overrideAccess: true,
    depth: 0,
  })
  return { id: doc?.id, searches: stats.searches, synonyms: synonyms.length, missing: missingProducts.length }
}

export const learningReportTask: TaskConfig<{ input: { tenant?: string; days?: number }; output: { searches: number; synonyms: number } }> = {
  slug: TASKS.learning,
  label: 'AI Search: weekly learning report',
  retries: 2,
  inputSchema: [
    { name: 'tenant', type: 'text' },
    { name: 'days', type: 'number' },
  ],
  outputSchema: [
    { name: 'searches', type: 'number' },
    { name: 'synonyms', type: 'number' },
  ],
  handler: async ({ input, req }) => {
    const services = getAI(req.payload)
    const ctx = services.systemContext(req.payload, { module: MODULE, tenant: input?.tenant || undefined })
    const r = await runLearningReport(services, ctx, { days: input?.days || undefined })
    return { output: { searches: r.searches, synonyms: r.synonyms } }
  },
}
