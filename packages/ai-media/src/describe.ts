import type { Payload, TaskConfig } from 'payload'
import { AIError, getAI, isAIError, type AIContext, type CoreServices } from '@payload-ai-suite/ai-core'
import { DESCRIBE_TASK, MODULE, SKIP_CONTEXT_KEY } from './constants'
import { clamp, hasField, imageInfo, imagePart, isImage, isLocalizedField, normalizeTags, resolveImage } from './image'
import { ALT_MAX, describeSchema, languageName, localeNote } from './prompts'
import type { AiMediaOptions, ImageSource } from './types'

type AnyRecord = Record<string, any>

export const budgetMessage = (e: unknown): unknown =>
  isAIError(e) && e.code === 'budget_exceeded'
    ? new AIError('budget_exceeded', 'The AI budget for media is used up for this month. Ask an administrator to raise it in AI Suite settings.', { cause: e })
    : e

/** Vision call: alt text + tags for one image in one locale. */
export const generateDescription = async (
  services: CoreServices,
  ctx: AIContext,
  image: ImageSource,
  collection: string,
  doc: AnyRecord,
  options: AiMediaOptions,
): Promise<{ alt: string; tags: string[]; model: string; costMicros: number }> => {
  const altField = options.altField ?? 'alt'
  const safe = services.guardrails.redact(collection, doc)
  const info = imageInfo(safe, altField)
  const rendered = await services.prompts.render(
    'media.describe',
    {
      locale: ctx.locale,
      language: languageName(ctx.locale),
      localeNote: localeNote(ctx.locale),
      context: info ? services.guardrails.quote('image-info', info) : '',
    },
    { payload: ctx.payload, locale: ctx.locale, tenant: ctx.tenant },
  )
  try {
    const r = await services.ai.generateObject(
      {
        task: options.describeTask ?? (rendered.task === 'chat' ? 'chat' : 'fast'),
        system: rendered.system,
        messages: [{ role: 'user', content: [{ type: 'text', text: rendered.user ?? 'Describe the attached image.' }, imagePart(image)] }],
        schema: describeSchema,
        schemaName: 'image_description',
        needs: ['vision'],
        promptRef: { slug: rendered.slug, version: rendered.version },
      },
      ctx,
    )
    return { alt: clamp(r.object.alt, ALT_MAX), tags: normalizeTags(r.object.tags), model: r.model, costMicros: r.costMicros }
  } catch (e) {
    throw budgetMessage(e)
  }
}

const defaultLocale = (payload: Payload): string | undefined => {
  const l = payload.config?.localization
  return l && typeof l === 'object' ? (l as AnyRecord).defaultLocale : undefined
}

export interface DescribeInput {
  collection: string
  id: string
  tenant?: string | number
}

/**
 * Job body: fill empty alt text (or overwrite when options.overwriteAlt) and empty tags.
 * Writes carry the skip-context flag so the afterChange hook does not queue again.
 */
export const describeMedia = async (
  payload: Payload,
  input: DescribeInput,
  options: AiMediaOptions,
  services: CoreServices = getAI(payload),
): Promise<{ status: string; locales?: string[] }> => {
  const { collection, id, tenant } = input
  if (!(await services.isModuleEnabled(MODULE, payload, tenant))) return { status: 'disabled' }
  let doc: AnyRecord
  try {
    doc = (await payload.findByID({ collection: collection as never, id, depth: 0, overrideAccess: true })) as AnyRecord
  } catch {
    return { status: 'missing' }
  }
  if (doc.aiExclude === true) return { status: 'excluded' }
  if (!isImage(doc)) return { status: 'not-image' }

  const altField = options.altField ?? 'alt'
  const tagsField = options.tagsField === false ? undefined : (options.tagsField ?? 'aiTags')
  const withAlt = hasField(payload, collection, altField)
  const withTags = Boolean(tagsField && hasField(payload, collection, tagsField))
  const localizedAlt = isLocalizedField(payload, collection, altField)
  const fallback = defaultLocale(payload)
  const locales: (string | undefined)[] = localizedAlt ? (options.locales?.length ? options.locales : [fallback]) : [options.locales?.[0] ?? fallback]

  let image: ImageSource | undefined
  const written: string[] = []
  for (const [i, locale] of locales.entries()) {
    const current = localizedAlt && locale
      ? ((await payload.findByID({ collection: collection as never, id, depth: 0, locale: locale as never, overrideAccess: true })) as AnyRecord)
      : doc
    const needAlt = withAlt && (options.overwriteAlt || !String(current[altField] ?? '').trim())
    const needTags = withTags && i === 0 && !(Array.isArray(doc[tagsField!]) && doc[tagsField!].length)
    if (!needAlt && !needTags) continue

    try {
      image ??= await resolveImage(payload, collection, doc, options)
      const ctx = services.systemContext(payload, { module: MODULE, tenant, locale: locale ?? 'en' })
      const r = await generateDescription(services, ctx, image, collection, current, options)
      const data: AnyRecord = {}
      if (needAlt && r.alt) data[altField] = r.alt
      if (needTags && r.tags.length) data[tagsField!] = r.tags
      if (!Object.keys(data).length) continue
      await payload.update({
        collection: collection as never,
        id,
        data: data as never,
        locale: locale as never,
        depth: 0,
        overrideAccess: true,
        context: { [SKIP_CONTEXT_KEY]: true },
      })
      written.push(locale ?? 'default')
    } catch (e) {
      const err = budgetMessage(e)
      // Budget stop is final for this month: log once, do not let the queue retry.
      if (isAIError(err) && err.code === 'budget_exceeded') {
        payload.logger?.warn?.(`[ai-media] ${err.message}`)
        return { status: 'budget', locales: written }
      }
      throw err
    }
  }
  return { status: written.length ? 'described' : 'skipped', locales: written }
}

export const describeTask = (options: AiMediaOptions): TaskConfig<any> => ({
  slug: DESCRIBE_TASK,
  label: 'AI media: alt text + tags',
  retries: 2,
  inputSchema: [
    { name: 'collection', type: 'text', required: true },
    { name: 'id', type: 'text', required: true },
    { name: 'tenant', type: 'text' },
  ],
  outputSchema: [{ name: 'status', type: 'text' }],
  handler: async ({ input, req }) => {
    const i = input as AnyRecord
    const r = await describeMedia(req.payload, { collection: String(i.collection), id: String(i.id), tenant: i.tenant ?? undefined }, options)
    return { output: { status: r.status } }
  },
})
