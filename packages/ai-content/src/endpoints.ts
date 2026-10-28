import { z } from 'zod'
import type { PayloadRequest } from 'payload'
import { AIError, type AIContext, type AIEndpointDefinition, type CoreServices } from '@payload-ai-suite/ai-core'
import { applyBulkReview, createBulkRun, getBulkReview } from './bulk'
import { GENERATIONS, MODULE } from './constants'
import { getFieldInfo } from './fields'
import { assertTenant, prepareGeneration, recordGeneration, runGeneration, streamGeneration, valueForField } from './generate'
import { ACTIONS } from './prompts'
import { CONTENT_ACTIONS, type AiContentOptions, type GenerateResponse } from './types'

type AnyRecord = Record<string, any>

const id = z.union([z.string().min(1), z.number()])
const params = z.record(z.string(), z.string()).optional()

export const generateInput = z.object({
  action: z.enum(CONTENT_ACTIONS as [string, ...string[]]),
  collection: z.string().min(1),
  docId: id.optional(),
  field: z.string().min(1),
  locale: z.string().max(20).optional(),
  instructions: z.string().max(2000).optional(),
  tone: z.string().max(60).optional(),
  targetLocale: z.string().max(20).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  currentValue: z.unknown().optional(),
  imageUrl: z
    .string()
    .max(2_000_000)
    .refine((u) => /^(https?:\/\/|\/|data:image\/)/i.test(u), 'imageUrl must be http(s), a site-relative path or a data:image URI')
    .optional(),
  template: z.string().max(120).optional(),
  stream: z.boolean().optional(),
})

export const decideInput = z.object({ accepted: z.boolean(), params })

export const bulkInput = z.object({
  collection: z.string().min(1),
  ids: z.array(id).max(5000).optional(),
  where: z.record(z.string(), z.unknown()).optional(),
  action: z.enum(CONTENT_ACTIONS as [string, ...string[]]),
  template: z.string().max(120).optional(),
  fields: z.array(z.string().min(1)).min(1).max(20),
  locale: z.string().max(20).optional(),
  instructions: z.string().max(2000).optional(),
  tone: z.string().max(60).optional(),
  targetLocale: z.string().max(20).optional(),
})

export const reviewInput = z.union([
  z.object({ decision: z.enum(['accept-all', 'discard-all']), params }),
  z.object({ items: z.array(z.object({ id, accept: z.boolean() })).min(1).max(1000), params }),
])

const pageInput = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  params,
})

const param = (input: AnyRecord | undefined, req: PayloadRequest, name: string): string => {
  const v = input?.params?.[name] ?? (req.routeParams as AnyRecord | undefined)?.[name]
  if (v == null || v === '') throw new AIError('validation', `Missing path parameter :${name}`)
  return String(v)
}

/** Accept / reject one generation (acceptance metric). Returns the field-ready value when accepted. */
export const decideGeneration = async (ctx: AIContext, services: CoreServices, generationId: string, accepted: boolean) => {
  const { payload } = ctx
  let gen: AnyRecord
  try {
    gen = (await payload.findByID({ collection: GENERATIONS as never, id: generationId, depth: 0, overrideAccess: true })) as AnyRecord
  } catch {
    throw new AIError('not_found', 'Generation not found')
  }
  assertTenant(payload, gen, ctx.tenant)
  await payload.update({
    collection: GENERATIONS as never,
    id: generationId,
    overrideAccess: true,
    data: {
      accepted,
      acceptedAt: new Date().toISOString(),
      decidedBy: ctx.actor.user ? String((ctx.actor.user as AnyRecord).id) : undefined,
    } as never,
  })
  let value: unknown
  if (accepted) {
    const field = getFieldInfo(payload, gen.targetCollection, gen.field)
    if (field) value = await valueForField(payload, gen.targetCollection, field, String(gen.output ?? ''), gen.data)
  }
  try {
    await services.audit.log(
      { action: accepted ? 'content.generation.accepted' : 'content.generation.rejected', target: { collection: GENERATIONS, id: generationId } },
      ctx,
    )
  } catch {
    /* best-effort */
  }
  return { id: generationId, accepted, output: gen.output as string, data: gen.data, value }
}

export const buildEndpoints = (options: AiContentOptions, allowed: ReadonlySet<string>): AIEndpointDefinition<any>[] => {
  const assertAllowed = (collection: string) => {
    if (!allowed.has(collection)) throw new AIError('forbidden', `AI content is not enabled for "${collection}"`)
  }

  const generate: AIEndpointDefinition<z.infer<typeof generateInput>> = {
    path: '/ai/content/generate',
    method: 'post',
    module: MODULE,
    access: ['content'],
    surface: 'admin',
    input: generateInput as z.ZodType<z.infer<typeof generateInput>>,
    async handler({ ctx, services, input }) {
      assertAllowed(input.collection)
      const body = { ...input, action: input.action as GenerateResponse['action'] }
      const p = await prepareGeneration(body, ctx, services)
      const stream = input.stream ?? (ACTIONS[body.action].long && p.def.kind === 'text' && p.field.type !== 'text')
      if (stream && p.def.kind === 'text') return streamGeneration(p, services)
      const r = await runGeneration(p, services)
      const generationId = await recordGeneration(ctx.payload, { p, output: r.output, data: r.data, meta: r.meta })
      const value = await valueForField(ctx.payload, input.collection, p.field, r.output, r.data)
      return {
        generationId,
        action: body.action,
        fieldType: p.field.type,
        output: r.output,
        data: r.data,
        value,
        model: r.meta.model,
        costMicros: r.meta.costMicros,
      } satisfies GenerateResponse
    },
  }

  const decide: AIEndpointDefinition<z.infer<typeof decideInput>> = {
    path: '/ai/content/generations/:id',
    method: 'patch',
    module: MODULE,
    access: ['content'],
    surface: 'admin',
    budget: false,
    input: decideInput,
    handler: ({ ctx, services, input, req }) => decideGeneration(ctx, services, param(input, req, 'id'), input.accepted),
  }

  const bulk: AIEndpointDefinition<z.infer<typeof bulkInput>> = {
    path: '/ai/content/bulk',
    method: 'post',
    module: MODULE,
    access: ['store-admin'],
    surface: 'admin',
    input: bulkInput as z.ZodType<z.infer<typeof bulkInput>>,
    handler: ({ ctx, input }) => createBulkRun({ ...input, action: input.action as GenerateResponse['action'], where: input.where as never }, ctx, options, allowed),
  }

  const bulkGet: AIEndpointDefinition<z.infer<typeof pageInput>> = {
    path: '/ai/content/bulk/:runId',
    method: 'get',
    module: MODULE,
    access: ['store-admin'],
    surface: 'admin',
    budget: false,
    input: pageInput as z.ZodType<z.infer<typeof pageInput>>,
    handler: ({ ctx, input, req }) => getBulkReview(ctx, param(input, req, 'runId'), { page: input.page, limit: input.limit }),
  }

  const bulkReview: AIEndpointDefinition<z.infer<typeof reviewInput>> = {
    path: '/ai/content/bulk/:runId/review',
    method: 'post',
    module: MODULE,
    access: ['store-admin'],
    surface: 'admin',
    budget: false,
    input: reviewInput,
    handler: ({ ctx, services, input, req }) => {
      const { params: _p, ...body } = input as AnyRecord
      return applyBulkReview(ctx, param(input, req, 'runId'), body as never, services)
    },
  }

  return [generate, decide, bulk, bulkGet, bulkReview]
}
