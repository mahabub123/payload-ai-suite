/**
 * Minimal in-memory stand-in for the Payload Local API (create/find/findByID/update/delete/count,
 * jobs.queue recorder). Enough for unit tests of services that persist through Payload.
 */
import type { CollectionConfig, Payload } from 'payload'

type Doc = Record<string, any> & { id: string | number }
type WhereClause = Record<string, any>

const get = (o: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((v, k) => (v == null ? undefined : (v as Record<string, unknown>)[k]), o)

const norm = (v: unknown) => (v != null && typeof v === 'object' && 'id' in (v as object) ? (v as Doc).id : v)

const cmp = (a: unknown, b: unknown) => {
  const x = a instanceof Date ? a.getTime() : typeof a === 'string' && !isNaN(Date.parse(a)) && typeof b === 'string' ? Date.parse(a) : a
  const y = b instanceof Date ? b.getTime() : typeof b === 'string' && !isNaN(Date.parse(b)) && typeof a === 'string' ? Date.parse(b) : b
  return (x as number) < (y as number) ? -1 : (x as number) > (y as number) ? 1 : 0
}

export const matchesWhere = (doc: Doc, where?: WhereClause): boolean => {
  if (!where) return true
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'and') return (cond as WhereClause[]).every((w) => matchesWhere(doc, w))
    if (key === 'or') return (cond as WhereClause[]).some((w) => matchesWhere(doc, w))
    const raw = get(doc, key)
    const val = Array.isArray(raw) ? raw.map(norm) : norm(raw)
    return Object.entries(cond as Record<string, unknown>).every(([op, expected]) => {
      const e = norm(expected)
      switch (op) {
        case 'equals':
          return Array.isArray(val) ? val.some((v) => String(v) === String(e)) : String(val) === String(e) || val === e
        case 'not_equals':
          return String(val) !== String(e)
        case 'in':
          return (expected as unknown[]).map(String).includes(String(val))
        case 'not_in':
          return !(expected as unknown[]).map(String).includes(String(val))
        case 'exists':
          return expected ? val != null : val == null
        case 'less_than':
          return val != null && cmp(val, e) < 0
        case 'less_than_equal':
          return val != null && cmp(val, e) <= 0
        case 'greater_than':
          return val != null && cmp(val, e) > 0
        case 'greater_than_equal':
          return val != null && cmp(val, e) >= 0
        case 'like':
        case 'contains':
          return String(val ?? '').toLowerCase().includes(String(e).toLowerCase())
        default:
          return false
      }
    })
  })
}

export interface FakePayload extends Payload {
  store: Map<string, Map<string, Doc>>
  queued: { task: string; input: unknown; queue?: string }[]
}

export const createFakePayload = (
  opts: { collections?: CollectionConfig[]; custom?: Record<string, unknown>; globals?: Record<string, unknown> } = {},
): FakePayload => {
  const store = new Map<string, Map<string, Doc>>()
  const queued: FakePayload['queued'] = []
  const globals = new Map<string, unknown>(Object.entries(opts.globals ?? {}))
  let seq = 0
  const table = (slug: string) => {
    if (!store.has(slug)) store.set(slug, new Map())
    return store.get(slug)!
  }
  const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))
  const sortDocs = (docs: Doc[], sort?: string | string[]) => {
    const s = Array.isArray(sort) ? sort[0] : sort
    if (!s) return docs
    const desc = s.startsWith('-')
    const key = desc ? s.slice(1) : s
    return [...docs].sort((a, b) => cmp(get(a, key), get(b, key)) * (desc ? -1 : 1))
  }
  const collectionsBySlug: Record<string, { config: CollectionConfig }> = {}
  for (const c of opts.collections ?? []) collectionsBySlug[c.slug] = { config: c }

  const api = {
    store,
    queued,
    config: { collections: opts.collections ?? [], custom: opts.custom ?? {}, globals: [] },
    collections: collectionsBySlug,
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
    db: {},
    async create({ collection, data }: { collection: string; data: Record<string, unknown> }) {
      const now = new Date().toISOString()
      const doc = { createdAt: now, updatedAt: now, ...clone(data), id: (data.id as string) ?? String(++seq) } as Doc
      table(collection).set(String(doc.id), doc)
      return clone(doc)
    },
    async findByID({ collection, id }: { collection: string; id: string | number; disableErrors?: boolean }) {
      const d = table(collection).get(String(id))
      if (!d) {
        const err = new Error('Not Found') as Error & { status: number }
        err.status = 404
        throw err
      }
      return clone(d)
    },
    async find({ collection, where, limit = 10, sort, page = 1, pagination }: { collection: string; where?: WhereClause; limit?: number; sort?: string; page?: number; pagination?: boolean }) {
      const all = sortDocs([...table(collection).values()].filter((d) => matchesWhere(d, where)), sort)
      const lim = pagination === false || limit === 0 ? all.length : limit
      const docs = all.slice((page - 1) * lim, page * lim)
      return { docs: clone(docs), totalDocs: all.length, page, limit: lim, hasNextPage: page * lim < all.length, totalPages: Math.ceil(all.length / (lim || 1)) }
    },
    async count({ collection, where }: { collection: string; where?: WhereClause }) {
      return { totalDocs: [...table(collection).values()].filter((d) => matchesWhere(d, where)).length }
    },
    async update(args: { collection: string; id?: string | number; where?: WhereClause; data: Record<string, unknown> }) {
      const now = new Date().toISOString()
      if (args.id !== undefined) {
        const d = table(args.collection).get(String(args.id))
        if (!d) throw Object.assign(new Error('Not Found'), { status: 404 })
        Object.assign(d, clone(args.data), { updatedAt: now })
        return clone(d)
      }
      const docs = [...table(args.collection).values()].filter((d) => matchesWhere(d, args.where))
      for (const d of docs) Object.assign(d, clone(args.data), { updatedAt: now })
      return { docs: clone(docs), errors: [] }
    },
    async delete(args: { collection: string; id?: string | number; where?: WhereClause }) {
      const t = table(args.collection)
      if (args.id !== undefined) {
        const d = t.get(String(args.id))
        t.delete(String(args.id))
        return clone(d)
      }
      const docs = [...t.values()].filter((d) => matchesWhere(d, args.where))
      for (const d of docs) t.delete(String(d.id))
      return { docs: clone(docs), errors: [] }
    },
    async findGlobal({ slug }: { slug: string }) {
      return clone((globals.get(slug) as Record<string, unknown>) ?? {})
    },
    async updateGlobal({ slug, data }: { slug: string; data: Record<string, unknown> }) {
      globals.set(slug, { ...((globals.get(slug) as object) ?? {}), ...data })
      return clone(globals.get(slug))
    },
    jobs: {
      async queue(a: { task: string; input: unknown; queue?: string }) {
        queued.push(a)
        return { id: String(++seq) }
      },
    },
  }
  return api as unknown as FakePayload
}
