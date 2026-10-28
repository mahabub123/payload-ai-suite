/**
 * Config-schema introspection: does a collection exist, does a dot path resolve to a field
 * (descending into groups, tabs, rows, collapsibles, arrays, blocks and across relationships)?
 */
import type { Payload } from 'payload'

/** Loose view of a Payload field config (raw or sanitized). */
export interface FieldLike {
  name?: string
  type: string
  fields?: FieldLike[]
  tabs?: { name?: string; fields: FieldLike[] }[]
  blocks?: ({ slug: string; fields: FieldLike[] } | string)[]
  blockReferences?: ({ slug: string; fields: FieldLike[] } | string)[]
  relationTo?: string | string[]
  collection?: string | string[]
  hasMany?: boolean
  localized?: boolean
  virtual?: boolean | string
}

export interface CollectionLike {
  slug: string
  fields: FieldLike[]
  versions?: { drafts?: unknown } | boolean
  auth?: unknown
  timestamps?: boolean
  upload?: unknown
}

export interface ConfigLike {
  collections: CollectionLike[]
  blocks?: { slug: string; fields: FieldLike[] }[]
  localization?: false | { locales: (string | { code: string })[]; defaultLocale?: string }
  serverURL?: string
}

export const configOf = (payload: Payload): ConfigLike => payload.config as unknown as ConfigLike

export const getCollection = (config: ConfigLike, slug: string | undefined): CollectionLike | undefined =>
  slug ? config.collections?.find((c) => c.slug === slug) : undefined

export const hasDrafts = (c: CollectionLike | undefined): boolean => {
  const v = c?.versions
  return typeof v === 'object' && v !== null && !!v.drafts
}

export const localeInfo = (config: ConfigLike): { locales: string[]; defaultLocale?: string } => {
  const l = config.localization
  if (!l) return { locales: [] }
  return {
    locales: l.locales.map((x) => (typeof x === 'string' ? x : x.code)),
    defaultLocale: l.defaultLocale,
  }
}

const BUILTIN = new Set(['id', 'createdAt', 'updatedAt'])

/** Named fields visible at one data level (unnamed containers are flattened). */
const levelFields = (fields: FieldLike[] | undefined): FieldLike[] => {
  const out: FieldLike[] = []
  for (const f of fields ?? []) {
    if (f.type === 'tabs') {
      for (const t of f.tabs ?? []) {
        if (t.name) out.push({ name: t.name, type: 'group', fields: t.fields })
        else out.push(...levelFields(t.fields))
      }
    } else if (!f.name && f.fields) out.push(...levelFields(f.fields)) // row, collapsible, unnamed group
    else if (f.name) out.push(f)
  }
  return out
}

const blockDefs = (f: FieldLike, config: ConfigLike) =>
  [...(f.blocks ?? []), ...(f.blockReferences ?? [])]
    .map((b) => (typeof b === 'string' ? config.blocks?.find((x) => x.slug === b) : b))
    .filter((b): b is { slug: string; fields: FieldLike[] } => !!b)

/**
 * Resolve a dot path to its field config, or null. Numeric segments index arrays / hasMany values.
 * Relationship / upload / join fields continue into the related collection (single relationTo).
 */
export const resolveFieldPath = (
  config: ConfigLike,
  collection: CollectionLike,
  path: string,
  seen = 0,
): FieldLike | null => {
  const segs = path.split('.')
  let fields: FieldLike[] = collection.fields
  let current: FieldLike | null = null
  let col: CollectionLike | undefined = collection
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]
    if (/^\d+$/.test(seg)) {
      if (!current || !(current.type === 'array' || current.type === 'blocks' || current.hasMany || current.type === 'join'))
        return null
      continue
    }
    if (current && (current.type === 'relationship' || current.type === 'upload' || current.type === 'join')) {
      const target = current.type === 'join' ? current.collection : current.relationTo
      if (current.type === 'join' && seg === 'docs') continue
      if (typeof target !== 'string' || seen > 4) return null
      col = getCollection(config, target)
      if (!col) return null
      return resolveFieldPath(config, col, segs.slice(i).join('.'), seen + 1)
    }
    if (current && current.type === 'blocks') {
      const all: FieldLike[] = blockDefs(current, config).flatMap((b) => levelFields(b.fields))
      const hit: FieldLike | undefined = all.find((f) => f.name === seg)
      if (!hit) return null
      current = hit
      fields = hit.fields ?? []
      continue
    }
    const level = levelFields(fields)
    const hit = level.find((f) => f.name === seg)
    if (!hit) {
      if (i === 0 || current?.type === 'join') {
        if (BUILTIN.has(seg)) return { name: seg, type: seg === 'id' ? 'text' : 'date' }
        if (seg === '_status' && hasDrafts(col)) return { name: '_status', type: 'select' }
        if (seg === 'email' && col?.auth) return { name: 'email', type: 'email' }
        if ((seg === 'url' || seg === 'filename') && col?.upload) return { name: seg, type: 'text' }
      }
      return null
    }
    current = hit
    fields = hit.fields ?? []
  }
  return current
}

export const hasFieldPath = (config: ConfigLike, collection: CollectionLike, path: string): boolean =>
  !!resolveFieldPath(config, collection, path)

/** Dot paths of every field of the given types, through named groups/tabs (not into arrays or blocks). */
export const fieldPathsByType = (collection: CollectionLike, types: string[]): string[] => {
  const out: string[] = []
  const walk = (fields: FieldLike[] | undefined, prefix: string) => {
    for (const f of levelFields(fields)) {
      const path = `${prefix}${f.name}`
      if (types.includes(f.type)) out.push(path)
      else if (f.type === 'group' && f.fields) walk(f.fields, `${path}.`)
    }
  }
  walk(collection.fields, '')
  return out
}
