import { z } from 'zod'
import type { Payload, TaskConfig } from 'payload'
import type { CoreServices, Review } from 'payload-ai-core'
import { getAI } from 'payload-ai-core'
import { PROMPTS } from '../prompts'
import { MODULE, SLUGS, TASKS } from '../util'

const DAY = 86_400_000
const MAX_REVIEWS_IN_PROMPT = 60

export const insightsSchema = z.object({
  summary: z.string().min(1).max(1500),
  themes: z
    .array(z.object({ theme: z.string().max(80), sentiment: z.enum(['positive', 'neutral', 'negative']), mentions: z.number().int().min(0) }))
    .max(6),
  /** Used only for reviews without a rating. */
  unratedSentiment: z.object({ positive: z.number().int().min(0), neutral: z.number().int().min(0), negative: z.number().int().min(0) }).optional(),
})

export const ratingSentiment = (rating: number): 'positive' | 'neutral' | 'negative' =>
  rating >= 4 ? 'positive' : rating <= 2 ? 'negative' : 'neutral'

/** Weekly per-offering review summaries, themes, sentiment and flagged review ids. Idempotent per offering+period. */
export const buildReviewInsights = async (
  payload: Payload,
  services: CoreServices,
  input: { tenant?: string | number; periodEnd?: Date; days?: number } = {},
): Promise<{ offerings: number }> => {
  const adapter = services.adapters.review
  if (!adapter) return { offerings: 0 }
  if (!(await services.isModuleEnabled(MODULE, payload, input.tenant))) return { offerings: 0 }
  const ctx = services.systemContext(payload, { module: MODULE, tenant: input.tenant })
  const end = input.periodEnd ?? new Date()
  const start = new Date(end.getTime() - (input.days ?? 7) * DAY)

  const byOffering = new Map<string, Review[]>()
  for await (const r of adapter.iterate({ since: start, batchSize: 200 }, ctx.adapterCtx)) {
    const at = Date.parse(r.createdAt)
    if (Number.isFinite(at) && (at < start.getTime() || at > end.getTime())) continue
    byOffering.set(r.offeringId, [...(byOffering.get(r.offeringId) ?? []), r])
  }

  const flags = await payload.find({
    collection: SLUGS.reviewFlags as never,
    where: { and: [{ createdAt: { greater_than_equal: start.toISOString() } }, { createdAt: { less_than_equal: end.toISOString() } }] },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  const flagged = flags.docs as unknown as { reviewId: string; offeringId?: string }[]

  for (const [offeringId, reviews] of byOffering) {
    const product = ctx.adapters.offering ? await ctx.adapters.offering.get(offeringId, ctx.adapterCtx).catch(() => null) : null
    const flaggedIds = new Set(flagged.filter((f) => f.offeringId === offeringId).map((f) => String(f.reviewId)))
    const clean = reviews.filter((r) => !flaggedIds.has(String(r.id)))
    const quoted = clean
      .slice(0, MAX_REVIEWS_IN_PROMPT)
      .map((r, i) => services.guardrails.quote(`review ${i + 1}${r.rating !== undefined ? ` (${r.rating}/5)` : ''}`, [r.title, r.body].filter(Boolean).join('\n')))
      .join('\n')
    const prompt = await services.prompts.render(PROMPTS.insights, { product: product?.title ?? offeringId, reviews: quoted || '(no reviews)' }, ctx)
    const { object } = await services.ai.generateObject(
      { task: 'write', system: prompt.system, prompt: prompt.user ?? quoted, schema: insightsSchema, schemaName: 'ReviewInsights', promptRef: { slug: prompt.slug, version: prompt.version } },
      ctx,
    )
    const breakdown = { positive: 0, neutral: 0, negative: 0 }
    for (const r of clean) if (typeof r.rating === 'number') breakdown[ratingSentiment(r.rating)]++
    if (clean.some((r) => typeof r.rating !== 'number') && object.unratedSentiment) {
      breakdown.positive += object.unratedSentiment.positive
      breakdown.neutral += object.unratedSentiment.neutral
      breakdown.negative += object.unratedSentiment.negative
    }

    const data = {
      offeringId,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      reviewCount: reviews.length,
      summary: object.summary,
      themes: object.themes,
      sentimentBreakdown: breakdown,
      flagged: [...flaggedIds],
      ...(input.tenant !== undefined ? { tenant: input.tenant } : {}),
    }
    const existing = await payload.find({
      collection: SLUGS.reviewInsights as never,
      where: { and: [{ offeringId: { equals: offeringId } }, { periodStart: { equals: data.periodStart } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (existing.docs[0]) {
      await payload.update({ collection: SLUGS.reviewInsights as never, id: (existing.docs[0] as { id: string }).id, data: data as never, overrideAccess: true })
    } else {
      await payload.create({ collection: SLUGS.reviewInsights as never, data: data as never, overrideAccess: true })
    }
  }
  return { offerings: byOffering.size }
}

export const reviewInsightsTask: TaskConfig<any> = {
  slug: TASKS.reviewInsights,
  label: 'AI support: weekly review insights',
  retries: 2,
  async handler({ input, req }) {
    const i = (input ?? {}) as { tenant?: string | number }
    return { output: await buildReviewInsights(req.payload, getAI(req.payload), { tenant: i.tenant }) }
  },
}
