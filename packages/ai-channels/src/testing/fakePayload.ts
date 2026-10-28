import type { Payload } from 'payload'
import { IDENTITIES, MESSAGES } from '../constants'

type Doc = Record<string, any> & { id: string }

const UNIQUE: Record<string, string[]> = {
  [MESSAGES]: ['channel', 'externalMessageId'],
  [IDENTITIES]: ['channel', 'externalIdHash'],
}

const matches = (doc: Doc, where: Record<string, any> = {}): boolean =>
  Object.entries(where).every(([field, cond]) => {
    if (field === 'and') return (cond as any[]).every((w) => matches(doc, w))
    if (field === 'or') return (cond as any[]).some((w) => matches(doc, w))
    const v = doc[field]
    if ('equals' in cond) return v === cond.equals
    if ('in' in cond) return (cond.in as unknown[]).includes(v)
    if ('exists' in cond) return cond.exists ? v != null : v == null
    return true
  })

/** In-memory Local API subset used by ai-channels (find/findByID/create/update, jobs.queue, sendEmail). */
export const createFakePayload = () => {
  const store = new Map<string, Doc[]>()
  const queued: { task: string; input: any }[] = []
  const emails: any[] = []
  let seq = 0
  let clock = 0
  const coll = (slug: string) => store.get(slug) ?? (store.set(slug, []), store.get(slug)!)
  const payload = {
    config: { custom: {} },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    async find({ collection, where, limit, sort }: any) {
      let docs = coll(collection).filter((d) => matches(d, where))
      if (sort === '-createdAt') docs = [...docs].sort((a, b) => b._seq - a._seq)
      return { docs: docs.slice(0, limit ?? 10).map((d) => ({ ...d })) }
    },
    async findByID({ collection, id }: any) {
      const d = coll(collection).find((x) => x.id === String(id))
      if (!d) throw new Error('Not Found')
      return { ...d }
    },
    async create({ collection, data }: any) {
      const keys = UNIQUE[collection]
      if (keys && coll(collection).some((d) => keys.every((k) => d[k] === data[k]))) {
        const e = new Error('duplicate key value violates unique constraint') as Error & { code: string }
        e.code = '23505'
        throw e
      }
      const doc = { ...data, id: `${collection}_${++seq}`, _seq: ++clock, createdAt: new Date(clock).toISOString() }
      coll(collection).push(doc)
      return { ...doc }
    },
    async update({ collection, id, data }: any) {
      const d = coll(collection).find((x) => x.id === String(id))
      if (!d) throw new Error('Not Found')
      Object.assign(d, data)
      return { ...d }
    },
    jobs: {
      async queue(args: { task: string; input: any }) {
        queued.push(args)
        return { id: `job_${queued.length}` }
      },
    },
    async sendEmail(msg: any) {
      emails.push(msg)
    },
  }
  return {
    payload: payload as unknown as Payload,
    store,
    queued,
    emails,
    docs: (slug: string) => coll(slug),
  }
}
