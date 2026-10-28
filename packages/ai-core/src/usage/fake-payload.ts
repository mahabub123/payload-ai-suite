/** Test-only in-memory stand-in for the Local API subset the core-A services use. */
import type { Payload } from 'payload'

type Doc = Record<string, unknown> & { id: number }

const match = (doc: Doc, where: Record<string, unknown> | undefined): boolean => {
  if (!where) return true
  return Object.entries(where).every(([k, cond]) => {
    if (k === 'and') return (cond as Record<string, unknown>[]).every((w) => match(doc, w))
    if (k === 'or') return (cond as Record<string, unknown>[]).some((w) => match(doc, w))
    const c = cond as Record<string, unknown>
    const v = doc[k] as never
    if ('equals' in c) return String(v) === String(c.equals)
    if ('greater_than_equal' in c && !(v >= (c.greater_than_equal as never))) return false
    if ('less_than_equal' in c && !(v <= (c.less_than_equal as never))) return false
    return true
  })
}

export const createFakePayload = (globals: Record<string, Record<string, unknown>> = {}) => {
  const store = new Map<string, Doc[]>()
  let seq = 0
  const logs: { level: string; args: unknown[] }[] = []
  const rows = (c: string) => store.get(c) ?? (store.set(c, []), store.get(c)!)
  const payload = {
    store,
    logs,
    globals,
    config: { custom: {} },
    logger: {
      info: (...a: unknown[]) => logs.push({ level: 'info', args: a }),
      warn: (...a: unknown[]) => logs.push({ level: 'warn', args: a }),
      error: (...a: unknown[]) => logs.push({ level: 'error', args: a }),
    },
    async create({ collection, data }: { collection: string; data: Record<string, unknown> }) {
      const doc = { ...data, id: ++seq, createdAt: new Date().toISOString() }
      rows(collection).push(doc)
      return doc
    },
    async find({ collection, where, limit }: { collection: string; where?: Record<string, unknown>; limit?: number }) {
      const docs = rows(collection).filter((d) => match(d, where))
      return { docs: limit ? docs.slice(0, limit) : docs, totalDocs: docs.length }
    },
    async update({ collection, id, data }: { collection: string; id: number; data: Record<string, unknown> }) {
      const doc = rows(collection).find((d) => d.id === id)
      if (!doc) throw new Error('not found')
      Object.assign(doc, data)
      return doc
    },
    async findGlobal({ slug }: { slug: string }) {
      return globals[slug] ?? {}
    },
  }
  return payload as typeof payload & Payload
}
