import type { Payload } from 'payload'
import {
  AIError,
  getSuiteState,
  isAIError,
  type AICoreOptions,
  type AIContext,
  type CallMeta,
  type Category,
  type ChatMessage,
  type CoreServices,
  type MessagePart,
  type RenderedPrompt,
  type StreamWireEvent,
} from '@payload-ai-suite/ai-core'
import { GENERATIONS } from './constants'
import { getFieldInfo, getPath, toPlainText } from './fields'
import { markdownToLexical } from './lexical'
import { ACTIONS, FORMAT_MARKDOWN, FORMAT_PLAIN, languageName, localeNote, type ActionDef } from './prompts'
import type { ContentAction, ExtractedDraft, GenerateRequestBody, TargetFieldInfo } from './types'
import { attributesToRecord, clampText, cleanOutput, enforceSeo, normalizeTags, validateCategories } from './validate'

type AnyRecord = Record<string, any>

export interface Prepared {
  def: ActionDef
  input: GenerateRequestBody
  field: TargetFieldInfo
  locale: string
  rendered: RenderedPrompt
  messages: ChatMessage[]
  needsVision: boolean
  categories: Category[]
  ctx: AIContext
}

export interface GenerationResult {
  output: string
  data?: unknown
  /** Unshaped structured object (structured actions only). */
  raw?: AnyRecord
  meta: CallMeta
}

/** Keys never sent as product context: volatile commercial data the copy must not quote, plus internals. */
const OMIT_KEYS = /^(id|_status|createdAt|updatedAt|tenant|price.*|.*Price|compareAt.*|cost.*|stock|inventory|quantity|.*Stock|password|hash|salt|.*token.*|aiTags|meta)$/i
const MAX_CONTEXT_CHARS = 6000

/** Compact "key: value" text of a document for prompts (rich text flattened, nested objects one level deep). */
export const compactDoc = (doc: AnyRecord | undefined, depth = 0): string => {
  if (!doc) return ''
  const lines: string[] = []
  for (const [k, v] of Object.entries(doc)) {
    if (OMIT_KEYS.test(k) || v == null || v === '') continue
    if (typeof v === 'object' && !Array.isArray(v) && !(v as AnyRecord).root) {
      if (depth < 1) {
        const inner = compactDoc(v as AnyRecord, depth + 1)
        if (inner) lines.push(`${k}:\n${inner.replace(/^/gm, '  ')}`)
      }
      continue
    }
    if (Array.isArray(v) && v.some((x) => x && typeof x === 'object' && !(x as AnyRecord).root)) {
      const items = v
        .map((x) => (x && typeof x === 'object' ? toPlainText((x as AnyRecord).title ?? (x as AnyRecord).name ?? (x as AnyRecord).value ?? '') : toPlainText(x)))
        .filter(Boolean)
      if (items.length) lines.push(`${k}: ${items.join(', ')}`)
      continue
    }
    const text = toPlainText(v)
    if (text) lines.push(`${k}: ${text}`)
  }
  return lines.join('\n').slice(0, MAX_CONTEXT_CHARS)
}

const tenantFieldName = (payload: Payload): string | undefined =>
  (getSuiteState(payload.config)?.options as AICoreOptions | undefined)?.tenant?.field

export const tenantData = (payload: Payload, tenant: string | number | undefined): AnyRecord => {
  const f = tenantFieldName(payload)
  return f && tenant != null ? { [f]: tenant } : {}
}

/** Same-tenant check for records read with overrideAccess. */
export const assertTenant = (payload: Payload, record: AnyRecord, tenant: string | number | undefined) => {
  const f = tenantFieldName(payload)
  if (!f || tenant == null) return
  const v = record[f]
  const id = v && typeof v === 'object' ? v.id : v
  if (id != null && String(id) !== String(tenant)) throw new AIError('not_found', 'Not found')
}

