import type { Field, FlattenedField, Payload } from 'payload'
import type { TargetFieldInfo, TargetFieldType } from './types'

const TARGET_TYPES: ReadonlySet<string> = new Set(['text', 'textarea', 'richText'])
/** Never offered automatically: identifiers, not copy. */
const SKIP_NAMES = /^(slug|sku|id|handle|barcode|gtin|ean|upc|mpn|code|url|path|_status|aiTags)$/i

type AnyField = Record<string, any>

export const humanize = (name: string): string =>
  name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())

const labelOf = (f: AnyField): string => {
  const l = f.label
  if (typeof l === 'string') return l
  if (l && typeof l === 'object') return String(l.en ?? Object.values(l)[0] ?? humanize(f.name))
  return humanize(String(f.name ?? ''))
}

const join = (prefix: string, name: string) => (prefix ? `${prefix}.${name}` : name)

/** Config-time: every text/textarea/richText field path (inside rows, collapsibles, tabs and groups; not arrays/blocks). */
export const collectTextFields = (fields: Field[], prefix = ''): { path: string; type: TargetFieldType; hasMany?: boolean }[] => {
  const out: { path: string; type: TargetFieldType; hasMany?: boolean }[] = []
  for (const raw of fields) {
    const f = raw as AnyField
    if (TARGET_TYPES.has(f.type) && f.name) {
      out.push({ path: join(prefix, f.name), type: f.type, hasMany: Boolean(f.hasMany) })
    } else if (f.type === 'row' || f.type === 'collapsible') {
      out.push(...collectTextFields(f.fields ?? [], prefix))
    } else if (f.type === 'group') {
      out.push(...collectTextFields(f.fields ?? [], f.name ? join(prefix, f.name) : prefix))
    } else if (f.type === 'tabs') {
      for (const tab of f.tabs ?? []) out.push(...collectTextFields(tab.fields ?? [], tab.name ? join(prefix, tab.name) : prefix))
    }
  }
  return out
}

/** Paths offered by default: copy fields that are visible, editable and not identifiers. */
export const autoDetectPaths = (fields: Field[]): string[] => {
  const byPath = new Map<string, AnyField>()
  const walk = (fs: Field[], prefix: string) => {
    for (const raw of fs) {
      const f = raw as AnyField
      if (TARGET_TYPES.has(f.type) && f.name) byPath.set(join(prefix, f.name), f)
      else if (f.type === 'row' || f.type === 'collapsible') walk(f.fields ?? [], prefix)
      else if (f.type === 'group') walk(f.fields ?? [], f.name ? join(prefix, f.name) : prefix)
      else if (f.type === 'tabs') for (const tab of f.tabs ?? []) walk(tab.fields ?? [], tab.name ? join(prefix, tab.name) : prefix)
    }
  }
  walk(fields, '')
  return [...byPath.entries()]
    .filter(([path, f]) => !SKIP_NAMES.test(path.split('.').pop()!) && !f.hidden && !f.admin?.hidden && !f.admin?.readOnly && !f.hasMany)
    .map(([path]) => path)
}

/**
 * Config-time: return a copy of `fields` where every field whose path is in `paths` gets `decorate(field, path)`.
 * Untouched fields are returned by reference.
 */
export const mapFieldsAtPaths = (
  fields: Field[],
  paths: ReadonlySet<string>,
  decorate: (field: AnyField, path: string) => AnyField,
  prefix = '',
): Field[] =>
  fields.map((raw) => {
    const f = raw as AnyField
    if (TARGET_TYPES.has(f.type) && f.name) {
      const p = join(prefix, f.name)
      return (paths.has(p) ? decorate(f, p) : f) as Field
    }
    if (f.type === 'row' || f.type === 'collapsible') return { ...f, fields: mapFieldsAtPaths(f.fields ?? [], paths, decorate, prefix) } as Field
    if (f.type === 'group') {
      return { ...f, fields: mapFieldsAtPaths(f.fields ?? [], paths, decorate, f.name ? join(prefix, f.name) : prefix) } as Field
    }
    if (f.type === 'tabs') {
      return {
        ...f,
        tabs: (f.tabs ?? []).map((tab: AnyField) => ({
          ...tab,
          fields: mapFieldsAtPaths(tab.fields ?? [], paths, decorate, tab.name ? join(prefix, tab.name) : prefix),
        })),
      } as Field
    }
    return raw
  })

/** Append a component to `admin.components.afterInput`, keeping existing components. */
export const appendAfterInput = (field: AnyField, component: unknown): AnyField => ({
  ...field,
  admin: {
    ...field.admin,
    components: {
      ...field.admin?.components,
      afterInput: [...(field.admin?.components?.afterInput ?? []), component],
    },
  },
})

/* ---------- runtime (sanitized config) ---------- */

export const findFlattenedField = (fields: FlattenedField[] | undefined, path: string): AnyField | undefined => {
  const parts = path.split('.')
  let current: AnyField[] | undefined = fields as AnyField[] | undefined
  let found: AnyField | undefined
  for (let i = 0; i < parts.length; i++) {
    found = current?.find((f) => f.name === parts[i])
    if (!found) return undefined
    if (i < parts.length - 1) current = found.flattenedFields ?? found.fields
  }
  return found
}

export const getFieldInfo = (payload: Payload, collection: string, path: string): TargetFieldInfo | undefined => {
  const coll = payload.collections?.[collection as keyof typeof payload.collections]
  const f = findFlattenedField(coll?.config?.flattenedFields, path)
  if (!f || !TARGET_TYPES.has(f.type)) return undefined
  return {
    path,
    type: f.type as TargetFieldType,
    hasMany: Boolean(f.hasMany),
    maxLength: typeof f.maxLength === 'number' ? f.maxLength : undefined,
    label: labelOf(f),
    localized: Boolean(f.localized),
  }
}

export const getRichTextField = (payload: Payload, collection: string, path: string): AnyField | undefined => {
  const coll = payload.collections?.[collection as keyof typeof payload.collections]
  const f = findFlattenedField(coll?.config?.flattenedFields, path)
  return f?.type === 'richText' ? f : undefined
}

export const collectionHasDrafts = (payload: Payload, collection: string): boolean => {
  const coll = payload.collections?.[collection as keyof typeof payload.collections]
  const versions = coll?.config?.versions as AnyField | undefined
  return Boolean(versions && versions.drafts)
}

/* ---------- value helpers ---------- */

export const getPath = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as AnyField)[k] : undefined), obj)

export const setPath = (obj: AnyField, path: string, value: unknown): AnyField => {
  const parts = path.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {}
    cur = cur[parts[i]]
  }
  cur[parts[parts.length - 1]] = value
  return obj
}

/** Flatten Lexical JSON (or anything) into plain text for prompts. */
export const toPlainText = (value: unknown): string => {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(toPlainText).filter(Boolean).join(', ')
  const v = value as AnyField
  if (v.root && typeof v.root === 'object') return lexicalText(v.root).trim()
  return ''
}

const BLOCK_TYPES = new Set(['paragraph', 'heading', 'listitem', 'quote', 'list'])

const lexicalText = (node: AnyField): string => {
  if (node.type === 'text') return String(node.text ?? '')
  if (node.type === 'linebreak') return '\n'
  const inner = Array.isArray(node.children) ? node.children.map(lexicalText).join('') : ''
  return BLOCK_TYPES.has(node.type) && node.type !== 'list' ? `${inner}\n` : inner
}
