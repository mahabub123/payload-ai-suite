import type { AdapterContext, Category, CategoryAdapter } from 'payload-ai-core'
import { find, findOne } from '../local'
import type { Doc } from '../mapping/values'
import { relId, toStr } from '../mapping/values'
import type { Resolution, ResolveEnv } from '../resolve'
import { orNull, reader } from './common'

export const createCategoryAdapter = (env: ResolveEnv, r: Resolution): CategoryAdapter => {
  const t = r.main!
  const fromDoc = (doc: Doc, ctx: AdapterContext): Category => {
    const read = reader(env, t, ctx)
    return {
      id: String(doc.id),
      title: toStr(read(doc, 'title')) ?? '',
      slug: toStr(read(doc, 'slug')),
      parentId: relId(read(doc, 'parent')),
    }
  }
  return {
    collection: t.collection,
    fields: { ...t.fields },
    async list(ctx) {
      const res = await find(t, ctx, { publishedOnly: true, limit: 1000, depth: 0, sort: t.fields.title })
      return res.docs.map((d) => fromDoc(d, ctx))
    },
    async get(id, ctx) {
      const doc = await orNull(findOne(t, id, ctx, { publishedOnly: true, depth: 0 }))
      return doc ? fromDoc(doc, ctx) : null
    },
  }
}
