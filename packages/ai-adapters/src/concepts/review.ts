import type { AdapterContext, Review, ReviewAdapter } from '@payload-ai-suite/ai-core'
import type { Where } from 'payload'
import { and, find, iterateDocs, update } from '../local'
import type { Doc } from '../mapping/values'
import { relId, setPath, toIso, toNum, toStr, toText } from '../mapping/values'
import type { Resolution, ResolveEnv } from '../resolve'
import { clampLimit, labelOf, reader, since } from './common'

export const createReviewAdapter = (env: ResolveEnv, r: Resolution): ReviewAdapter => {
  const t = r.main!
  const f = t.fields
  const held = (r.options as { held?: false | { field: string; heldValue?: string | boolean; releasedValue?: string | boolean } }).held
  const heldValue = held ? (held.heldValue ?? true) : undefined

  const fromDoc = (doc: Doc, ctx: AdapterContext): Review => {
    const read = reader(env, t, ctx)
    return {
      id: String(doc.id),
      offeringId: relId(read(doc, 'offering')) ?? '',
      rating: toNum(read(doc, 'rating')),
      title: toStr(read(doc, 'title')),
      body: toText(read(doc, 'body')),
      authorName: labelOf(read(doc, 'author')),
      createdAt: toIso(read(doc, 'createdAt') ?? doc.createdAt) ?? '',
      status: toStr(read(doc, 'status')),
    }
  }

  const notHeld: Where | undefined = held
    ? { or: [{ [held.field]: { not_equals: heldValue } }, { [held.field]: { exists: false } }] }
    : undefined

  const adapter: ReviewAdapter = {
    collection: t.collection,
    fields: { ...f },
    async listForOffering(offeringId, ctx, opts) {
      const res = await find(t, ctx, {
        where: and({ [f.offering]: { equals: offeringId } }, notHeld),
        publishedOnly: true,
        sort: `-${f.createdAt ?? 'createdAt'}`,
        limit: clampLimit(opts?.limit, 10),
        depth: 1,
      })
      return res.docs.map((d) => fromDoc(d, ctx))
    },
    async *iterate(opts, ctx) {
      for await (const doc of iterateDocs(t, ctx, { where: since('updatedAt', opts.since), batchSize: opts.batchSize, depth: 1 }))
        yield fromDoc(doc, ctx)
    },
  }
  if (held) {
    adapter.setHeld = async (id, isHeld, ctx) => {
      const data: Doc = {}
      setPath(data, held.field, isHeld ? heldValue : (held.releasedValue ?? false))
      await update(t, id, data, ctx)
    }
  }
  return adapter
}
