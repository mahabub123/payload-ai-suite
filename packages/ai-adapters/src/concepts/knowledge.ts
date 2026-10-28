import type { KnowledgeAdapter, KnowledgeDoc, Visibility } from 'payload-ai-core'
import { inTenant, isPublishedDoc, iterateDocs } from '../local'
import { fillPattern, getPath, toIso, toStr, toText } from '../mapping/values'
import type { Resolution, ResolveEnv } from '../resolve'
import { readOpts, since } from './common'

const VISIBILITIES: Visibility[] = ['public', 'customers', 'staff']

export const createKnowledgeAdapter = (env: ResolveEnv, r: Resolution): KnowledgeAdapter => {
  const sources = r.knowledge ?? []
  const adapter: KnowledgeAdapter = {
    collections: sources.map((s) => s.target.collection),

    toKnowledgeDoc(collection, doc, ctx) {
      const s = sources.find((x) => x.target.collection === collection)
      if (!s) return null
      const t = s.target
      if (!isPublishedDoc(t, doc) || !inTenant(t, doc, ctx)) return null
      const ro = readOpts(env, ctx)
      const read = (key: string) => (t.fields[key] ? getPath(doc, t.fields[key], ro) : undefined)
      const title = toStr(read('title')) ?? ''
      const text = s.bodyPaths
        .map((p) => toText(getPath(doc, p, ro)).trim())
        .filter(Boolean)
        .join('\n\n')
      if (!title && !text) return null
      const vis = toStr(read('visibility'))
      const slug = toStr(read('slug'))
      const out: KnowledgeDoc = {
        sourceCollection: collection,
        sourceId: String(doc.id),
        title,
        text,
        url: fillPattern(s.urlPattern, doc, { slug, id: doc.id }),
        locale: ctx.locale,
        visibility: VISIBILITIES.includes(vis as Visibility) ? (vis as Visibility) : (s.visibility as Visibility),
        updatedAt: toIso(read('updatedAt') ?? doc.updatedAt),
      }
      return out
    },

    async *iterate(opts, ctx) {
      for (const s of sources) {
        for await (const doc of iterateDocs(s.target, ctx, {
          publishedOnly: true,
          where: since(s.target.fields.updatedAt ?? 'updatedAt', opts.since),
          batchSize: opts.batchSize,
          depth: 1,
        })) {
          const k = adapter.toKnowledgeDoc(s.target.collection, doc, ctx)
          if (k) yield k
        }
      }
    },
  }
  return adapter
}
