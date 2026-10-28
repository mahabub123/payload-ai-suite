import { AIError } from 'payload-ai-core'
import type { AIContext, CoreServices } from 'payload-ai-core'
import { CHANGESETS } from './collections'
import { api, hasDrafts, idOf } from './local'
import { COPILOT_CONTEXT_FLAG, PROTECTED_FIELDS } from './options'

export interface ChangesetItem {
  id: string | number
  before: Record<string, unknown>
  after: Record<string, unknown>
}

export interface ChangesetDoc {
  id: string | number
  targetCollection: string
  status: 'proposed' | 'applying' | 'applied' | 'discarded' | 'failed'
  items: ChangesetItem[]
  fields: string[]
  results?: ItemResult[]
  idempotencyKey?: string
  [k: string]: unknown
}

export interface ItemResult {
  id: string | number
  status: 'applied' | 'conflict' | 'error'
  error?: string
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

const load = async (ctx: AIContext, id: string | number, tenantField?: string): Promise<ChangesetDoc> => {
  const cs = (await api(ctx.payload).findByID({ collection: CHANGESETS, id, depth: 0, overrideAccess: true }).catch(() => null)) as ChangesetDoc | null
  if (!cs) throw new AIError('not_found', 'Changeset not found')
  if (tenantField && ctx.tenant !== undefined && cs[tenantField] != null && idOf(cs[tenantField]) !== String(ctx.tenant)) {
    throw new AIError('not_found', 'Changeset not found')
  }
  return cs
}

const setStatus = (ctx: AIContext, id: string | number, data: Record<string, unknown>) =>
  api(ctx.payload).update({ collection: CHANGESETS, id, data, overrideAccess: true, depth: 0 }) as Promise<ChangesetDoc>

/**
 * Apply a proposed changeset as the calling staff user (overrideAccess: false, so collection access applies).
 * Writes drafts when the collection has drafts enabled; skips docs changed since the proposal; audits each doc.
 * Idempotent: an applied changeset returns its stored results without writing again.
 */
export const applyChangeset = async (
  services: CoreServices,
  ctx: AIContext,
  id: string | number,
  opts: { allowed: string[]; tenantField?: string; idempotencyKey?: string },
): Promise<{ id: string | number; status: ChangesetDoc['status']; results: ItemResult[]; replayed: boolean }> => {
  const cs = await load(ctx, id, opts.tenantField)
  if (cs.status === 'applied') return { id: cs.id, status: 'applied', results: cs.results ?? [], replayed: true }
  if (cs.status === 'discarded') throw new AIError('conflict', 'Changeset was discarded')
  if (cs.status === 'applying') throw new AIError('conflict', 'Changeset is being applied')
  if (!opts.allowed.includes(cs.targetCollection)) throw new AIError('forbidden', `The copilot may not edit "${cs.targetCollection}"`)

  await setStatus(ctx, cs.id, { status: 'applying', idempotencyKey: opts.idempotencyKey })
  const local = api(ctx.payload)
  const user = ctx.actor.user ?? ctx.req?.user ?? null
  const draft = hasDrafts(ctx.payload, cs.targetCollection)
  const results: ItemResult[] = []
  for (const item of cs.items ?? []) {
    try {
      const fields = Object.keys(item.after).filter((f) => !PROTECTED_FIELDS.has(f) && f !== opts.tenantField)
      const current = await local.findByID({ collection: cs.targetCollection, id: item.id, depth: 0, overrideAccess: false, user, draft })
      if (fields.some((f) => !same(current?.[f], item.before[f]))) {
        results.push({ id: item.id, status: 'conflict', error: 'Document changed since the proposal' })
        continue
      }
      const data = Object.fromEntries(fields.map((f) => [f, item.after[f]]))
      await local.update({
        collection: cs.targetCollection,
        id: item.id,
        data,
        draft,
        overrideAccess: false,
        user,
        depth: 0,
        context: { [COPILOT_CONTEXT_FLAG]: true },
      })
      await services.audit.log(
        {
          action: 'copilot.changeset.apply',
          target: { collection: cs.targetCollection, id: item.id },
          before: item.before,
          after: data,
          meta: { changeset: cs.id, draft },
        },
        { payload: ctx.payload, tenant: ctx.tenant, requestId: ctx.requestId, actor: ctx.actor },
      )
      results.push({ id: item.id, status: 'applied' })
    } catch (e) {
      results.push({ id: item.id, status: 'error', error: (e as Error).message })
    }
  }
  const anyApplied = results.some((r) => r.status === 'applied') || results.length === 0
  const status = anyApplied ? 'applied' : 'failed'
  await setStatus(ctx, cs.id, { status, results, appliedBy: idOf(user), appliedAt: new Date().toISOString() })
  return { id: cs.id, status, results, replayed: false }
}

export const discardChangeset = async (
  services: CoreServices,
  ctx: AIContext,
  id: string | number,
  opts: { tenantField?: string } = {},
): Promise<{ id: string | number; status: 'discarded' }> => {
  const cs = await load(ctx, id, opts.tenantField)
  if (cs.status === 'discarded') return { id: cs.id, status: 'discarded' }
  if (cs.status !== 'proposed' && cs.status !== 'failed') throw new AIError('conflict', `Changeset is ${cs.status}`)
  await setStatus(ctx, cs.id, { status: 'discarded' })
  await services.audit.log(
    { action: 'copilot.changeset.discard', target: { collection: CHANGESETS, id: cs.id } },
    { payload: ctx.payload, tenant: ctx.tenant, requestId: ctx.requestId, actor: ctx.actor },
  )
  return { id: cs.id, status: 'discarded' }
}
