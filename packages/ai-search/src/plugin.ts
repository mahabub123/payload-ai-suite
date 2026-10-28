import { z } from 'zod'
import type { CollectionConfig, Config, Plugin } from 'payload'
import type { AIEndpointDefinition, AIModuleDefinition, SearchEventBody } from '@payload-ai-suite/ai-core'
import { createAIModulePlugin } from '@payload-ai-suite/ai-core'
import { recsCollection, searchEventsCollection, searchReportsCollection } from './collections'
import { MODULE, SLUGS, TASKS } from './constants'
import { errMessage } from './db'
import { getSearchEngine } from './engine'
import { indexOfferingTask, reindexTask, withIndexingHooks } from './indexing'
import { learningReportTask } from './learning'
import { resolveOptions, type AiSearchOptions, type ResolvedSearchOptions } from './options'
import { learningSuggestPrompt, parseFiltersPrompt } from './prompts'
import { cooccurrenceTask, getRecommendations, recsCacheControl } from './recs'
import { searchTools } from './tools'
import { OFFERINGS_TABLE } from './vectorTable'

const searchQuery = z.object({
  q: z.string().max(200).optional().default(''),
  filters: z.string().max(2000).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(48).optional(),
  session: z.string().max(128).optional(),
})

const eventBody = z.object({
  type: z.enum(['click', 'add-to-cart', 'impression']),
  searchId: z.string().max(64).optional(),
  query: z.string().max(200).optional(),
  offeringId: z.string().max(64).optional(),
  position: z.number().int().min(0).max(1000).optional(),
  sessionId: z.string().max(128).optional(),
}) satisfies z.ZodType<SearchEventBody>

const recsQuery = z.object({
  offering: z.string().max(64).optional(),
  kind: z.enum(['similar', 'bought-together', 'for-you']).default('similar'),
  limit: z.coerce.number().int().min(1).max(24).optional(),
  session: z.string().max(128).optional(),
})

const endpoints = (o: ResolvedSearchOptions): AIEndpointDefinition<any>[] => {
  const list: AIEndpointDefinition<any>[] = [
    {
      path: '/ai/search',
      method: 'get',
      module: MODULE,
      access: 'anyone',
      surface: 'storefront',
      budget: false,
      rateLimit: { limit: 60, windowSec: 60 },
      input: searchQuery,
      handler: ({ ctx, services, input }) =>
        getSearchEngine(ctx.payload, services).search(
          { q: input.q, filters: input.filters, cursor: input.cursor, limit: input.limit, sessionId: input.session, source: 'storefront' },
          ctx,
        ),
    } satisfies AIEndpointDefinition<z.infer<typeof searchQuery>>,
    {
      path: '/ai/search/events',
      method: 'post',
      module: MODULE,
      access: 'anyone',
      surface: 'storefront',
      budget: false,
      rateLimit: { limit: 120, windowSec: 60 },
      input: eventBody,
      handler: ({ ctx, services, input }) => getSearchEngine(ctx.payload, services).recordEvent(input, ctx),
    } satisfies AIEndpointDefinition<z.infer<typeof eventBody>>,
  ]
  if (o.recommendations) {
    list.push({
      path: '/ai/recs',
      method: 'get',
      module: MODULE,
      access: 'anyone',
      surface: 'storefront',
      budget: false,
      input: recsQuery,
      handler: async ({ ctx, services, input }) => {
        const body = await getRecommendations(
          getSearchEngine(ctx.payload, services),
          { kind: input.kind, offering: input.offering, limit: input.limit, sessionId: input.session },
          ctx,
        )
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': recsCacheControl(input.kind),
            ...(input.kind === 'for-you' ? { vary: 'Cookie, Authorization' } : {}),
          },
        })
      },
    } satisfies AIEndpointDefinition<z.infer<typeof recsQuery>>)
  }
  return list
}

/** Invalidate cached approved synonyms when staff edit a report. */
const withSynonymInvalidation = (c: CollectionConfig): CollectionConfig => ({
  ...c,
  hooks: {
    ...c.hooks,
    afterChange: [
      ...(c.hooks?.afterChange ?? []),
      ({ doc, req }) => {
        try {
          getSearchEngine(req.payload).invalidateSynonyms()
        } catch {
          // core not initialised
        }
        return doc
      },
    ],
  },
})

/** Build the module definition (exported for config snapshots/tests). */
export const searchModuleDefinition = (options?: AiSearchOptions): AIModuleDefinition & { searchOptions: ResolvedSearchOptions } => {
  const o = resolveOptions(options)
  const schedules: AIModuleDefinition['schedules'] = []
  if (o.schedules.reindex) schedules.push({ task: TASKS.reindex, cron: o.schedules.reindex })
  if (o.recommendations && o.schedules.cooccurrence) schedules.push({ task: TASKS.cooccurrence, cron: o.schedules.cooccurrence })
  if (o.schedules.learning) schedules.push({ task: TASKS.learning, cron: o.schedules.learning })

  return {
    slug: MODULE,
    requires: ['offering'],
    searchOptions: o,
    collections: [
      searchEventsCollection,
      withSynonymInvalidation(searchReportsCollection),
      ...(o.recommendations ? [recsCollection] : []),
    ],
    tools: searchTools(o),
    prompts: [parseFiltersPrompt, learningSuggestPrompt],
    endpoints: endpoints(o),
    tasks: [
      indexOfferingTask,
      reindexTask,
      learningReportTask,
      ...(o.recommendations ? [cooccurrenceTask(o.cooccurrence)] : []),
    ] as AIModuleDefinition['tasks'],
    schedules,
    extendConfig: (config: Config) => withIndexingHooks(config),
    onInit: async (payload, services) => {
      try {
        const ctx = services.systemContext(payload, { module: MODULE })
        const { dims } = services.ai.activeEmbedding(ctx)
        await services.vectors.ensureTable(OFFERINGS_TABLE, dims)
      } catch (e) {
        payload.logger.error(`[ai-search] could not ensure ${OFFERINGS_TABLE.name}: ${errMessage(e)} (search falls back to keyword)`)
      }
      getSearchEngine(payload, services)
    },
  }
}

/**
 * Smart Search & Recommendations (design doc §10.2). Install after aiCore():
 * `plugins: [aiCore({...}), aiSearch({ boosts: { 'prod-1': 1.5 } })]`
 */
export const aiSearch = (options?: AiSearchOptions): Plugin => createAIModulePlugin(searchModuleDefinition(options))

export { SLUGS }
