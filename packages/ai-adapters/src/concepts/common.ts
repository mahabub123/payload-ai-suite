import type { AdapterContext, Money } from 'payload-ai-core'
import type { ReadOptions, Doc } from '../mapping/values'
import { getPath, relDoc, toMinor, toStr } from '../mapping/values'
import type { ResolveEnv, ResolvedTarget } from '../resolve'

export const readOpts = (env: ResolveEnv, ctx?: AdapterContext): ReadOptions => ({
  locales: env.locales,
  locale: ctx?.locale,
  defaultLocale: env.defaultLocale,
})

/** Reader bound to a target's field map. */
export const reader = (env: ResolveEnv, t: ResolvedTarget, ctx?: AdapterContext) => {
  const ro = readOpts(env, ctx)
  return (doc: unknown, key: string): unknown => (t.fields[key] ? getPath(doc, t.fields[key], ro) : undefined)
}

export interface PriceSpec {
  currency: string
  unit: 'minor' | 'major'
  decimals: number
}

export const money = (v: unknown, spec: PriceSpec, currency?: unknown): Money | undefined => {
  const amount = toMinor(v, spec.unit, spec.decimals)
  return amount === undefined ? undefined : { amount, currency: toStr(currency) || spec.currency }
}

/** A human label for a populated relationship doc (title / name / label / email). */
export const labelOf = (v: unknown): string | undefined => {
  if (typeof v === 'string' || typeof v === 'number') return String(v)
  const d = relDoc(v)
  if (!d) return undefined
  return toStr(d.title ?? d.name ?? d.label ?? d.value ?? d.email)
}

export const since = (field: string, d?: Date) => (d ? { [field]: { greater_than: d.toISOString() } } : undefined)

export const clampLimit = (n: number | undefined, def: number, max = 100) =>
  Math.max(1, Math.min(max, Math.floor(n ?? def)))

/** Swallow Payload NotFound/Forbidden/validation errors on reads that should resolve to null. */
export const orNull = async <T>(p: Promise<T>): Promise<T | null> => {
  try {
    return await p
  } catch (e) {
    const status = (e as { status?: number }).status
    const name = (e as { name?: string }).name
    if (status === 404 || status === 403 || status === 400 || name === 'NotFound' || name === 'Forbidden' || name === 'ValidationError')
      return null
    throw e
  }
}

export type { Doc }
