/**
 * In-memory fake of the Payload Local API for adapter tests: find / findByID / create / update / count with
 * `where` (and/or, equals, not_equals, in, not_in, like, contains, greater_than(_equal), less_than(_equal), exists),
 * sort, pagination, depth population (relationship, upload, join), drafts, simple collection access, and a log
 * of every call (to assert overrideAccess / user / where).
 */
import type { Payload } from 'payload'

type Doc = Record<string, unknown>

export interface FakeField {
  name?: string
  type: string
  fields?: FakeField[]
  tabs?: { name?: string; fields: FakeField[] }[]
  blocks?: { slug: string; fields: FakeField[] }[]
  relationTo?: string | string[]
  collection?: string
  on?: string
  hasMany?: boolean
  localized?: boolean
  [k: string]: unknown
}

type AccessResult = boolean | Record<string, unknown>
type AccessFn = (args: { req: { user: Doc | null }; id?: string }) => AccessResult

export interface FakeCollection {
  slug: string
  fields: FakeField[]
  versions?: { drafts?: boolean | object }
  auth?: boolean
  upload?: boolean
  timestamps?: boolean
  access?: { read?: AccessFn; create?: AccessFn; update?: AccessFn }
  /** Runs before a create is stored (e.g. emulate the ecommerce cart secret). */
  beforeCreate?: (data: Doc) => void
}

export interface FakeCall {
  op: 'find' | 'findByID' | 'create' | 'update' | 'count'
  collection: string
  overrideAccess: boolean
  user: unknown
  where?: unknown
  locale?: unknown
  data?: unknown
}

export interface FakePayloadOptions {
  collections: FakeCollection[]
  data?: Record<string, Doc[]>
  localization?: false | { locales: string[]; defaultLocale: string }
  serverURL?: string
}

export class FakeAPIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = status === 404 ? 'NotFound' : status === 403 ? 'Forbidden' : 'APIError'
  }
}

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T))

const isObj = (v: unknown): v is Doc => typeof v === 'object' && v !== null && !Array.isArray(v)

const idOf = (v: unknown): unknown => (isObj(v) ? (v.id ?? (isObj(v.value) ? v.value.id : v.value)) : v)

/** Values at a dot path; arrays fan out. */
const valuesAt = (doc: unknown, path: string): unknown[] => {
  let cur: unknown[] = [doc]
  for (const seg of path.split('.')) {
    const next: unknown[] = []
    for (const c of cur) {
      if (Array.isArray(c)) {
        if (/^\d+$/.test(seg)) next.push(c[Number(seg)])
        else for (const el of c) if (isObj(el)) next.push(el[seg])
      } else if (isObj(c)) next.push(c[seg])
    }
    cur = next
  }
  return cur.flatMap((v) => (Array.isArray(v) ? v : [v])).map(idOf)
}

const cmp = (a: unknown, b: unknown): number => {
  const na = Number(a)
  const nb = Number(b)
  if (a !== '' && b !== '' && a != null && b != null && !Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
  const da = Date.parse(String(a))
  const db = Date.parse(String(b))
  if (!Number.isNaN(da) && !Number.isNaN(db)) return da - db
  return String(a).localeCompare(String(b))
}

const eq = (a: unknown, b: unknown) => a != null && b != null && String(a) === String(b)

export const matchWhere = (doc: Doc, where: unknown): boolean => {
  if (!isObj(where)) return true
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'and') {
      if (!(cond as unknown[]).every((w) => matchWhere(doc, w))) return false
      continue
    }
    if (key === 'or') {
      if (!(cond as unknown[]).some((w) => matchWhere(doc, w))) return false
      continue
    }
    const vals = valuesAt(doc, key).filter((v) => v !== undefined)
    for (const [op, x] of Object.entries(cond as Doc)) {
      const present = vals.filter((v) => v != null && v !== '')
      let ok: boolean
      switch (op) {
        case 'equals':
          ok = x === null ? present.length === 0 : vals.some((v) => eq(v, x))
          break
        case 'not_equals':
          ok = !vals.some((v) => eq(v, x))
          break
        case 'in':
          ok = vals.some((v) => (x as unknown[]).some((y) => eq(v, y)))
          break
        case 'not_in':
          ok = !vals.some((v) => (x as unknown[]).some((y) => eq(v, y)))
          break
        case 'like':
          ok = present.some((v) =>
            String(x)
              .toLowerCase()
              .split(/\s+/)
              .every((w) => String(v).toLowerCase().includes(w)),
          )
          break
        case 'contains':
          ok = present.some((v) => String(v).toLowerCase().includes(String(x).toLowerCase()))
          break
        case 'greater_than':
          ok = present.some((v) => cmp(v, x) > 0)
          break
        case 'greater_than_equal':
          ok = present.some((v) => cmp(v, x) >= 0)
          break
        case 'less_than':
          ok = present.some((v) => cmp(v, x) < 0)
          break
        case 'less_than_equal':
          ok = present.some((v) => cmp(v, x) <= 0)
          break
        case 'exists':
          ok = x ? present.length > 0 : present.length === 0
          break
        default:
          throw new Error(`fake payload: unsupported operator ${op}`)
      }
      if (!ok) return false
    }
  }
  return true
}

