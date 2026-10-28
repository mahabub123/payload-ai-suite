/**
 * Minimal in-memory Payload Local API for module tests: find/findByID/create/update/count with a
 * small `where` subset, unique-field enforcement, sendEmail and jobs.queue capture.
 */
import type { CollectionConfig, Payload } from 'payload'

type Doc = Record<string, any>
type WhereClause = Record<string, any>

const get = (doc: Doc, path: string) => path.split('.').reduce<any>((o, k) => (o == null ? o : o[k]), doc)
const norm = (v: unknown) => (v != null && typeof v === 'object' && 'id' in (v as Doc) ? (v as Doc).id : v)
const eq = (a: unknown, b: unknown) => String(norm(a)) === String(norm(b))

const matches = (doc: Doc, where?: WhereClause): boolean => {
  if (!where) return true
  return Object.entries(where).every(([k, cond]) => {
    if (k === 'and') return (cond as WhereClause[]).every((w) => matches(doc, w))
    if (k === 'or') return (cond as WhereClause[]).some((w) => matches(doc, w))
    const v = get(doc, k)
    return Object.entries(cond as Doc).every(([op, x]) => {
      switch (op) {
        case 'equals':
          return v == null ? x == null : eq(v, x)
        case 'not_equals':
          return v == null ? x != null : !eq(v, x)
        case 'in':
          return (x as unknown[]).some((y) => eq(v, y))
        case 'not_in':
          return !(x as unknown[]).some((y) => eq(v, y))
        case 'exists':
          return x ? v != null : v == null
        case 'greater_than_equal':
          return v != null && v >= x
        case 'greater_than':
          return v != null && v > x
        case 'less_than':
          return v != null && v < x
        case 'less_than_equal':
          return v != null && v <= x
        default:
          throw new Error(`fakePayload: unsupported operator ${op}`)
      }
    })
  })
}

export interface FakePayload extends Payload {
  db_: Map<string, Map<string, Doc>>
  emails: Doc[]
  jobs_: { task: string; input: any; waitUntil?: Date }[]
  /** Make sendEmail throw for these recipients (consumed per call when `once`). */
  failEmail: Map<string, { error: unknown; once?: boolean }>
}

export const createFakePayload = (collections: CollectionConfig[] = [], extraSlugs: string[] = []): FakePayload => {
  const db = new Map<string, Map<string, Doc>>()
  const unique = new Map<string, string[]>()
  for (const c of collections) {
    db.set(c.slug, new Map())
    unique.set(
      c.slug,
      c.fields.filter((f) => 'unique' in f && f.unique && 'name' in f).map((f) => (f as { name: string }).name),
    )
  }
  for (const s of extraSlugs) db.set(s, new Map())
  let seq = 0
  const table = (slug: string) => {
    const t = db.get(slug)
    if (!t) throw new Error(`fakePayload: unknown collection ${slug}`)
    return t
  }
  const emails: Doc[] = []
  const jobs: FakePayload['jobs_'] = []
  const failEmail: FakePayload['failEmail'] = new Map()

  const fake = {
    db_: db,
    emails,
    jobs_: jobs,
    failEmail,
    config: { serverURL: 'https://shop.test', custom: {}, collections },
    collections: Object.fromEntries([...db.keys()].map((k) => [k, { config: { slug: k } }])),
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
    async find({ collection, where, limit = 10, page = 1, sort }: any) {
      let docs = [...table(collection).values()].filter((d) => matches(d, where))
      if (sort) {
        const desc = String(sort).startsWith('-')
        const key = String(sort).replace(/^-/, '')
        docs.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (desc ? -1 : 1))
      }
      const start = (page - 1) * limit
      const slice = docs.slice(start, start + limit)
      return { docs: structuredClone(slice), totalDocs: docs.length, hasNextPage: start + limit < docs.length, page }
    },
    async findByID({ collection, id }: any) {
      const d = table(collection).get(String(id))
      if (!d) throw Object.assign(new Error('Not Found'), { status: 404 })
      return structuredClone(d)
    },
    async count({ collection, where }: any) {
      return { totalDocs: [...table(collection).values()].filter((d) => matches(d, where)).length }
    },
    async create({ collection, data }: any) {
      const t = table(collection)
      for (const f of unique.get(collection) ?? []) {
        if (data[f] != null && [...t.values()].some((d) => d[f] === data[f])) {
          throw Object.assign(new Error(`The following field is invalid: ${f} (unique)`), { status: 400 })
        }
      }
      const id = String(++seq)
      const now = new Date().toISOString()
      const doc = { ...structuredClone(data), id, createdAt: now, updatedAt: now }
      t.set(id, doc)
      return structuredClone(doc)
    },
    async update({ collection, id, data }: any) {
      const t = table(collection)
      const prev = t.get(String(id))
      if (!prev) throw Object.assign(new Error('Not Found'), { status: 404 })
      const next = { ...prev, ...structuredClone(data), updatedAt: new Date().toISOString() }
      t.set(String(id), next)
      return structuredClone(next)
    },
    async sendEmail(msg: Doc) {
      const f = failEmail.get(msg.to)
      if (f) {
        if (f.once) failEmail.delete(msg.to)
        throw f.error
      }
      emails.push(msg)
      return { ok: true }
    },
    jobs: {
      async queue(args: any) {
        jobs.push({ task: args.task, input: args.input, waitUntil: args.waitUntil })
        return { id: String(jobs.length) }
      },
    },
  }
  return fake as unknown as FakePayload
}
