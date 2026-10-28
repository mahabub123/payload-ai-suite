/**
 * Tiny in-memory Payload stand-in for module tests: create / findByID / find / update / jobs.queue.
 * Draft semantics follow Payload: `update({ draft: true })` on a drafts-enabled collection writes a
 * draft version and leaves the published document untouched.
 */
import type { Payload } from 'payload'

type AnyRecord = Record<string, any>

export interface FakeCollection {
  slug: string
  fields: AnyRecord[]
  versions?: AnyRecord
  upload?: AnyRecord | boolean
}

export interface FakePayload extends Payload {
  calls: { op: string; collection?: string; args: AnyRecord }[]
  store: Map<string, Map<string, AnyRecord>>
  drafts: Map<string, AnyRecord>
}

const get = (o: AnyRecord, path: string) => path.split('.').reduce<any>((v, k) => (v == null ? undefined : v[k]), o)

const matches = (doc: AnyRecord, where: AnyRecord | undefined): boolean => {
  if (!where) return true
  return Object.entries(where).every(([k, cond]) => {
    if (k === 'and') return (cond as AnyRecord[]).every((w) => matches(doc, w))
    if (k === 'or') return (cond as AnyRecord[]).some((w) => matches(doc, w))
    const v = get(doc, k)
    const c = cond as AnyRecord
    if ('equals' in c) return String(v) === String(c.equals)
    if ('in' in c) return (c.in as unknown[]).map(String).includes(String(v))
    if ('exists' in c) return c.exists ? v != null : v == null
    return true
  })
}

const deepMerge = (a: AnyRecord, b: AnyRecord): AnyRecord => {
  const out: AnyRecord = { ...a }
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !v.root ? deepMerge(a[k], v) : v
  }
  return out
}

export const createFakePayload = (collections: FakeCollection[], config: AnyRecord = {}): FakePayload => {
  const store = new Map<string, Map<string, AnyRecord>>()
  const drafts = new Map<string, AnyRecord>()
  const calls: FakePayload['calls'] = []
  let seq = 0
  const table = (c: string) => {
    if (!store.has(c)) store.set(c, new Map())
    return store.get(c)!
  }
  const byslug = Object.fromEntries(collections.map((c) => [c.slug, c]))

  const payload = {
    calls,
    store,
    drafts,
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    config: {
      serverURL: 'http://localhost:3000',
      routes: { api: '/api', admin: '/admin' },
      custom: { aiSuite: { coreInstalled: true, modules: [], options: {} } },
      collections: collections.map((c) => ({ slug: c.slug, fields: c.fields, versions: c.versions, upload: c.upload })),
      ...config,
    },
    collections: Object.fromEntries(
      collections.map((c) => [c.slug, { config: { slug: c.slug, fields: c.fields, flattenedFields: c.fields, versions: c.versions, upload: c.upload } }]),
    ),
    async create(args: AnyRecord) {
      calls.push({ op: 'create', collection: args.collection, args })
      const id = String(++seq)
      const doc: AnyRecord = { id, ...structuredClone(args.data ?? {}), createdAt: new Date().toISOString() }
      if (args.file) {
        doc.filename = args.file.name
        doc.mimeType = args.file.mimetype
        doc.filesize = args.file.size
        doc.url = `/api/${args.collection}/file/${args.file.name}`
      }
      table(args.collection).set(id, doc)
      return structuredClone(doc)
    },
    async findByID(args: AnyRecord) {
      calls.push({ op: 'findByID', collection: args.collection, args })
      const doc = table(args.collection).get(String(args.id))
      if (!doc) throw new Error('Not Found')
      return structuredClone(doc)
    },
    async find(args: AnyRecord) {
      calls.push({ op: 'find', collection: args.collection, args })
      const all = [...table(args.collection).values()].filter((d) => matches(d, args.where))
      const limit = args.limit || 10
      const page = args.page ?? 1
      const docs = all.slice((page - 1) * limit, page * limit)
      const totalPages = Math.max(1, Math.ceil(all.length / limit))
      return { docs: structuredClone(docs), totalDocs: all.length, page, totalPages, hasNextPage: page < totalPages, limit }
    },
    async update(args: AnyRecord) {
      calls.push({ op: 'update', collection: args.collection, args })
      const t = table(args.collection)
      const doc = t.get(String(args.id))
      if (!doc) throw new Error('Not Found')
      const hasDrafts = Boolean(byslug[args.collection]?.versions?.drafts)
      if (hasDrafts && args.draft && args.data?._status !== 'published') {
        const key = `${args.collection}:${args.id}`
        drafts.set(key, deepMerge(drafts.get(key) ?? doc, args.data))
        return structuredClone(drafts.get(key)!)
      }
      const next = deepMerge(doc, args.data ?? {})
      t.set(String(args.id), next)
      return structuredClone(next)
    },
    jobs: {
      async queue(args: AnyRecord) {
        calls.push({ op: 'queue', args })
        return { id: `job_${++seq}`, ...args }
      },
    },
  }
  return payload as unknown as FakePayload
}

/** Seed a document directly (no call log). */
export const seed = (payload: FakePayload, collection: string, doc: AnyRecord) => {
  if (!payload.store.has(collection)) payload.store.set(collection, new Map())
  payload.store.get(collection)!.set(String(doc.id), structuredClone(doc))
}