export const createFakePayload = (opts: FakePayloadOptions) => {
  const db = new Map<string, Doc[]>()
  for (const c of opts.collections) db.set(c.slug, clone(opts.data?.[c.slug] ?? []))
  const calls: FakeCall[] = []
  let seq = 1000
  const col = (slug: string) => {
    const c = opts.collections.find((x) => x.slug === slug)
    if (!c) throw new FakeAPIError(404, `Collection ${slug} not found`)
    return c
  }

  const populate = (value: unknown, fields: FakeField[], depth: number): unknown => {
    if (!isObj(value)) return value
    const out: Doc = { ...value }
    const walk = (fs: FakeField[], target: Doc) => {
      for (const f of fs) {
        if (f.type === 'tabs') {
          for (const t of f.tabs ?? []) {
            if (t.name && isObj(target[t.name])) target[t.name] = populate(target[t.name], t.fields, depth)
            else if (!t.name) walk(t.fields, target)
          }
          continue
        }
        if (!f.name) {
          if (f.fields) walk(f.fields, target)
          continue
        }
        const v = target[f.name]
        if ((f.type === 'relationship' || f.type === 'upload') && typeof f.relationTo === 'string' && depth > 0) {
          const related = opts.collections.find((x) => x.slug === f.relationTo)
          if (!related) continue
          const load = (id: unknown) => {
            if (isObj(id)) return id
            const hit = db.get(f.relationTo as string)!.find((d) => eq(d.id, id))
            return hit ? populate(clone(hit), related.fields, depth - 1) : id
          }
          if (Array.isArray(v)) target[f.name] = v.map(load)
          else if (v != null) target[f.name] = load(v)
        } else if (f.type === 'join' && depth > 0 && f.collection && f.on) {
          const jc = col(f.collection)
          const docs = db.get(f.collection)!.filter((d) => valuesAt(d, f.on!).some((x) => eq(x, value.id)))
          target[f.name] = { docs: docs.map((d) => populate(clone(d), jc.fields, depth - 1)), hasNextPage: false }
        } else if (f.type === 'array' && Array.isArray(v)) {
          target[f.name] = v.map((row) => populate(row, f.fields ?? [], depth))
        } else if (f.type === 'group' && isObj(v)) {
          target[f.name] = populate(v, f.fields ?? [], depth)
        }
      }
    }
    walk(fields, out)
    return out
  }

  const accessWhere = (c: FakeCollection, op: 'read' | 'create' | 'update', args: Doc): Record<string, unknown> | null => {
    if (args.overrideAccess !== false) return null
    const fn = c.access?.[op]
    const user = (args.user ?? (args.req as Doc | undefined)?.user ?? null) as Doc | null
    const res = fn ? fn({ req: { user } }) : true
    if (res === false) throw new FakeAPIError(403, `You are not allowed to ${op} ${c.slug}`)
    return res === true ? null : res
  }

  const log = (op: FakeCall['op'], args: Doc) =>
    calls.push({
      op,
      collection: String(args.collection),
      overrideAccess: args.overrideAccess !== false,
      user: args.user,
      where: args.where,
      locale: args.locale,
      data: args.data,
    })

  const doFind = (args: Doc) => {
    const c = col(String(args.collection))
    const acc = accessWhere(c, 'read', args)
    let docs = db.get(c.slug)!.filter((d) => matchWhere(d, args.where) && (!acc || matchWhere(d, acc)))
    const sort = args.sort as string | undefined
    if (sort) {
      const desc = sort.startsWith('-')
      const key = desc ? sort.slice(1) : sort
      docs = [...docs].sort((a, b) => {
        const va = valuesAt(a, key)[0]
        const vb = valuesAt(b, key)[0]
        if (va == null && vb == null) return 0
        if (va == null) return 1
        if (vb == null) return -1
        return desc ? cmp(vb, va) : cmp(va, vb)
      })
    }
    const limit = (args.limit as number) || 10
    const page = (args.page as number) || 1
    const slice = docs.slice((page - 1) * limit, page * limit)
    const depth = (args.depth as number | undefined) ?? 2
    return {
      docs: slice.map((d) => populate(clone(d), c.fields, depth) as Doc),
      totalDocs: docs.length,
      hasNextPage: page * limit < docs.length,
      page,
      limit,
    }
  }

  const api = {
    async find(args: Doc) {
      log('find', args)
      return doFind(args)
    },
    async count(args: Doc) {
      log('count', args)
      return { totalDocs: doFind({ ...args, limit: 1e9 }).totalDocs }
    },
    async findByID(args: Doc) {
      log('findByID', args)
      const res = doFind({ ...args, where: { id: { equals: args.id } }, limit: 1 })
      if (!res.docs[0]) {
        if (args.disableErrors) return null
        throw new FakeAPIError(404, 'Not Found')
      }
      return res.docs[0]
    },
    async create(args: Doc) {
      log('create', args)
      const c = col(String(args.collection))
      accessWhere(c, 'create', args)
      const now = new Date().toISOString()
      const doc: Doc = { id: `${c.slug}-${++seq}`, createdAt: now, updatedAt: now, ...clone(args.data as Doc) }
      c.beforeCreate?.(doc)
      db.get(c.slug)!.push(doc)
      return populate(clone(doc), c.fields, (args.depth as number | undefined) ?? 0) as Doc
    },
    async update(args: Doc) {
      log('update', args)
      const c = col(String(args.collection))
      const acc = accessWhere(c, 'update', args)
      const doc = db.get(c.slug)!.find((d) => eq(d.id, args.id))
      if (!doc || (acc && !matchWhere(doc, acc))) throw new FakeAPIError(404, 'Not Found')
      Object.assign(doc, clone(args.data as Doc), { updatedAt: new Date().toISOString() })
      return populate(clone(doc), c.fields, (args.depth as number | undefined) ?? 0) as Doc
    },
  }

  const payload = {
    ...api,
    config: {
      collections: opts.collections,
      localization: opts.localization
        ? { locales: opts.localization.locales.map((code) => ({ code })), defaultLocale: opts.localization.defaultLocale }
        : false,
      serverURL: opts.serverURL ?? '',
    },
  } as unknown as Payload

  return { payload, db, calls, reset: () => (calls.length = 0) }
}
