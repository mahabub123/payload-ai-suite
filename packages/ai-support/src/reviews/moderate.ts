import { z } from 'zod'
import type { Payload, TaskConfig } from 'payload'
import type { AIEndpointDefinition, CoreServices, ReviewAdapter } from '@payload-ai-suite/ai-core'
import { AIError, getAI } from '@payload-ai-suite/ai-core'
import { PROMPTS } from '../prompts'
import { MODULE, SLUGS, TASKS, getPath, paramId, relId } from '../util'

export const moderationSchema = z.object({
  label: z.enum(['ok', 'abuse', 'spam']),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(300),
})

/** Flag threshold for the model's abuse/spam classification. */
export const FLAG_CONFIDENCE = 0.6

/** Map a raw review doc via the adapter's field map (falls back to common names). */
export const reviewFromDoc = (doc: Record<string, unknown>, adapter?: ReviewAdapter) => {
  const f = adapter?.fields ?? {}
  const pick = (concept: string, ...fallbacks: string[]) => {
    for (const p of [f[concept], ...fallbacks].filter(Boolean) as string[]) {
      const v = getPath(doc, p)
      if (v !== undefined && v !== null && v !== '') return v
    }
    return undefined
  }
  return {
    id: String(doc.id),
    offeringId: relId(pick('offeringId', 'offering', 'product')),
    title: pick('title', 'title') as string | undefined,
    body: String(pick('body', 'body', 'content', 'text', 'comment') ?? ''),
    rating: pick('rating', 'rating') as number | undefined,
  }
}

export interface ModerationResult {
  flagged: boolean
  label: 'ok' | 'abuse' | 'spam'
  held: boolean
  reason?: string
}

export const moderateReview = async (
  payload: Payload,
  services: CoreServices,
  input: { collection: string; id: string; tenant?: string | number },
): Promise<ModerationResult | { skipped: string }> => {
  const doc = (await payload
    .findByID({ collection: input.collection as never, id: input.id, depth: 0, overrideAccess: true })
    .catch(() => null)) as Record<string, unknown> | null
  if (!doc) return { skipped: 'not-found' }
  const tenant = input.tenant ?? relId(doc.tenant)
  if (!(await services.isModuleEnabled(MODULE, payload, tenant))) return { skipped: 'module-disabled' }
  const ctx = services.systemContext(payload, { module: MODULE, tenant })
  const adapter = services.adapters.review
  const review = reviewFromDoc(doc, adapter)
  const text = [review.title, review.body].filter(Boolean).join('\n')
  if (!text.trim()) return { skipped: 'empty' }

  const moderation = await services.guardrails.moderate(text, ctx)
  let label: ModerationResult['label'] = 'ok'
  let reason: string | undefined
  let confidence = 0
  if (!moderation.ok) {
    label = 'abuse'
    reason = moderation.issues.map((i) => i.message).join('; ')
    confidence = 1
  } else {
    const prompt = await services.prompts.render(PROMPTS.moderate, { review: services.guardrails.quote('review', text) }, ctx)
    const { object } = await services.ai.generateObject(
      { task: 'fast', system: prompt.system, prompt: prompt.user ?? text, schema: moderationSchema, schemaName: 'ReviewModeration', promptRef: { slug: prompt.slug, version: prompt.version } },
      ctx,
    )
    if (object.label !== 'ok' && object.confidence >= FLAG_CONFIDENCE) {
      label = object.label
      reason = object.reason
      confidence = object.confidence
    }
  }
  if (label === 'ok') return { flagged: false, label, held: false }

  let held = false
  if (adapter?.setHeld && adapter.collection === input.collection) {
    await adapter.setHeld(review.id, true, { ...ctx.adapterCtx, system: true })
    held = true
  }
  await payload.create({
    collection: SLUGS.reviewFlags as never,
    data: {
      reviewId: review.id,
      reviewCollection: input.collection,
      offeringId: review.offeringId,
      label,
      reason,
      confidence,
      held,
      status: held ? 'held' : 'flagged',
      excerpt: text.slice(0, 280),
      ...(tenant !== undefined ? { tenant } : {}),
    } as never,
    overrideAccess: true,
  })
  await services.audit.log(
    { action: 'support.review.flag', target: { collection: input.collection, id: review.id }, after: { label, held, confidence } },
    ctx,
  )
  return { flagged: true, label, held, reason }
}

export const moderateTask: TaskConfig<any> = {
  slug: TASKS.reviewModerate,
  label: 'AI support: moderate review',
  retries: 3,
  async handler({ input, req }) {
    const out = await moderateReview(req.payload, getAI(req.payload), input as { collection: string; id: string })
    return { output: out as Record<string, unknown> }
  },
}

/** Staff release a held review after checking it. */
export const releaseFlagEndpoint: AIEndpointDefinition<{ params?: { id: string } }> = {
  path: '/ai/support/review-flags/:id/release',
  method: 'post',
  module: MODULE,
  access: ['support'],
  surface: 'admin',
  budget: false,
  input: z.object({ params: z.object({ id: z.union([z.string(), z.number()]).transform(String) }).optional() }),
  async handler({ ctx, services, input, req }) {
    const id = paramId(input, req)
    const flag = (await ctx.payload
      .findByID({ collection: SLUGS.reviewFlags as never, id, depth: 0, req, overrideAccess: !req })
      .catch(() => null)) as unknown as { id: string; reviewId: string; reviewCollection: string; status: string } | null
    if (!flag) throw new AIError('not_found', 'Flag not found')
    const adapter = services.adapters.review
    if (adapter?.setHeld && adapter.collection === flag.reviewCollection) {
      await adapter.setHeld(flag.reviewId, false, { ...ctx.adapterCtx, system: true })
    }
    await ctx.payload.update({ collection: SLUGS.reviewFlags as never, id, data: { status: 'released', held: false } as never, overrideAccess: true })
    await services.audit.log({ action: 'support.review.release', target: { collection: flag.reviewCollection, id: flag.reviewId } }, ctx)
    return { ok: true }
  },
}