const resolveImageUrl = (payload: Payload, url: string | undefined): string | undefined => {
  if (!url) return undefined
  if (/^https?:\/\//i.test(url) || /^data:image\//i.test(url)) return url
  if (url.startsWith('/') && payload.config?.serverURL) return `${payload.config.serverURL.replace(/\/$/, '')}${url}`
  return undefined
}

/** Load the target document with the caller's access (system contexts may override). */
export const loadDoc = async (
  ctx: AIContext,
  collection: string,
  id: string | number,
  locale?: string,
): Promise<AnyRecord> => {
  const system = ctx.actor.kind === 'system'
  try {
    return (await ctx.payload.findByID({
      collection: collection as never,
      id,
      depth: 1,
      locale: locale as never,
      draft: true,
      overrideAccess: system,
      user: system ? undefined : ctx.actor.user ?? undefined,
    })) as AnyRecord
  } catch {
    throw new AIError('not_found', `Document ${collection}/${id} not found`)
  }
}

const imageFromDoc = (ctx: AIContext, collection: string, doc: AnyRecord | undefined): string | undefined => {
  if (!doc) return undefined
  const offering = ctx.adapters.offering
  if (offering && offering.collection === collection) {
    try {
      const o = offering.fromDoc(doc, ctx.adapterCtx)
      return o.imageUrl ?? o.images?.[0]
    } catch {
      /* fall through to generic lookup */
    }
  }
  for (const k of ['image', 'images', 'gallery', 'photo', 'featuredImage', 'thumbnail']) {
    const v = doc[k]
    const first = Array.isArray(v) ? v[0] : v
    const img = first && typeof first === 'object' ? (first.image ?? first) : undefined
    if (img && typeof img === 'object' && typeof img.url === 'string') return img.url
  }
  return undefined
}

export const prepareGeneration = async (
  input: GenerateRequestBody,
  ctx: AIContext,
  services: CoreServices,
  opts: { doc?: AnyRecord } = {},
): Promise<Prepared> => {
  const def = ACTIONS[input.action]
  if (!def) throw new AIError('validation', `Unknown action "${input.action}"`)
  const field = getFieldInfo(ctx.payload, input.collection, input.field)
  if (!field) throw new AIError('validation', `"${input.collection}.${input.field}" is not a text, textarea or rich text field`)
  const locale = input.locale || ctx.locale || 'en'

  const doc = opts.doc ?? (input.docId != null && input.docId !== '' ? await loadDoc(ctx, input.collection, input.docId, locale) : undefined)
  const merged = services.guardrails.redact(input.collection, { ...(doc ?? {}), ...(input.context ?? {}) })
  const productText = compactDoc(merged)

  const sourceText =
    toPlainText(input.currentValue).trim() || toPlainText(getPath(doc ? services.guardrails.redact(input.collection, doc) : undefined, input.field)).trim()
  if (def.needsSource && !sourceText) throw new AIError('validation', 'The field is empty — there is nothing to rewrite yet.')
  if (input.action === 'translate' && !input.targetLocale) throw new AIError('validation', 'targetLocale is required for translate')

  let categories: Category[] = []
  if ((input.action === 'tags' || input.action === 'extract') && ctx.adapters.category) {
    categories = await ctx.adapters.category.list(ctx.adapterCtx)
  }

  const image = resolveImageUrl(ctx.payload, input.imageUrl) ?? (def.vision ? resolveImageUrl(ctx.payload, imageFromDoc(ctx, input.collection, doc)) : undefined)
  if (input.action === 'from-photo' && !image) throw new AIError('validation', 'No photo found — upload a product image or pass imageUrl.')
  const needsVision = Boolean(def.vision && image)

  const g = services.guardrails
  const outLocale = input.action === 'translate' ? input.targetLocale! : locale
  const rich = field.type === 'richText'
  const vars: AnyRecord = {
    locale: outLocale,
    language: languageName(outLocale),
    localeNote: localeNote(outLocale),
    sourceLanguage: languageName(locale),
    tone: input.tone || 'friendly, confident',
    fieldLabel: field.label ?? input.field,
    collection: input.collection,
    format: rich ? FORMAT_MARKDOWN : FORMAT_PLAIN,
    lengthHint: field.maxLength
      ? `Keep it under ${field.maxLength} characters.`
      : field.type === 'text'
        ? 'Keep it to one line.'
        : '',
    instructions: input.instructions ? `Additional instructions from staff: ${input.instructions}` : '',
    product: productText ? g.quote('product', productText) : '',
    source: sourceText ? g.quote('source', sourceText) : '',
    spec: typeof input.context?.spec === 'string' ? g.quote('spec', input.context.spec) : '',
    categories: g.quote('categories', categories.length ? categories.map((c) => `${c.id}: ${c.title}`).join('\n') : '(no categories available)'),
  }

  const slug = input.template || def.slug
  const rendered = await services.prompts.render(slug, vars, { payload: ctx.payload, locale: outLocale, tenant: ctx.tenant })
  const userText = rendered.user ?? ''
  const content: string | MessagePart[] = needsVision ? [{ type: 'text', text: userText }, { type: 'image', url: image }] : userText
  return { def, input, field, locale: outLocale, rendered, messages: [{ role: 'user', content }], needsVision, categories, ctx }
}

const callOpts = (p: Prepared, batch = false) => ({
  task: p.rendered.task,
  system: p.rendered.system,
  messages: p.messages,
  promptRef: { slug: p.rendered.slug, version: p.rendered.version },
  needs: [...(p.needsVision ? (['vision'] as const) : []), ...(batch ? (['batch'] as const) : [])],
})

const faqToText = (faqs: { question: string; answer: string }[], rich: boolean) =>
  faqs.map((f) => (rich ? `### ${f.question.trim()}\n\n${f.answer.trim()}` : `Q: ${f.question.trim()}\nA: ${f.answer.trim()}`)).join('\n\n')

/** Shape a structured result into { output for the field, data }. */
export const shapeStructured = (action: ContentAction, raw: AnyRecord, field: TargetFieldInfo, categories: Category[]): { output: string; data: unknown } => {
  const rich = field.type === 'richText'
  switch (action) {
    case 'seo': {
      const seo = enforceSeo(raw as { title: string; description: string })
      return { output: /desc/i.test(field.path) ? seo.description : seo.title, data: seo }
    }
    case 'faq': {
      const faqs = ((raw.faqs ?? []) as { question: string; answer: string }[]).filter((f) => f.question && f.answer)
      return { output: faqToText(faqs, rich), data: { faqs } }
    }
    case 'attributes': {
      const attributes = attributesToRecord(raw.attributes ?? [])
      return { output: Object.entries(attributes).map(([k, v]) => `${k}: ${v}`).join('\n'), data: { attributes } }
    }
    case 'tags': {
      const tags = normalizeTags(raw.tags ?? [])
      const valid = validateCategories(raw.categoryIds ?? [], categories)
      return {
        output: tags.join(', '),
        data: { tags, categoryIds: valid.map((c) => c.id), categories: valid.map((c) => ({ id: c.id, title: c.title })) },
      }
    }
    case 'extract': {
      const valid = validateCategories(raw.categoryIds ?? [], categories)
      const draft: ExtractedDraft = {
        title: raw.title ? clampText(String(raw.title), 70) : undefined,
        description: raw.description ? cleanOutput(String(raw.description), !rich) : undefined,
        attributes: attributesToRecord(raw.attributes ?? []),
        tags: normalizeTags(raw.tags ?? []),
        categoryIds: valid.map((c) => c.id),
        categories: valid.map((c) => ({ id: c.id, title: c.title })),
      }
      return { output: draft.description ?? '', data: draft }
    }
    default:
      return { output: String(raw.text ?? ''), data: raw }
  }
}

const finishText = (text: string, field: TargetFieldInfo) => {
  const cleaned = cleanOutput(text, field.type !== 'richText')
  return field.maxLength ? clampText(cleaned, field.maxLength) : cleaned
}

/** Non-streamed generation (short fields, structured output, bulk). */
export const runGeneration = async (p: Prepared, services: CoreServices, opts: { batch?: boolean } = {}): Promise<GenerationResult> => {
  try {
    if (p.def.kind === 'structured' && p.def.schema) {
      const r = await services.ai.generateObject({ ...callOpts(p, opts.batch), schema: p.def.schema, schemaName: p.def.action }, p.ctx)
      const shaped = shapeStructured(p.def.action, r.object as AnyRecord, p.field, p.categories)
      return { ...shaped, raw: r.object as AnyRecord, meta: metaOf(r) }
    }
    const r = await services.ai.generateText(callOpts(p, opts.batch), p.ctx)
    return { output: finishText(r.text, p.field), meta: metaOf(r) }
  } catch (e) {
    throw friendlyError(e)
  }
}

const metaOf = (m: CallMeta): CallMeta => ({ model: m.model, latencyMs: m.latencyMs, costMicros: m.costMicros, usageId: m.usageId })

export const friendlyError = (e: unknown): unknown => {
  if (isAIError(e) && e.code === 'budget_exceeded') {
    return new AIError('budget_exceeded', 'The AI budget for content is used up for this month. Ask an administrator to raise it in AI Suite settings.', { cause: e })
  }
  return e
}

/** Value to store in the field: Lexical for rich text, string[] for hasMany text, clamped string otherwise. */
export const valueForField = async (
  payload: Payload,
  collection: string,
  field: TargetFieldInfo,
  output: string,
  data?: unknown,
): Promise<unknown> => {
  if (field.type === 'richText') return markdownToLexical(payload, collection, field.path, output)
  if (field.hasMany) {
    const tags = (data as { tags?: string[] } | undefined)?.tags
    return tags ?? output.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
  }
  return field.maxLength ? clampText(output, field.maxLength) : output
}

export interface RecordInput {
  p: Prepared
  output: string
  data?: unknown
  meta: CallMeta
  bulkRun?: string | number
  docId?: string | number
}

export const recordGeneration = async (payload: Payload, r: RecordInput): Promise<string> => {
  const { p } = r
  const created = await payload.create({
    collection: GENERATIONS as never,
    overrideAccess: true,
    data: {
      targetCollection: p.input.collection,
      targetId: r.docId != null ? String(r.docId) : p.input.docId != null ? String(p.input.docId) : undefined,
      field: p.field.path,
      fieldType: p.field.type,
      locale: p.locale,
      action: p.def.action,
      promptSlug: p.rendered.slug,
      promptVersion: p.rendered.version,
      output: r.output,
      data: r.data ?? null,
      accepted: null,
      model: r.meta.model,
      costMicros: Math.round(r.meta.costMicros ?? 0),
      bulkRun: r.bulkRun ?? undefined,
      requestedBy: p.ctx.actor.user ? String((p.ctx.actor.user as AnyRecord).id) : undefined,
      ...tenantData(payload, p.ctx.tenant),
    } as never,
  })
  return String((created as AnyRecord).id)
}

const wireError = (e: unknown, requestId: string): StreamWireEvent => {
  const err = friendlyError(e)
  return isAIError(err)
    ? { type: 'error', code: err.code, message: err.message, requestId }
    : { type: 'error', code: 'unknown', message: 'Generation failed. Please try again.', requestId }
}

/** SSE stream: text deltas, then `done` whose messageId is the ai-generations id. */
export async function* streamGeneration(p: Prepared, services: CoreServices): AsyncIterable<StreamWireEvent> {
  let text = ''
  try {
    const stream = services.ai.streamText(callOpts(p), p.ctx)
    for await (const ev of stream) {
      if (ev.type === 'text-delta') {
        text += ev.text
        yield { type: 'text', delta: ev.text }
      } else if (ev.type === 'error') {
        throw ev.error
      }
    }
    const meta = await stream.meta
    const id = await recordGeneration(p.ctx.payload, { p, output: finishText(text, p.field), meta })
    yield { type: 'done', messageId: id, outcome: 'generated' }
  } catch (e) {
    yield wireError(e, p.ctx.requestId)
  }
}

