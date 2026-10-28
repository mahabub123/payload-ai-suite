import { z } from 'zod'
import type { Where } from 'payload'
import { getPath } from './local'

/** Operators the copilot may use. Anything else is rejected by the schema. */
export const FILTER_OPERATORS = [
  'equals',
  'not_equals',
  'in',
  'not_in',
  'greater_than',
  'greater_than_equal',
  'less_than',
  'less_than_equal',
  'like',
  'contains',
  'exists',
] as const
export type FilterOperator = (typeof FILTER_OPERATORS)[number]

type Scalar = string | number | boolean | null
export type StructuredFilter =
  | { field: string; op: FilterOperator; value?: Scalar | Scalar[] }
  | { and: StructuredFilter[] }
  | { or: StructuredFilter[] }

const scalar = z.union([z.string().max(500), z.number(), z.boolean(), z.null()])
const fieldName = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]+){0,3}$/, 'Invalid field path')
  .refine((f) => !/(^|\.)(password|salt|hash|resetPasswordToken|apiKey)$/.test(f), 'Field not allowed')

export const filterSchema: z.ZodType<StructuredFilter> = z.lazy(() =>
  z.union([
    z.strictObject({ field: fieldName, op: z.enum(FILTER_OPERATORS), value: z.union([scalar, z.array(scalar).max(100)]).optional() }),
    z.strictObject({ and: z.array(filterSchema).min(1).max(20) }),
    z.strictObject({ or: z.array(filterSchema).min(1).max(20) }),
  ]),
)

const depth = (f: StructuredFilter): number =>
  'and' in f ? 1 + Math.max(...f.and.map(depth)) : 'or' in f ? 1 + Math.max(...f.or.map(depth)) : 0

/** Parse untrusted input into a structured filter; throws on unknown operators/keys or nesting > 4. */
export const parseFilter = (input: unknown): StructuredFilter => {
  const f = filterSchema.parse(input)
  if (depth(f) > 4) throw new Error('Filter nested too deeply')
  return f
}

/** Structured filter -> Payload `where`. */
export const toWhere = (f: StructuredFilter | undefined): Where => {
  if (!f) return {}
  if ('and' in f) return { and: f.and.map(toWhere) }
  if ('or' in f) return { or: f.or.map(toWhere) }
  return { [f.field]: { [f.op]: (f.value ?? (f.op === 'exists' ? true : null)) as never } }
}

const cmp = (a: unknown, b: unknown) => {
  const na = typeof a === 'string' && !Number.isNaN(Date.parse(a)) && typeof b === 'string' ? Date.parse(a) : a
  const nb = typeof b === 'string' && !Number.isNaN(Date.parse(b)) && typeof a === 'string' ? Date.parse(b) : b
  return [na as number, nb as number] as const
}

/** Evaluate a structured filter against an in-memory object (automation trigger conditions, action `when`). */
export const matchFilter = (f: StructuredFilter | undefined | null, obj: unknown): boolean => {
  if (!f) return true
  if ('and' in f) return f.and.every((x) => matchFilter(x, obj))
  if ('or' in f) return f.or.some((x) => matchFilter(x, obj))
  const raw = getPath(obj, f.field)
  const v = raw && typeof raw === 'object' && 'id' in (raw as object) ? (raw as { id: unknown }).id : raw
  const val = f.value
  const eq = (a: unknown, b: unknown) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase()
  switch (f.op) {
    case 'equals':
      return Array.isArray(v) ? v.some((x) => eq(x, val)) : eq(v, val)
    case 'not_equals':
      return !eq(v, val)
    case 'in':
      return Array.isArray(val) && val.some((x) => eq(v, x))
    case 'not_in':
      return !(Array.isArray(val) && val.some((x) => eq(v, x)))
    case 'greater_than': {
      const [a, b] = cmp(v, val)
      return v != null && a > b
    }
    case 'greater_than_equal': {
      const [a, b] = cmp(v, val)
      return v != null && a >= b
    }
    case 'less_than': {
      const [a, b] = cmp(v, val)
      return v != null && a < b
    }
    case 'less_than_equal': {
      const [a, b] = cmp(v, val)
      return v != null && a <= b
    }
    case 'like':
    case 'contains':
      return Array.isArray(v) ? v.some((x) => eq(x, val)) : String(v ?? '').toLowerCase().includes(String(val ?? '').toLowerCase())
    case 'exists':
      return (val === false) === (v == null || v === '')
  }
}
