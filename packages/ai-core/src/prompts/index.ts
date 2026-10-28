/**
 * Prompt library (design doc §7.3): code defaults (version 0) + versioned DB rows in `ai-prompts`.
 * One active row per slug+locale; locale fallback; shared brand-voice block.
 */
import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, CollectionConfig, Payload } from 'payload'
import type { AIContext, CoreServices, PromptLibrary, PromptTemplate, RenderedPrompt, TaskClass } from '../contracts'
import { AIError, TASK_CLASSES } from '../contracts'
import { access, rolesOf } from '../access'
import { getAI, hasAI } from '../module/runtime'

export const PROMPTS_SLUG = 'ai-prompts'

const lookup = (vars: Record<string, unknown>, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), vars)

const stringify = (v: unknown) => (v == null ? '' : typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v))

/** Mustache-style rendering: `{{a.b}}`, `{{{raw}}}` (same output; no HTML escaping is applied). Missing → ''. */
export const renderTemplate = (tpl: string, vars: Record<string, unknown>): string =>
  tpl
    .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, k: string) => stringify(lookup(vars, k)))
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => stringify(lookup(vars, k)))

/** Locale candidates in fallback order: exact → base language → '*' → 'en'. */
export const localeChain = (locale?: string): string[] => {
  const out: string[] = []
  const push = (l?: string) => l && !out.includes(l) && out.push(l)
  push(locale)
  push(locale?.split(/[-_]/)[0])
  push('*')
  push('en')
  return out
}

export const brandVoiceBlock = (voice: string): string => `\n\nBrand voice (follow for tone and wording):\n${voice.trim()}`

interface DbPrompt {
  id: string | number
  slug: string
  task: TaskClass
  locale?: string
  system: string
  user?: string | null
  version?: number
  status: string
}

/* Library instances register here so the collection hook can invalidate their caches. */
const libraries = new Set<{ invalidate(): void }>()
export const invalidatePromptCaches = (): void => libraries.forEach((l) => l.invalidate())

const CACHE_MS = 30_000

export const createPromptLibrary = (svc: () => CoreServices): PromptLibrary & { invalidate(): void } => {
  const defaults = new Map<string, PromptTemplate & { module: string }>()
  const cache = new Map<string, { at: number; row: DbPrompt | null }>()
  const key = (slug: string, locale?: string) => `${slug}::${locale ?? '*'}`

  const findActive = async (payload: Payload, slug: string, locale: string, tenant?: string | number): Promise<DbPrompt | null> => {
    const k = `${tenant ?? ''}|${key(slug, locale)}`
    const hit = cache.get(k)
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.row
    let row: DbPrompt | null = null
    try {
      const res = await payload.find({
        collection: PROMPTS_SLUG as never,
        where: { and: [{ slug: { equals: slug } }, { locale: { equals: locale } }, { status: { equals: 'active' } }] },
        limit: 1,
        sort: '-version',
        overrideAccess: true,
        depth: 0,
      })
      row = (res.docs[0] as unknown as DbPrompt) ?? null
    } catch {
      row = null // collection missing (tests / misconfigured) → code defaults
    }
    cache.set(k, { at: Date.now(), row })
    return row
  }

  const lib: PromptLibrary & { invalidate(): void } = {
    registerDefault(t, module) {
      defaults.set(key(t.slug, t.locale ?? '*'), { ...t, module })
    },
    list: () => [...defaults.values()],
    invalidate: () => cache.clear(),
    async render(slug, vars, ctx: Pick<AIContext, 'payload' | 'locale' | 'tenant'>): Promise<RenderedPrompt> {
      const chain = localeChain(ctx.locale)
      let source: { system: string; user?: string | null; task: TaskClass; version: number; brandVoice?: boolean } | undefined
      for (const loc of chain) {
        const row = await findActive(ctx.payload, slug, loc, ctx.tenant)
        if (row) {
          const def = [...defaults.values()].find((d) => d.slug === slug)
          source = { system: row.system, user: row.user, task: row.task, version: row.version ?? 1, brandVoice: def?.brandVoice }
          break
        }
      }
      if (!source) {
        for (const loc of chain) {
          const d = defaults.get(key(slug, loc))
          if (d) {
            source = { ...d, version: 0 }
            break
          }
        }
      }
      if (!source) {
        const any = [...defaults.values()].find((d) => d.slug === slug)
        if (any) source = { ...any, version: 0 }
      }
      if (!source) throw new AIError('not_found', `Prompt "${slug}" is not registered`)

      let system = renderTemplate(source.system, vars)
      if (source.brandVoice !== false) {
        try {
          const settings = await svc().settings(ctx.payload, ctx.tenant)
          if (settings.brandVoice?.trim()) system += brandVoiceBlock(settings.brandVoice)
        } catch {
          // settings unavailable → render without brand voice
        }
      }
      return { slug, version: source.version, task: source.task, system, user: source.user ? renderTemplate(source.user, vars) : undefined }
    },
  }
  libraries.add(lib)
  return lib
}

