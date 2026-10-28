import { z } from 'zod'
import type { AIContext, AIEndpointDefinition, CoreServices } from '@payload-ai-suite/ai-core'
import { AIError, getAI } from '@payload-ai-suite/ai-core'
import type { TaskConfig as PayloadTaskConfig, Where } from 'payload'
import { MODULE, SLUGS, TASKS } from '../util'
import { PROMPTS } from '../prompts'
import { evaluateSegment } from './evaluate'
import { segmentDefinition, segmentProposal, type SegmentDefinition } from './schema'

/** Ask the reason model for a structured filter; category ids are checked against the real list. */
export const proposeSegment = async (
  description: string,
  ctx: AIContext,
  services: CoreServices,
): Promise<{ definition: SegmentDefinition; explanation: string }> => {
  const input = services.guardrails.checkInput(description, ctx)
  if (!input.ok) throw new AIError('validation', 'Description rejected', { details: input.issues })
  const categories = ctx.adapters.category ? await ctx.adapters.category.list(ctx.adapterCtx) : []
  const prompt = await services.prompts.render(
    PROMPTS.segment,
    {
      description,
      today: new Date().toISOString().slice(0, 10),
      categories: categories.length ? categories.map((c) => `${c.id}: ${c.title}`).join('; ') : '(none)',
    },
    ctx,
  )
  const { object } = await services.ai.generateObject(
    {
      task: 'reason',
      system: prompt.system,
      prompt: prompt.user ?? description,
      schema: segmentProposal,
      schemaName: 'SegmentProposal',
      promptRef: { slug: prompt.slug, version: prompt.version },
    },
    ctx,
  )
  const known = new Set(categories.map((c) => c.id))
  for (const c of object.definition.conditions) {
    if (c.type === 'purchasedCategory') {
      const unknown = c.categoryIds.filter((id) => !known.has(id))
      if (unknown.length) throw new AIError('validation', 'The filter references unknown categories', { details: { unknown } })
    }
  }
  return object
}

const previewInput = z.union([
  z.strictObject({ description: z.string().min(3).max(1000) }),
  z.strictObject({ definition: segmentDefinition }),
])

export const segmentPreviewEndpoint: AIEndpointDefinition<z.infer<typeof previewInput>> = {
  path: '/ai/marketing/segments/preview',
  method: 'post',
  module: MODULE,
  access: 'staff',
  surface: 'admin',
  input: previewInput,
  async handler({ ctx, services, input }) {
    const proposal =
      'definition' in input ? { definition: input.definition, explanation: '' } : await proposeSegment(input.description, ctx, services)
    const evaluation = await evaluateSegment(proposal.definition, ctx.adapters, ctx.adapterCtx)
    return { ...proposal, size: evaluation.size, sample: evaluation.sample }
  },
}

const saveInput = z.strictObject({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  definition: segmentDefinition,
})

export const segmentSaveEndpoint: AIEndpointDefinition<z.infer<typeof saveInput>> = {
  path: '/ai/marketing/segments',
  method: 'post',
  module: MODULE,
  access: 'staff',
  surface: 'admin',
  input: saveInput,
  budget: false,
  async handler({ ctx, input, req }) {
    const evaluation = await evaluateSegment(input.definition, ctx.adapters, ctx.adapterCtx)
    const doc = await ctx.payload.create({
      collection: SLUGS.segments as never,
      data: {
        name: input.name,
        description: input.description,
        definition: input.definition,
        size: evaluation.size,
        sample: evaluation.sample,
        refreshedAt: new Date().toISOString(),
        ...(ctx.tenant !== undefined ? { tenant: ctx.tenant } : {}),
      } as never,
      req,
      overrideAccess: false,
    })
    return { id: (doc as { id: string | number }).id, size: evaluation.size, sample: evaluation.sample }
  },
}

/** Recompute size + sample for one or all saved segments. */
export const refreshSegments = async (
  services: CoreServices,
  ctx: AIContext,
  segmentId?: string,
): Promise<{ refreshed: number }> => {
  const { payload } = ctx
  const where: Where = segmentId ? { id: { equals: segmentId } } : ctx.tenant !== undefined ? { tenant: { equals: ctx.tenant } } : {}
  const { docs } = await payload.find({ collection: SLUGS.segments as never, where, limit: 500, depth: 0, overrideAccess: true })
  let refreshed = 0
  for (const doc of docs as unknown as Record<string, unknown>[]) {
    const parsed = segmentDefinition.safeParse(doc.definition)
    if (!parsed.success) {
      payload.logger.warn(`[ai-marketing] segment ${String(doc.id)} has an invalid definition; skipped`)
      continue
    }
    const evaluation = await evaluateSegment(parsed.data, services.adapters, ctx.adapterCtx)
    await payload.update({
      collection: SLUGS.segments as never,
      id: doc.id as string,
      data: { size: evaluation.size, sample: evaluation.sample, refreshedAt: new Date().toISOString() } as never,
      overrideAccess: true,
    })
    refreshed++
  }
  return { refreshed }
}

export const segmentRefreshTask: PayloadTaskConfig<any> = {
  slug: TASKS.segmentRefresh,
  label: 'AI marketing: refresh segments',
  retries: 2,
  async handler({ input, req }) {
    const { segmentId, tenant } = (input ?? {}) as { segmentId?: string; tenant?: string | number }
    const services = getAI(req.payload)
    const ctx = services.systemContext(req.payload, { module: MODULE, tenant })
    return { output: await refreshSegments(services, ctx, segmentId) }
  },
}
