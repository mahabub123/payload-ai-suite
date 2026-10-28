import type { AdapterContext, Customer, CustomerAdapter } from 'payload-ai-core'
import { find, findOne, iterateDocs, ownerId } from '../local'
import type { Doc } from '../mapping/values'
import { getPath, toIso, toStr } from '../mapping/values'
import type { Resolution, ResolveEnv } from '../resolve'
import { orNull, reader } from './common'

export const createCustomerAdapter = (env: ResolveEnv, r: Resolution): CustomerAdapter => {
  const t = r.main!
  const isAuth = !!t.col.auth

  const fromDoc = (doc: Doc, ctx: AdapterContext): Customer => {
    const read = reader(env, t, ctx)
    let name = toStr(read(doc, 'name'))
    // firstName mapped: append a sibling lastName when present.
    if (name && t.fields.name?.endsWith('firstName')) {
      const last = toStr(getPath(doc, t.fields.name.replace(/firstName$/, 'lastName')))
      if (last) name = `${name} ${last}`
    }
    const optIn = read(doc, 'marketingOptIn')
    return {
      id: String(doc.id),
      email: toStr(read(doc, 'email')),
      name,
      phone: toStr(read(doc, 'phone')),
      createdAt: toIso(read(doc, 'createdAt') ?? doc.createdAt),
      marketingOptIn: typeof optIn === 'boolean' ? optIn : undefined,
    }
  }

  const adapter: CustomerAdapter = {
    collection: t.collection,
    fields: { ...t.fields },
    async current(ctx) {
      const id = ownerId(ctx)
      if (!id) return null
      // A logged-in user from another auth collection (e.g. staff `admins`) is not a customer.
      const userCollection = (ctx.user as { collection?: string } | null | undefined)?.collection
      if (!ctx.customerId && userCollection && userCollection !== t.collection) return null
      return adapter.get(id, ctx)
    },
    async get(id, ctx) {
      const doc = await orNull(findOne(t, id, ctx, { depth: 0 }))
      return doc ? fromDoc(doc, ctx) : null
    },
    async findByEmail(email, ctx) {
      const field = t.fields.email
      if (!field || !email.trim()) return null
      const value = isAuth && field === 'email' ? email.trim().toLowerCase() : email.trim()
      const res = await find(t, ctx, { where: { [field]: { equals: value } }, limit: 1, depth: 0 })
      return res.docs[0] ? fromDoc(res.docs[0], ctx) : null
    },
    async *iterate(opts, ctx) {
      for await (const doc of iterateDocs(t, ctx, { batchSize: opts.batchSize, depth: 0 })) yield fromDoc(doc, ctx)
    },
  }
  return adapter
}