/* ---------- collection ---------- */

const assignVersion: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create' || !data?.slug) return data
  const res = await req.payload.find({
    collection: PROMPTS_SLUG as never,
    where: { and: [{ slug: { equals: data.slug } }, { locale: { equals: data.locale ?? '*' } }] },
    sort: '-version',
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const last = (res.docs[0] as unknown as DbPrompt | undefined)?.version ?? 0
  return { ...data, locale: data.locale ?? '*', version: last + 1 }
}

const SKIP_FLAG = 'aiPromptsArchiving'

export const onPromptActivated: CollectionAfterChangeHook = async ({ doc, previousDoc, req, context }) => {
  invalidatePromptCaches()
  if (context?.[SKIP_FLAG] || doc.status !== 'active' || previousDoc?.status === 'active') return doc
  const others = await req.payload.find({
    collection: PROMPTS_SLUG as never,
    where: {
      and: [
        { slug: { equals: doc.slug } },
        { locale: { equals: doc.locale ?? '*' } },
        { status: { equals: 'active' } },
        { id: { not_equals: doc.id } },
      ],
    },
    limit: 100,
    depth: 0,
    overrideAccess: true,
    req,
  })
  for (const o of others.docs as unknown as DbPrompt[]) {
    await req.payload.update({
      collection: PROMPTS_SLUG as never,
      id: o.id,
      data: { status: 'archived' } as never,
      overrideAccess: true,
      req,
      context: { [SKIP_FLAG]: true },
    })
  }
  if (hasAI(req.payload)) {
    const ai = getAI(req.payload)
    const roles = rolesOf(req.user, req)
    await ai.audit.log(
      {
        action: 'prompt.activate',
        target: { collection: PROMPTS_SLUG, id: doc.id },
        before: { archived: (others.docs as unknown as DbPrompt[]).map((o) => ({ id: o.id, version: o.version })) },
        after: { slug: doc.slug, locale: doc.locale, version: doc.version },
      },
      {
        payload: req.payload,
        requestId: (req.headers?.get?.('x-request-id') as string | null) ?? 'admin',
        actor: { kind: req.user ? 'staff' : 'system', user: req.user ?? null, roles },
        tenant: undefined,
      },
    )
  }
  return doc
}

export const aiPromptsCollection: CollectionConfig = {
  slug: PROMPTS_SLUG,
  labels: { singular: 'AI Prompt', plural: 'AI Prompts' },
  admin: {
    group: 'AI Suite',
    useAsTitle: 'slug',
    defaultColumns: ['slug', 'locale', 'version', 'status', 'task', 'updatedAt'],
  },
  access: { read: access.admin, create: access.admin, update: access.admin, delete: access.superAdmin },
  hooks: { beforeChange: [assignVersion], afterChange: [onPromptActivated] },
  fields: [
    { name: 'slug', type: 'text', required: true, index: true },
    { name: 'task', type: 'select', required: true, options: [...TASK_CLASSES], defaultValue: 'chat' },
    { name: 'locale', type: 'text', defaultValue: '*', index: true, admin: { description: "Locale code, or '*' for any." } },
    { name: 'description', type: 'text' },
    { name: 'system', type: 'textarea', required: true, admin: { description: 'Mustache {{variables}} allowed.' } },
    { name: 'user', type: 'textarea' },
    { name: 'outputSchema', type: 'json' },
    { name: 'modelClass', type: 'select', options: [...TASK_CLASSES] },
    { name: 'version', type: 'number', admin: { readOnly: true, position: 'sidebar' } },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: ['draft', 'active', 'archived'],
      index: true,
      admin: { position: 'sidebar', description: 'Activating archives the previous active version for this slug + locale.' },
    },
  ],
}
