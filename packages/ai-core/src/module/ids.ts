import type { CollectionBeforeValidateHook, CollectionConfig, Field, Payload } from 'payload'

/**
 * The suite passes document ids around as strings (wire format, tool inputs, adapter results), but on SQL
 * adapters a relationship to a collection with numeric ids rejects "22". These helpers turn digit strings
 * back into numbers for relationship/upload fields whose target collection uses numeric ids.
 */

type Loose = Record<string, unknown>

interface IdTypeSource {
  collections?: Record<string, { customIDType?: 'number' | 'text'; config?: { fields?: Field[] } } | undefined>
  db?: { defaultIDType?: 'number' | 'text' }
}

const isNumericTarget = (payload: IdTypeSource, slug: string): boolean => {
  const c = payload.collections?.[slug]
  if (!c) return false
  return (c.customIDType ?? payload.db?.defaultIDType) === 'number'
}

const toId = (payload: IdTypeSource, slug: string, v: unknown): unknown =>
  typeof v === 'string' && /^\d{1,15}$/.test(v) && isNumericTarget(payload, slug) ? Number(v) : v

const relValue = (payload: IdTypeSource, relationTo: string | string[], v: unknown): unknown => {
  if (v == null) return v
  if (Array.isArray(relationTo)) {
    // Polymorphic: { relationTo, value }
    if (typeof v === 'object' && 'relationTo' in (v as Loose)) {
      const r = v as Loose
      return { ...r, value: toId(payload, String(r.relationTo), r.value) }
    }
    return v
  }
  return toId(payload, relationTo, v)
}

const walk = (payload: IdTypeSource, fields: Field[], data: Loose): Loose => {
  let out = data
  const set = (k: string, v: unknown) => {
    if (out === data) out = { ...data }
    out[k] = v
  }
  for (const f of fields) {
    if (!('name' in f) || !f.name) {
      // row, collapsible: fields live on the parent; unnamed tabs likewise.
      if ('fields' in f && Array.isArray(f.fields)) out = walk(payload, f.fields, out)
      if (f.type === 'tabs') for (const tab of f.tabs) {
        if ('name' in tab && tab.name) {
          const v = out[tab.name]
          if (v && typeof v === 'object' && !Array.isArray(v)) set(tab.name, walk(payload, tab.fields, v as Loose))
        } else out = walk(payload, tab.fields, out)
      }
      continue
    }
    const v = out[f.name]
    if (v == null) continue
    if (f.type === 'relationship' || f.type === 'upload') {
      const next = Array.isArray(v) ? v.map((x) => relValue(payload, f.relationTo as string | string[], x)) : relValue(payload, f.relationTo as string | string[], v)
      if (JSON.stringify(next) !== JSON.stringify(v)) set(f.name, next)
    } else if ((f.type === 'array' || f.type === 'group') && 'fields' in f) {
      if (f.type === 'array' && Array.isArray(v)) set(f.name, v.map((row) => (row && typeof row === 'object' ? walk(payload, f.fields, row as Loose) : row)))
      else if (f.type === 'group' && typeof v === 'object' && !Array.isArray(v)) set(f.name, walk(payload, f.fields, v as Loose))
    } else if (f.type === 'blocks' && Array.isArray(v)) {
      set(
        f.name,
        v.map((row) => {
          const block = row && typeof row === 'object' ? f.blocks.find((b) => b.slug === (row as Loose).blockType) : undefined
          return block ? walk(payload, block.fields, row as Loose) : row
        }),
      )
    }
  }
  return out
}

/** Copy of `data` with string ids in relationship/upload fields of `collection` converted to the target's id type. */
export const coerceRelationIds = <T extends Loose>(payload: Payload | IdTypeSource, collection: string, data: T): T => {
  const p = payload as IdTypeSource
  const fields = p.collections?.[collection]?.config?.fields
  return fields && data && typeof data === 'object' ? (walk(p, fields, data) as T) : data
}

/** beforeValidate hook form, added to every suite-owned collection. */
export const coerceRelationIdsHook: CollectionBeforeValidateHook = ({ data, req, collection }) =>
  data && req?.payload ? coerceRelationIds(req.payload, collection.slug, data) : data

/** Adds the hook once, keeping existing beforeValidate hooks. */
export const withRelationIdCoercion = (c: CollectionConfig): CollectionConfig =>
  c.hooks?.beforeValidate?.includes(coerceRelationIdsHook)
    ? c
    : { ...c, hooks: { ...c.hooks, beforeValidate: [coerceRelationIdsHook, ...(c.hooks?.beforeValidate ?? [])] } }
