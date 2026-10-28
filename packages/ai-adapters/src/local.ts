/**
 * Thin Local API wrapper that applies the adapter rules in one place:
 * caller access (overrideAccess:false + req/user) unless ctx.system, tenant scoping, published filtering, locale.
 */
import type { AdapterContext } from 'payload-ai-core'
import { coerceRelationIds } from 'payload-ai-core'
import type { Where } from 'payload'
import type { Doc } from './mapping/values'
import { getPath, relId } from './mapping/values'

export interface FindResult {
  docs: Doc[]
  totalDocs: number
  hasNextPage?: boolean
  page?: number
}

/** The subset of the Payload Local API the adapters use (untyped by collection). */
export interface LooseLocalAPI {
  find(args: Record<string, unknown>): Promise<FindResult>
  findByID(args: Record<string, unknown>): Promise<Doc | null>
  create(args: Record<string, unknown>): Promise<Doc>
  update(args: Record<string, unknown>): Promise<Doc>
}

export const api = (ctx: AdapterContext): LooseLocalAPI => ctx.payload as unknown as LooseLocalAPI

/** Access arguments for every Local API call. */
export const accessArgs = (ctx: AdapterContext, opts: { forceCaller?: boolean } = {}): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  if (ctx.req) out.req = ctx.req
  if (ctx.locale) out.locale = ctx.locale
  if (ctx.system && !opts.forceCaller) {
    out.overrideAccess = true
  } else {
    out.overrideAccess = false
    out.user = ctx.user ?? ctx.req?.user ?? null
  }
  return out
}

export interface PublishedRule {
  field: string
  equals: string | number | boolean
}

/** Resolved, schema-checked info about one mapped collection. */
export interface Target {
  collection: string
  /** Tenant field, only when it exists on the collection. */
  tenantField?: string
  published?: PublishedRule
  where?: Where
}

export const and = (...parts: (Where | undefined | null | false)[]): Where | undefined => {
  const list = parts.filter((p): p is Where => !!p && Object.keys(p).length > 0)
  if (list.length === 0) return undefined
  if (list.length === 1) return list[0]
  return { and: list }
}

export const tenantWhere = (t: Target, ctx: AdapterContext): Where | undefined =>
  ctx.tenant != null && t.tenantField ? { [t.tenantField]: { equals: ctx.tenant } } : undefined

export const publishedWhere = (t: Target): Where | undefined =>
  t.published ? { [t.published.field]: { equals: t.published.equals } } : undefined

export const isPublishedDoc = (t: Target, doc: Doc): boolean =>
  !t.published || getPath(doc, t.published.field) === t.published.equals

export const inTenant = (t: Target, doc: Doc, ctx: AdapterContext): boolean =>
  ctx.tenant == null || !t.tenantField || relId(getPath(doc, t.tenantField)) === String(ctx.tenant)

export interface FindOpts {
  where?: Where
  limit?: number
  page?: number
  sort?: string
  depth?: number
  /** Restrict to published docs (shopper-facing). */
  publishedOnly?: boolean
  forceCaller?: boolean
  /** Extra Local API args (e.g. `context`). */
  extra?: Record<string, unknown>
}

export const find = (t: Target, ctx: AdapterContext, o: FindOpts = {}): Promise<FindResult> =>
  api(ctx).find({
    collection: t.collection,
    where: and(t.where, tenantWhere(t, ctx), o.publishedOnly ? publishedWhere(t) : undefined, o.where) ?? {},
    limit: o.limit ?? 10,
    page: o.page ?? 1,
    ...(o.sort ? { sort: o.sort } : {}),
    depth: o.depth ?? 1,
    draft: false,
    ...accessArgs(ctx, { forceCaller: o.forceCaller }),
    ...o.extra,
  })

/** Single doc by id through `find`, so tenant/published/extra filters apply. */
export const findOne = async (
  t: Target,
  id: string,
  ctx: AdapterContext,
  o: Omit<FindOpts, 'limit' | 'page'> = {},
): Promise<Doc | null> => {
  const res = await find(t, ctx, { ...o, where: and({ id: { equals: id } }, o.where), limit: 1 })
  return res.docs[0] ?? null
}

/** Page through every matching doc. */
export async function* iterateDocs(t: Target, ctx: AdapterContext, o: FindOpts & { batchSize?: number } = {}): AsyncIterable<Doc> {
  const limit = o.batchSize ?? 100
  let page = 1
  for (;;) {
    const res = await find(t, ctx, { ...o, limit, page, sort: o.sort ?? 'createdAt' })
    for (const d of res.docs) yield d
    if (!res.hasNextPage || res.docs.length === 0) return
    page++
  }
}

export const create = (t: Target, data: Doc, ctx: AdapterContext, o: { asSystem?: boolean; depth?: number } = {}) => {
  const a = accessArgs(o.asSystem ? { ...ctx, system: true } : ctx)
  const withTenant = ctx.tenant != null && t.tenantField && data[t.tenantField] == null ? { ...data, [t.tenantField]: ctx.tenant } : data
  return api(ctx).create({ collection: t.collection, data: coerceRelationIds(ctx.payload, t.collection, withTenant), depth: o.depth ?? 0, ...a })
}

export const update = (
  t: Target,
  id: string,
  data: Doc,
  ctx: AdapterContext,
  o: { depth?: number; extra?: Record<string, unknown> } = {},
) => api(ctx).update({ collection: t.collection, id, data: coerceRelationIds(ctx.payload, t.collection, data), depth: o.depth ?? 0, ...accessArgs(ctx), ...o.extra })

/** Owner identity of the caller: verified customer id, else the logged-in user id. */
export const ownerId = (ctx: AdapterContext): string | undefined =>
  ctx.customerId ?? (ctx.user ? relId(ctx.user) : undefined)
