import type { CollectionConfig, Config, Field } from 'payload'
import { getSuiteState, type AICoreOptions } from 'payload-ai-core'
import { BULK_VIEW_PATH, CLIENT } from './constants'
import { appendAfterInput, autoDetectPaths, collectTextFields, mapFieldsAtPaths } from './fields'
import type { AiContentOptions, ContentAction, TargetFieldType } from './types'

type AnyRecord = Record<string, any>

export interface FieldButtonProps {
  collection: string
  field: string
  fieldType: TargetFieldType
  hasMany?: boolean
  actions?: ContentAction[]
  locales?: string[]
}

export interface PanelProps {
  collection: string
  fields: { path: string; type: TargetFieldType; hasMany?: boolean }[]
  categoryField?: string
  locales?: string[]
}

export interface BulkActionProps {
  collection: string
  fields: { path: string; type: TargetFieldType }[]
  locales?: string[]
}

const TEXT_ACTIONS: ContentAction[] = ['write', 'from-photo', 'rewrite', 'shorten', 'tone', 'translate', 'seo', 'faq']
const LONG_ACTIONS: ContentAction[] = ['blog', 'landing']

const localeCodes = (config: Config): string[] | undefined => {
  const l = config.localization
  if (!l || !Array.isArray(l.locales)) return undefined
  return l.locales.map((x) => (typeof x === 'string' ? x : x.code))
}

/** Path of a relationship field pointing at the category collection (top level or in presentational containers). */
const findCategoryField = (fields: Field[], categorySlug: string | undefined, prefix = ''): string | undefined => {
  if (!categorySlug) return undefined
  for (const raw of fields) {
    const f = raw as AnyRecord
    const rel = f.relationTo
    if (f.type === 'relationship' && f.name && (rel === categorySlug || (Array.isArray(rel) && rel.length === 1 && rel[0] === categorySlug))) {
      return prefix ? `${prefix}.${f.name}` : f.name
    }
    const nested =
      f.type === 'row' || f.type === 'collapsible'
        ? findCategoryField(f.fields ?? [], categorySlug, prefix)
        : f.type === 'tabs'
          ? (f.tabs ?? []).map((t: AnyRecord) => findCategoryField(t.fields ?? [], categorySlug, t.name ? (prefix ? `${prefix}.${t.name}` : t.name) : prefix)).find(Boolean)
          : undefined
    if (nested) return nested
  }
  return undefined
}

const hasField = (fields: Field[], name: string) => fields.some((f) => 'name' in f && f.name === name)

/**
 * Config-time wiring: AI buttons on mapped fields (existing admin components kept), photo/spec panel,
 * bulk list action, optional aiTags field and the bulk review admin view.
 * Fills `allowed` with the collections the endpoints may target.
 */
export const extendContentConfig = (config: Config, options: AiContentOptions, allowed: Set<string>): Config => {
  const core = getSuiteState(config)?.options as AICoreOptions | undefined
  let mapped: Partial<Record<string, string[]>> = {}
  try {
    mapped = core?.adapters?.mappedCollections() ?? {}
  } catch {
    mapped = {}
  }
  const offerings = new Set(mapped.offering ?? [])
  const categorySlug = mapped.category?.[0]
  const locales = localeCodes(config)

  const targets = new Map<string, string[]>()
  for (const c of config.collections ?? []) {
    if (offerings.has(c.slug) && options.autoDetectOfferingFields !== false) targets.set(c.slug, autoDetectPaths(c.fields))
  }
  for (const [slug, paths] of Object.entries(options.fields ?? {})) targets.set(slug, paths)

  const collections = (config.collections ?? []).map((coll): CollectionConfig => {
    const paths = targets.get(coll.slug)
    const isOffering = offerings.has(coll.slug)
    if (!paths && !isOffering) return coll
    allowed.add(coll.slug)

    let fields = coll.fields
    if (isOffering && options.aiTagsField && !hasField(fields, 'aiTags')) {
      fields = [
        ...fields,
        {
          name: 'aiTags',
          type: 'text',
          hasMany: true,
          admin: { position: 'sidebar', description: 'AI-suggested tags (review before publishing).' },
        } as Field,
      ]
    }

    const textFields = collectTextFields(fields)
    const wanted = new Set(paths ?? [])
    if (isOffering && options.aiTagsField) wanted.add('aiTags')
    const enabled = textFields.filter((f) => wanted.has(f.path))
    const byPath = new Map(enabled.map((f) => [f.path, f]))

    fields = mapFieldsAtPaths(fields, wanted, (f, path) => {
      const info = byPath.get(path)
      const actions: ContentAction[] =
        path === 'aiTags' ? ['tags'] : info?.type === 'text' ? TEXT_ACTIONS.filter((a) => a !== 'faq') : [...TEXT_ACTIONS, ...LONG_ACTIONS]
      const clientProps: FieldButtonProps = { collection: coll.slug, field: path, fieldType: f.type, hasMany: Boolean(f.hasMany), actions, locales }
      return appendAfterInput(f, { path: `${CLIENT}#AIFieldButton`, clientProps })
    })

    if (isOffering && options.photoPanel !== false && !hasField(fields, 'aiContentPanel')) {
      const panel: PanelProps = { collection: coll.slug, fields: enabled, categoryField: findCategoryField(fields, categorySlug), locales }
      fields = [
        ...fields,
        {
          name: 'aiContentPanel',
          type: 'ui',
          admin: { position: 'sidebar', components: { Field: { path: `${CLIENT}#AIGeneratePanel`, clientProps: panel } } },
        } as Field,
      ]
    }

    let admin = coll.admin
    if (options.bulkAction !== false && enabled.length) {
      const props: BulkActionProps = { collection: coll.slug, fields: enabled.filter((f) => !f.hasMany), locales }
      admin = {
        ...admin,
        components: {
          ...admin?.components,
          beforeListTable: [...(admin?.components?.beforeListTable ?? []), { path: `${CLIENT}#BulkEnrichAction`, clientProps: props }],
        },
      }
    }
    return { ...coll, fields, admin }
  })

  return {
    ...config,
    collections,
    admin: {
      ...config.admin,
      components: {
        ...config.admin?.components,
        views: {
          ...config.admin?.components?.views,
          aiContentBulkReview: { Component: `${CLIENT}#BulkReviewView`, path: BULK_VIEW_PATH as `/${string}` },
        },
      },
    },
  }
}
