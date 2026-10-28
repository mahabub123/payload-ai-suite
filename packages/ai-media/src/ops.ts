import { z } from 'zod'
import { AIError, type AIContext, type AIEndpointDefinition, type Category, type CoreServices } from '@payload-ai-suite/ai-core'
import { IMAGE_OPS, MODULE, SKIP_CONTEXT_KEY, type ImageOp } from './constants'
import { budgetMessage, generateDescription } from './describe'
import { clamp, extFor, hasField, imageInfo, imagePart, isImage, normalizeTags, resolveImage, tenantFieldName } from './image'
import { languageName, listingSchema, localeNote } from './prompts'
import type { AiMediaOptions, ImageSource } from './types'

type AnyRecord = Record<string, any>

const id = z.union([z.string().min(1), z.number()]).transform(String)

export const opInput = z.object({
  id,
  collection: z.string().optional(),
  locale: z.string().max(20).optional(),
  instructions: z.string().max(1000).optional(),
  /** lifestyle: scene description */
  scene: z.string().max(500).optional(),
  n: z.number().int().min(1).max(4).optional(),
  size: z
    .string()
    .regex(/^\d{2,4}x\d{2,4}$/)
    .optional(),
  /** alt-text / tag: also write the result into the media doc (with the caller's access). */
  apply: z.boolean().optional(),
})
export type OpInput = z.infer<typeof opInput>

const OP_LABEL: Record<ImageOp, string> = {
  'remove-background': 'background removed',
  variation: 'variation',
  lifestyle: 'lifestyle shot',
}

interface Source {
  collection: string
  doc: AnyRecord
  safe: AnyRecord
  image: ImageSource
}

const loadSource = async (ctx: AIContext, services: CoreServices, input: OpInput, options: AiMediaOptions, allowed: ReadonlySet<string>): Promise<Source> => {
  const collection = input.collection ?? [...allowed][0]
  if (!collection || !allowed.has(collection)) throw new AIError('forbidden', `AI media is not enabled for "${input.collection ?? '(none)'}"`)
  let doc: AnyRecord
  try {
    doc = (await ctx.payload.findByID({
      collection: collection as never,
      id: input.id,
      depth: 0,
      overrideAccess: false,
      user: ctx.actor.user ?? undefined,
    })) as AnyRecord
  } catch {
    throw new AIError('not_found', 'Image not found')
  }
  if (doc.aiExclude === true) throw new AIError('forbidden', 'This image is excluded from AI processing (aiExclude).')
  if (!isImage(doc)) throw new AIError('validation', 'Only images can be processed')
  const safe = services.guardrails.redact(collection, doc)
  return { collection, doc, safe, image: await resolveImage(ctx.payload, collection, doc, options) }
}

const decodeImage = (base64: string) => Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64')

const writeAsCaller = (ctx: AIContext, collection: string, docId: string, data: AnyRecord, locale?: string) =>
  ctx.payload.update({
    collection: collection as never,
    id: docId,
    data: data as never,
    locale: locale as never,
    depth: 0,
    overrideAccess: false,
    user: ctx.actor.user ?? undefined,
    context: { [SKIP_CONTEXT_KEY]: true },
  })

/** Image ops: outputs are saved as NEW media docs labelled AI-generated; originals are never replaced. */
export const runImageOp = async (
  op: ImageOp,
  ctx: AIContext,
  services: CoreServices,
  input: OpInput,
  options: AiMediaOptions,
  allowed: ReadonlySet<string>,
) => {
  const src = await loadSource(ctx, services, input, options, allowed)
  const altField = options.altField ?? 'alt'
  const rendered = await services.prompts.render(
    `media.${op}`,
    {
      instructions: input.instructions ?? '',
      scene: input.scene ?? 'a bright, tidy home setting that suits the product',
      locale: ctx.locale,
    },
    { payload: ctx.payload, locale: ctx.locale, tenant: ctx.tenant },
  )
  let result
  try {
    result = await services.ai.generateImage(
      { prompt: rendered.user ?? rendered.system, image: src.image, n: input.n ?? 1, size: input.size as `${number}x${number}` | undefined },
      ctx,
    )
  } catch (e) {
    throw budgetMessage(e)
  }
  if (!result.images.length) throw new AIError('unavailable', 'The image model returned no image')

  const tf = tenantFieldName(ctx.payload)
  const baseName = String(src.doc.filename ?? `image-${src.doc.id}`).replace(/\.[^.]+$/, '')
  const sourceAlt = String(src.safe[altField] ?? '').trim()
  const created: { id: string; url?: string; filename?: string }[] = []
  for (const [i, img] of result.images.entries()) {
    const buf = decodeImage(img.base64)
    const data: AnyRecord = {
      aiGenerated: true,
      aiSource: src.doc.id,
      aiModel: result.model,
      aiOperation: op,
      ...(tf && src.doc[tf] != null ? { [tf]: typeof src.doc[tf] === 'object' ? src.doc[tf].id : src.doc[tf] } : {}),
    }
    if (hasField(ctx.payload, src.collection, altField)) data[altField] = clamp(`${sourceAlt || baseName} (AI ${OP_LABEL[op]})`, 200)
    const doc = (await ctx.payload.create({
      collection: src.collection as never,
      data: data as never,
      file: { data: buf, mimetype: img.mediaType, name: `${baseName}-ai-${op}-${Date.now()}-${i + 1}.${extFor(img.mediaType)}`, size: buf.length },
      overrideAccess: false,
      user: ctx.actor.user ?? undefined,
      context: { [SKIP_CONTEXT_KEY]: true },
      depth: 0,
    })) as AnyRecord
    created.push({ id: String(doc.id), url: doc.url, filename: doc.filename })
  }
  return { op, sourceId: String(src.doc.id), created, model: result.model, costMicros: result.costMicros }
}

