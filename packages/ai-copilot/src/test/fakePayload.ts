import type { Payload } from 'payload'

type Doc = Record<string, any>

const get = (o: any, p: string) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o)

const matchWhere = (doc: Doc, where: any): boolean => {
  if (!where || !Object.keys(where).length) return true
  return Object.entries(where).every(([k, cond]: [string, any]) => {
    if (k === 'and') return (cond as any[]).every((w) => matchWhere(doc, w))
    if (k === 'or') return (cond as any[]).some((w) => matchWhere(doc, w))
    const v = get(doc, k)
    return Object.entries(cond).every(([op, val]: [string, any]) => {
      switch (op) {
        case 'equals':
          return v === val
        case 'not_equals':
          return v !== val
        case 'in':
          return (val as any[]).includes(v)
        case 'greater_than':
          return v > val
        case 'less_than':
          return v < val
        case 'like':
        case 'contains':
          return String(v ?? '').toLowerCase().includes(String(val).toLowerCase())
        case 'exists':
          return (v != null) === val
        default:
          throw new Error(`fake payload: unsupported op ${op}`)
      }
    })
  })
}

export interface FakePayload {
  payload: Payload
  store: Map<string, Map<string, Doc>>
  calls: { update: any[]; create: any[]; queue: any[]; email: any[] }
  /** Collections the non-overridden user may not write. */
  denyWrite: Set<string>
  seed(collection: string, docs: Doc[]): void
}

export const createFakePayload = (opts: { drafts?: string[]; fields?: Record<string, string[]> } = {}): FakePayload => {
  const store = new Map<string, Map<string, Doc>>()
  const calls = { update: [] as any[], create: [] as any[], queue: [] as any[], email: [] as any[] }
  const denyWrite = new Set<string>()
  let seq = 100
  const col = (c: string) => store.get(c) ?? store.set(c, new Map()).get(c)!
  const collections = new Proxy(
    {},
    {
      get: (_t, slug: string) => ({
        config: {
          versions: opts.drafts?.includes(slug) ? { drafts: true } : undefined,
          flattenedFields: opts.fields?.[slug]?.map((name) => ({ name })),
        },
      }),
    },
  )
  const payload = {
    config: { custom: {} },
    logger: { error: () => undefined, warn: () => undefined, info: () => undefined },
    collections,
    async find(a: any) {
      const docs = [...col(a.collection).values()].filter((d) => matchWhere(d, a.where))
      return { docs: docs.slice(0, a.limit ?? 10).map((d) => structuredClone(d)), totalDocs: docs.length }
    },
    async findByID(a: any) {
      const d = col(a.collection).get(String(a.id))
      if (!d) throw new Error('Not Found')
      return structuredClone(d)
    },
    async create(a: any) {
      calls.create.push(a)
      const id = String(++seq)
      const doc = { id, ...structuredClone(a.data), createdAt: new Date().toISOString() }
      col(a.collection).set(id, doc)
      return structuredClone(doc)
    },
    async update(a: any) {
      if (a.overrideAccess === false && denyWrite.has(a.collection)) throw new Error('Forbidden')
      calls.update.push(a)
      const d = col(a.collection).get(String(a.id))
      if (!d) throw new Error('Not Found')
      Object.assign(d, structuredClone(a.data))
      return structuredClone(d)
    },
    async sendEmail(a: any) {
      calls.email.push(a)
    },
    jobs: {
      async queue(a: any) {
        calls.queue.push(a)
        return { id: `job_${calls.queue.length}` }
      },
    },
  }
  return {
    payload: payload as unknown as Payload,
    store,
    calls,
    denyWrite,
    seed(c, docs) {
      for (const d of docs) col(c).set(String(d.id), structuredClone(d))
    },
  }
}
