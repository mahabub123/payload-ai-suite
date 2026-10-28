import type { Payload, TaskConfig, Where } from 'payload'
import { AIError, getAI, isAIError, type AIContext, type CoreServices } from '@payload-ai-suite/ai-core'
import { BULK_RUNS, BULK_TASK, GENERATIONS, MODULE } from './constants'
import { collectionHasDrafts, getFieldInfo, setPath } from './fields'
import {
  assertTenant,
  loadDoc,
  prepareGeneration,
  recordGeneration,
  runGeneration,
  shapeStructured,
  tenantData,
  valueForField,
  type GenerationResult,
} from './generate'
import { ACTIONS } from './prompts'
import type { AiContentOptions, ContentAction } from './types'

type AnyRecord = Record<string, any>

export interface BulkRequest {
  collection: string
  ids?: (string | number)[]
  where?: Where
  action: ContentAction
  template?: string
  fields: string[]
  locale?: string
  instructions?: string
  tone?: string
  targetLocale?: string
}

export type ReviewRequest =
  | { decision: 'accept-all' | 'discard-all' }
  | { items: { id: string | number; accept: boolean }[] }

/** Run `fn` over `items` with at most `limit` in flight. */
export const mapLimit = async <T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> => {
  let i = 0
  const worker = async () => {
    while (i < items.length) {
      const item = items[i++]
      await fn(item)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
}

const idOf = (v: unknown): string | undefined => (v && typeof v === 'object' ? String((v as AnyRecord).id) : v != null ? String(v) : undefined)

const tenantOf = (payload: Payload, rec: AnyRecord): string | number | undefined => {
  const data = tenantData(payload, 'x')
  const f = Object.keys(data)[0]
  return f ? (idOf(rec[f]) as string | undefined) : undefined
}

const userId = (ctx: AIContext) => (ctx.actor.user ? String((ctx.actor.user as AnyRecord).id) : undefined)

/**
 * Create the run (caller's access decides which documents are included) and queue the job.
 * The job only writes pending ai-generations; nothing touches the documents until review.
 */
export const createBulkRun = async (
  input: BulkRequest,
  ctx: AIContext,
  options: AiContentOptions,
  allowedCollections: ReadonlySet<string>,
): Promise<{ runId: string; jobId?: string; total: number; status: string; reviewPath: string }> => {
  const { payload } = ctx
  if (!allowedCollections.has(input.collection)) throw new AIError('forbidden', `AI content is not enabled for "${input.collection}"`)
  if (input.action === 'extract') throw new AIError('validation', '"extract" returns a draft for review and cannot run in bulk')
  for (const f of input.fields) {
    if (!getFieldInfo(payload, input.collection, f)) throw new AIError('validation', `"${f}" is not a text, textarea or rich text field`)
  }
  if (!input.ids?.length && !input.where) throw new AIError('validation', 'Pass ids or where')
  const maxItems = options.bulk?.maxItems ?? 500

  const user = ctx.actor.user ?? undefined
  const where: Where = input.ids?.length ? { id: { in: input.ids } } : (input.where as Where)
  const ids: string[] = []
  for (let page = 1; ids.length < maxItems; page++) {
    const res = await payload.find({
      collection: input.collection as never,
      where,
      depth: 0,
      limit: Math.min(100, maxItems),
      page,
      overrideAccess: false,
      user,
    })
    for (const d of res.docs as AnyRecord[]) if (ids.length < maxItems) ids.push(String(d.id))
    if (!res.hasNextPage) break
  }
  if (!ids.length) throw new AIError('not_found', 'No documents matched (or you cannot edit them)')

  const run = (await payload.create({
    collection: BULK_RUNS as never,
    overrideAccess: true,
    data: {
      title: `${ACTIONS[input.action].action} · ${input.collection} · ${ids.length} docs`,
      status: 'queued',
      targetCollection: input.collection,
      action: input.action,
      template: input.template,
      fields: input.fields,
      ids,
      where: input.where ?? null,
      locale: input.locale ?? ctx.locale,
      instructions: input.instructions,
      tone: input.tone,
      targetLocale: input.targetLocale,
      total: ids.length,
      requestedBy: userId(ctx),
      ...tenantData(payload, ctx.tenant),
    } as never,
  })) as AnyRecord
  const runId = String(run.id)

  const queue = payload.jobs.queue as unknown as (args: AnyRecord) => Promise<AnyRecord>
  const job = await queue({ task: BULK_TASK, input: { runId }, queue: options.bulk?.queue })
  const jobId = job?.id != null ? String(job.id) : undefined
  if (jobId) {
    await payload.update({ collection: BULK_RUNS as never, id: runId, overrideAccess: true, data: { jobId } as never })
  }
  return { runId, jobId, total: ids.length, status: 'queued', reviewPath: `/ai-content/bulk/${runId}` }
}

const existingPairs = async (payload: Payload, runId: string): Promise<Set<string>> => {
  const out = new Set<string>()
  for (let page = 1; ; page++) {
    const res = await payload.find({
      collection: GENERATIONS as never,
      where: { bulkRun: { equals: runId } },
      depth: 0,
      limit: 500,
      page,
      overrideAccess: true,
    })
    for (const g of res.docs as AnyRecord[]) out.add(`${g.targetId}:${g.field}`)
    if (!res.hasNextPage) break
  }
  return out
}

/** Job body. Idempotent: re-runs skip (doc, field) pairs that already have a generation for this run. */
export const runBulk = async (
  payload: Payload,
  runId: string,
  options: AiContentOptions,
  services: CoreServices = getAI(payload),
): Promise<{ processed: number; failed: number; skipped?: string }> => {
  const run = (await payload.findByID({ collection: BULK_RUNS as never, id: runId, depth: 0, overrideAccess: true })) as AnyRecord
  if (['review', 'done', 'cancelled'].includes(run.status)) return { processed: run.processed ?? 0, failed: run.failed ?? 0, skipped: run.status }
  const tenant = tenantOf(payload, run)
  const update = (data: AnyRecord) => payload.update({ collection: BULK_RUNS as never, id: runId, overrideAccess: true, data: data as never })

  if (!(await services.isModuleEnabled(MODULE, payload, tenant))) {
    await update({ status: 'failed', errorLog: [{ message: 'Content module is disabled' }], finishedAt: new Date().toISOString() })
    return { processed: 0, failed: 0, skipped: 'disabled' }
  }

  const ctx = services.systemContext(payload, { module: MODULE, tenant, locale: run.locale })
  const action = run.action as ContentAction
  const def = ACTIONS[action]
  const fields = (run.fields ?? []) as string[]
  const ids = ((run.ids ?? []) as unknown[]).map(String)
  const done = await existingPairs(payload, runId)

  const batch = services.ai.resolveRoute(def.task, ctx).some((m) => m.capabilities.includes('batch'))
  const concurrency = batch ? (options.bulk?.batchConcurrency ?? 8) : (options.bulk?.concurrency ?? 1)
  await update({ status: 'running', usedBatch: batch })

  let processed = 0
  let failed = 0
  let stopped: string | undefined
  const errors: { id: string; field?: string; message: string }[] = []

  await mapLimit(ids, concurrency, async (id) => {
    if (stopped) return
    try {
      const doc = await loadDoc(ctx, run.targetCollection, id, run.locale)
      let raw: AnyRecord | undefined
      for (const field of fields) {
        if (done.has(`${id}:${field}`)) continue
        const p = await prepareGeneration(
          {
            action,
            collection: run.targetCollection,
            docId: id,
            field,
            locale: run.locale,
            instructions: run.instructions ?? undefined,
            tone: run.tone ?? undefined,
            targetLocale: run.targetLocale ?? undefined,
            template: run.template ?? undefined,
            stream: false,
          },
          ctx,
          services,
          { doc },
        ).catch((e) => {
          // An empty source field is not a failure of the run: nothing to rewrite.
          if (isAIError(e) && e.code === 'validation' && def.needsSource) return undefined
          throw e
        })
        if (!p) continue
        let result: GenerationResult
        if (def.kind === 'structured' && raw) {
          // One structured call per document; other fields reuse it (e.g. SEO title + description).
          result = { ...shapeStructured(action, raw, p.field, p.categories), meta: { model: 'reused', costMicros: 0, latencyMs: 0 } }
        } else {
          result = await runGeneration(p, services, { batch })
          raw = result.raw
        }
        await recordGeneration(payload, { p, output: result.output, data: result.data, meta: result.meta, bulkRun: runId, docId: id })
      }
      processed++
    } catch (e) {
      failed++
      errors.push({ id, message: e instanceof Error ? e.message : String(e) })
      if (isAIError(e) && e.code === 'budget_exceeded') stopped = e.message
    }
    if ((processed + failed) % 10 === 0) await update({ processed, failed })
  })

  await update({
    status: 'review',
    processed,
    failed,
    errorLog: [...(stopped ? [{ id: '*', message: `Stopped: ${stopped}` }] : []), ...errors.slice(0, 100)],
    finishedAt: new Date().toISOString(),
  })
  return { processed, failed }
}

export const bulkTask = (options: AiContentOptions): TaskConfig<any> => ({
  slug: BULK_TASK,
  label: 'AI content: bulk enrichment',
  retries: 2,
  inputSchema: [{ name: 'runId', type: 'text', required: true }],
  outputSchema: [
    { name: 'processed', type: 'number' },
    { name: 'failed', type: 'number' },
  ],
  handler: async ({ input, req }) => {
    const r = await runBulk(req.payload, String((input as AnyRecord).runId), options)
    return { output: { processed: r.processed, failed: r.failed } }
  },
})

/* ---------- review ---------- */

const loadRun = async (ctx: AIContext, runId: string): Promise<AnyRecord> => {
  let run: AnyRecord
  try {
    run = (await ctx.payload.findByID({ collection: BULK_RUNS as never, id: runId, depth: 0, overrideAccess: true })) as AnyRecord
  } catch {
    throw new AIError('not_found', 'Bulk run not found')
  }
  assertTenant(ctx.payload, run, ctx.tenant)
  return run
}

export const getBulkReview = async (ctx: AIContext, runId: string, opts: { page?: number; limit?: number } = {}) => {
  const run = await loadRun(ctx, runId)
  const res = await ctx.payload.find({
    collection: GENERATIONS as never,
    where: { bulkRun: { equals: runId } },
    depth: 0,
    limit: Math.min(opts.limit ?? 100, 500),
    page: opts.page ?? 1,
    sort: 'targetId',
    overrideAccess: true,
  })
  return {
    run: {
      id: String(run.id),
      title: run.title,
      status: run.status,
      collection: run.targetCollection,
      action: run.action,
      fields: run.fields,
      locale: run.locale,
      total: run.total,
      processed: run.processed,
      failed: run.failed,
      errors: run.errorLog ?? [],
      drafts: collectionHasDrafts(ctx.payload, run.targetCollection),
    },
    items: (res.docs as AnyRecord[]).map((g) => ({
      id: String(g.id),
      docId: g.targetId,
      field: g.field,
      fieldType: g.fieldType,
      output: g.output,
      data: g.data,
      accepted: g.accepted ?? null,
      appliedAt: g.appliedAt ?? null,
    })),
    page: res.page,
    totalPages: res.totalPages,
    totalItems: res.totalDocs,
  }
}

const pendingForRun = async (payload: Payload, runId: string): Promise<AnyRecord[]> => {
  const out: AnyRecord[] = []
  for (let page = 1; ; page++) {
    const res = await payload.find({
      collection: GENERATIONS as never,
      where: { and: [{ bulkRun: { equals: runId } }, { accepted: { exists: false } }] },
      depth: 0,
      limit: 500,
      page,
      overrideAccess: true,
    })
    out.push(...(res.docs as AnyRecord[]).filter((g) => g.accepted == null))
    if (!res.hasNextPage) break
  }
  return out
}

/**
 * Apply staff decisions. Accepted values are written with the reviewer's own access, as a DRAFT when the
 * collection has drafts enabled; nothing is ever published here.
 */
export const applyBulkReview = async (ctx: AIContext, runId: string, body: ReviewRequest, services: CoreServices = getAI(ctx.payload)) => {
  const { payload } = ctx
  const run = await loadRun(ctx, runId)
  const collection = String(run.targetCollection)

  let accept: AnyRecord[] = []
  let discard: AnyRecord[] = []
  if ('decision' in body) {
    const pending = await pendingForRun(payload, runId)
    if (body.decision === 'accept-all') accept = pending
    else discard = pending
  } else {
    const wanted = new Map(body.items.map((i) => [String(i.id), i.accept]))
    const res = await payload.find({
      collection: GENERATIONS as never,
      where: { and: [{ bulkRun: { equals: runId } }, { id: { in: [...wanted.keys()] } }] },
      depth: 0,
      limit: wanted.size,
      overrideAccess: true,
    })
    for (const g of res.docs as AnyRecord[]) (wanted.get(String(g.id)) ? accept : discard).push(g)
  }

  const now = new Date().toISOString()
  const decidedBy = userId(ctx)
  const mark = (g: AnyRecord, data: AnyRecord) =>
    payload.update({ collection: GENERATIONS as never, id: g.id, overrideAccess: true, data: { decidedBy, acceptedAt: now, ...data } as never })

  for (const g of discard) await mark(g, { accepted: false })

  const drafts = collectionHasDrafts(payload, collection)
  const byDoc = new Map<string, AnyRecord[]>()
  for (const g of accept) byDoc.set(String(g.targetId), [...(byDoc.get(String(g.targetId)) ?? []), g])

  const failed: { docId: string; message: string }[] = []
  let accepted = 0
  for (const [docId, gens] of byDoc) {
    try {
      const data: AnyRecord = drafts ? { _status: 'draft' } : {}
      for (const g of gens) {
        const field = getFieldInfo(payload, collection, g.field)
        if (!field) throw new AIError('validation', `Field ${g.field} no longer exists`)
        setPath(data, g.field, await valueForField(payload, collection, field, String(g.output ?? ''), g.data))
      }
      await payload.update({
        collection: collection as never,
        id: docId,
        data: data as never,
        draft: drafts,
        locale: run.locale ?? undefined,
        overrideAccess: false,
        user: ctx.actor.user ?? undefined,
        depth: 0,
      })
      for (const g of gens) await mark(g, { accepted: true, appliedAt: now })
      accepted += gens.length
    } catch (e) {
      failed.push({ docId, message: e instanceof Error ? e.message : String(e) })
    }
  }

  const remaining = await pendingForRun(payload, runId)
  if (!remaining.length && run.status === 'review') {
    await payload.update({ collection: BULK_RUNS as never, id: runId, overrideAccess: true, data: { status: 'done' } as never })
  }
  try {
    await services.audit.log(
      { action: 'content.bulk.review', target: { collection: BULK_RUNS, id: runId }, meta: { accepted, discarded: discard.length, failed: failed.length, drafts } },
      ctx,
    )
  } catch {
    /* best-effort: the ai-generations rows already hold every decision */
  }
  return { accepted, discarded: discard.length, failed, drafts, pending: remaining.length }
}