const validateCategories = (suggested: string[], existing: Category[]): Category[] => {
  const byId = new Map(existing.map((c) => [String(c.id), c]))
  const byTitle = new Map(existing.map((c) => [c.title.trim().toLowerCase(), c]))
  const out = new Map<string, Category>()
  for (const s of suggested) {
    const c = byId.get(String(s).trim()) ?? byTitle.get(String(s).trim().toLowerCase())
    if (c) out.set(String(c.id), c)
  }
  return [...out.values()]
}

/** Vision → offering draft fields (never saved; returned for staff review). */
export const imageToListing = async (ctx: AIContext, services: CoreServices, input: OpInput, options: AiMediaOptions, allowed: ReadonlySet<string>) => {
  const src = await loadSource(ctx, services, input, options, allowed)
  const categories = ctx.adapters.category ? await ctx.adapters.category.list(ctx.adapterCtx) : []
  const g = services.guardrails
  const info = imageInfo(src.safe, options.altField ?? 'alt')
  const rendered = await services.prompts.render(
    'media.image-to-listing',
    {
      locale: ctx.locale,
      language: languageName(ctx.locale),
      localeNote: localeNote(ctx.locale),
      instructions: input.instructions ? `Additional instructions from staff: ${input.instructions}` : '',
      categories: g.quote('categories', categories.length ? categories.map((c) => `${c.id}: ${c.title}`).join('\n') : '(no categories available)'),
      context: info ? g.quote('image-info', info) : '',
    },
    { payload: ctx.payload, locale: ctx.locale, tenant: ctx.tenant },
  )
  let r
  try {
    r = await services.ai.generateObject(
      {
        task: rendered.task,
        system: rendered.system,
        messages: [{ role: 'user', content: [{ type: 'text', text: rendered.user ?? '' }, imagePart(src.image)] }],
        schema: listingSchema,
        schemaName: 'listing_draft',
        needs: ['vision'],
        promptRef: { slug: rendered.slug, version: rendered.version },
      },
      ctx,
    )
  } catch (e) {
    throw budgetMessage(e)
  }
  const valid = validateCategories(r.object.categoryIds, categories)
  const attributes: Record<string, string> = {}
  for (const a of r.object.attributes) if (a.name.trim() && a.value.trim()) attributes[a.name.trim()] = a.value.trim()
  const draft = {
    title: clamp(r.object.title, 70),
    description: r.object.description.trim(),
    attributes,
    tags: normalizeTags(r.object.tags),
    categoryIds: valid.map((c) => c.id),
    categories: valid.map((c) => ({ id: c.id, title: c.title })),
    imageId: String(src.doc.id),
  }
  // Same draft keyed by the offering collection's own field names, ready for a review form.
  const offering = ctx.adapters.offering
  const map = offering?.fields ?? {}
  const fieldValues = offering
    ? {
        [map.title ?? 'title']: draft.title,
        [map.description ?? 'description']: draft.description,
        ...(map.categories || map.category ? { [map.categories ?? map.category]: draft.categoryIds } : {}),
      }
    : undefined
  return { draft, offeringCollection: offering?.collection, fieldValues, model: r.model, costMicros: r.costMicros }
}

export const describeOp = async (
  kind: 'alt-text' | 'tag',
  ctx: AIContext,
  services: CoreServices,
  input: OpInput,
  options: AiMediaOptions,
  allowed: ReadonlySet<string>,
) => {
  const src = await loadSource(ctx, services, input, options, allowed)
  const r = await generateDescription(services, ctx, src.image, src.collection, src.doc, options)
  if (input.apply) {
    const altField = options.altField ?? 'alt'
    const tagsField = options.tagsField === false ? undefined : (options.tagsField ?? 'aiTags')
    const data: AnyRecord = {}
    if (kind === 'alt-text' && hasField(ctx.payload, src.collection, altField)) data[altField] = r.alt
    if (kind === 'tag' && tagsField && hasField(ctx.payload, src.collection, tagsField)) data[tagsField] = r.tags
    if (Object.keys(data).length) await writeAsCaller(ctx, src.collection, String(src.doc.id), data, input.locale ?? ctx.locale)
  }
  return kind === 'alt-text'
    ? { alt: r.alt, applied: Boolean(input.apply), model: r.model, costMicros: r.costMicros }
    : { tags: r.tags, applied: Boolean(input.apply), model: r.model, costMicros: r.costMicros }
}

export const buildEndpoints = (options: AiMediaOptions, allowed: ReadonlySet<string>): AIEndpointDefinition<OpInput>[] => {
  const ep = (op: string, handler: AIEndpointDefinition<OpInput>['handler']): AIEndpointDefinition<OpInput> => ({
    path: `/ai/media/${op}`,
    method: 'post',
    module: MODULE,
    access: ['content'],
    surface: 'admin',
    input: opInput as unknown as z.ZodType<OpInput>,
    handler,
  })
  return [
    ep('alt-text', ({ ctx, services, input }) => describeOp('alt-text', ctx, services, input, options, allowed)),
    ep('tag', ({ ctx, services, input }) => describeOp('tag', ctx, services, input, options, allowed)),
    ...IMAGE_OPS.map((op) => ep(op, ({ ctx, services, input }) => runImageOp(op, ctx, services, input, options, allowed))),
    ep('image-to-listing', ({ ctx, services, input }) => imageToListing(ctx, services, input, options, allowed)),
  ]
}

