import { z } from 'zod'
import type { CollectionConfig, Payload } from 'payload'
import type {
  AIContext,
  AIEndpointDefinition,
  AITool,
  ActionRecord,
  ActionService,
  ActionStatus,
  Card,
  CoreServices,
  ToolContext,
} from '../contracts'
import { AIError } from '../contracts'
import { access } from '../access'
import { isStaffRoles } from '../access/roles'
import { compactResult } from '../agent'

export const ACTIONS_SLUG = 'ai-actions'
export const ACTION_TTL_MS = 15 * 60_000

export const aiActionsCollection: CollectionConfig = {
  slug: ACTIONS_SLUG,
  labels: { singular: 'AI action', plural: 'AI actions' },
  admin: {
    group: 'AI Suite',
    useAsTitle: 'title',
    defaultColumns: ['title', 'tool', 'status', 'actorKind', 'createdAt'],
    description: 'Actions the AI proposed. Confirm-tier and staff-only tools run only after a person confirms.',
  },
  access: { read: access.staff, create: access.nobody, update: access.nobody, delete: access.superAdmin },
  timestamps: true,
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'summary', type: 'textarea' },
    { name: 'tool', type: 'text', required: true, index: true },
    { name: 'tier', type: 'select', options: ['confirm', 'staff'], required: true },
    { name: 'module', type: 'text' },
    { name: 'input', type: 'json' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'proposed',
      index: true,
      options: ['proposed', 'confirmed', 'done', 'rejected', 'failed', 'expired'],
    },
    { name: 'conversationId', type: 'text', index: true },
    { name: 'expiresAt', type: 'date', required: true },
    {
      type: 'collapsible',
      label: 'Proposer',
      fields: [
        { name: 'actorKind', type: 'text' },
        { name: 'userId', type: 'text', index: true },
        { name: 'customerHash', type: 'text', index: true },
        { name: 'visitorHash', type: 'text', index: true },
        { name: 'channelHash', type: 'text' },
      ],
    },
    { name: 'idempotencyKey', type: 'text', index: true },
    { name: 'confirmedBy', type: 'json' },
    { name: 'confirmedAt', type: 'date' },
    { name: 'result', type: 'json' },
    { name: 'error', type: 'text' },
    { name: 'requestId', type: 'text' },
    { name: 'locale', type: 'text' },
  ],
}

type ActionDoc = Record<string, any> & { id: string | number }

const toRecord = (d: ActionDoc): ActionRecord => ({
  id: String(d.id),
  tool: d.tool,
  input: d.input,
  status: d.status as ActionStatus,
  title: d.title,
  summary: d.summary ?? '',
  conversationId: d.conversationId ?? undefined,
  result: d.result ?? (d.error ? { error: d.error } : undefined),
  expiresAt: typeof d.expiresAt === 'string' ? d.expiresAt : new Date(d.expiresAt).toISOString(),
})

const isStaffCtx = (ctx: AIContext) => ctx.actor.kind === 'system' || (ctx.actor.kind === 'staff' && isStaffRoles(ctx.actor.roles))

const tenantField = (payload: Payload): string | undefined =>
  ((payload.config?.custom as Record<string, any> | undefined)?.aiSuite?.options?.tenant?.field as string | undefined) ?? undefined

export const createActionService = (svc: () => CoreServices, opts: { ttlMs?: number; now?: () => number } = {}): ActionService => {
  const now = opts.now ?? Date.now
  const ttl = opts.ttlMs ?? ACTION_TTL_MS

  const proposerOf = (ctx: AIContext) => {
    const a = ctx.actor
    const crypto = svc().crypto
    return {
      actorKind: a.kind,
      userId: a.user ? String(a.user.id) : undefined,
      customerHash: a.customerId ? crypto.hashId(a.customerId) : undefined,
      visitorHash: a.visitorId,
      channelHash: a.channel?.externalIdHash,
    }
  }

  /** The proposer (same customer/visitor/channel identity/user) or staff may act on an action. */
  const assertMayAct = (doc: ActionDoc, ctx: AIContext) => {
    if (doc.tier === 'staff') {
      if (!isStaffCtx(ctx)) throw new AIError('forbidden', 'Only staff can approve this action')
      return
    }
    if (isStaffCtx(ctx)) return
    const me = proposerOf(ctx)
    const same =
      (doc.customerHash && me.customerHash === doc.customerHash) ||
      (doc.userId && me.userId === doc.userId) ||
      (doc.visitorHash && me.visitorHash === doc.visitorHash && !doc.customerHash && !doc.userId) ||
      (doc.channelHash && me.channelHash === doc.channelHash)
    if (!same) throw new AIError('forbidden', 'This action belongs to someone else')
  }

  const load = async (payload: Payload, id: string): Promise<ActionDoc> => {
    try {
      return (await payload.findByID({ collection: ACTIONS_SLUG as any, id, overrideAccess: true, depth: 0 })) as unknown as ActionDoc
    } catch {
      throw new AIError('not_found', 'Action not found')
    }
  }

  const tenantMatches = (doc: ActionDoc, ctx: AIContext) => {
    const f = tenantField(ctx.payload)
    if (!f || ctx.tenant === undefined) return true
    const t = doc[f] && typeof doc[f] === 'object' ? doc[f].id : doc[f]
    return t == null || String(t) === String(ctx.tenant)
  }

  const update = async (payload: Payload, id: string | number, data: Record<string, unknown>) =>
    (await payload.update({ collection: ACTIONS_SLUG as any, id, data: data as any, overrideAccess: true, depth: 0 })) as unknown as ActionDoc

  return {
    async propose(tool: AITool, input: unknown, ctx: ToolContext, o?: { conversationId?: string }) {
      if (tool.tier !== 'confirm' && tool.tier !== 'staff') throw new AIError('bad_request', `Tool ${tool.name} does not need confirmation`)
      const d = tool.describeAction ? await tool.describeAction(input, ctx) : { title: tool.name, summary: '' }
      const expiresAt = new Date(now() + ttl).toISOString()
      const f = tenantField(ctx.payload)
      const doc = (await ctx.payload.create({
        collection: ACTIONS_SLUG as any,
        overrideAccess: true,
        data: {
          title: d.title,
          summary: d.summary,
          tool: tool.name,
          tier: tool.tier,
          module: ctx.module,
          input: input as any,
          status: 'proposed',
          conversationId: o?.conversationId,
          expiresAt,
          requestId: ctx.requestId,
          locale: ctx.locale,
          ...proposerOf(ctx),
          ...(f && ctx.tenant !== undefined ? { [f]: ctx.tenant } : {}),
        } as any,
      })) as unknown as ActionDoc
      const action = toRecord(doc)
      const card: Card = { type: 'confirmation', actionId: action.id, tool: tool.name, title: action.title, summary: action.summary, expiresAt }
      return { action, card }
    },

    async confirm(id, idempotencyKey, ctx) {
      if (!idempotencyKey || idempotencyKey.length > 200) throw new AIError('validation', 'Idempotency-Key header is required')
      const payload = ctx.payload
      let doc = await load(payload, id)
      if (!tenantMatches(doc, ctx)) throw new AIError('not_found', 'Action not found')
      assertMayAct(doc, ctx)
      if (doc.idempotencyKey === idempotencyKey && doc.status !== 'proposed') return toRecord(doc)
      if (doc.status !== 'proposed') throw new AIError('conflict', `Action is already ${doc.status}`)
      if (new Date(doc.expiresAt).getTime() < now()) {
        await update(payload, doc.id, { status: 'expired' })
        throw new AIError('conflict', 'This action has expired. Please ask again.', { details: { status: 'expired' } })
      }
      // Claim: only one confirmation may move it out of 'proposed'.
      const claimed = (await payload.update({
        collection: ACTIONS_SLUG as any,
        where: { and: [{ id: { equals: doc.id } }, { status: { equals: 'proposed' } }] },
        data: {
          status: 'confirmed',
          idempotencyKey,
          confirmedAt: new Date(now()).toISOString(),
          confirmedBy: { kind: ctx.actor.kind, userId: ctx.actor.user ? String(ctx.actor.user.id) : undefined },
        } as any,
        overrideAccess: true,
        depth: 0,
      })) as unknown as { docs: ActionDoc[] }
      if (!claimed.docs?.length) {
        doc = await load(payload, id)
        if (doc.idempotencyKey === idempotencyKey) return toRecord(doc)
        throw new AIError('conflict', `Action is already ${doc.status}`)
      }

      const services = svc()
      const tool = services.tools.get(doc.tool)
      let patch: Record<string, unknown>
      if (!tool) patch = { status: 'failed', error: 'Tool is no longer available' }
      else {
        try {
          const input = tool.input.parse(doc.input)
          const res = await tool.run(input, { ...ctx, services, actionId: String(doc.id) })
          patch = { status: 'done', result: compactResult(res.data) as any }
        } catch (e) {
          ctx.payload.logger?.warn?.({ err: e, requestId: ctx.requestId, msg: `[ai-suite] confirmed action ${doc.tool} failed` })
          patch = { status: 'failed', error: e instanceof AIError ? e.message : 'The action could not be completed' }
        }
      }
      const after = await update(payload, doc.id, patch)
      await services.audit
        .log(
          {
            action: 'action.confirm',
            target: { collection: ACTIONS_SLUG, id: doc.id },
            before: { status: 'proposed' },
            after: { status: after.status, result: after.result, error: after.error },
            meta: { tool: doc.tool, tier: doc.tier, idempotencyKey },
          },
          ctx,
        )
        .catch(() => undefined)
      return toRecord(after)
    },

    async reject(id, ctx) {
      const doc = await load(ctx.payload, id)
      if (!tenantMatches(doc, ctx)) throw new AIError('not_found', 'Action not found')
      assertMayAct(doc, ctx)
      if (doc.status === 'rejected') return toRecord(doc)
      if (doc.status !== 'proposed') throw new AIError('conflict', `Action is already ${doc.status}`)
      const after = await update(ctx.payload, doc.id, { status: 'rejected' })
      await svc()
        .audit.log({ action: 'action.reject', target: { collection: ACTIONS_SLUG, id: doc.id }, before: { status: 'proposed' }, after: { status: 'rejected' }, meta: { tool: doc.tool } }, ctx)
        .catch(() => undefined)
      return toRecord(after)
    },
  }
}

const resultMessage = (a: ActionRecord) =>
  a.status === 'done' ? 'Done.' : a.status === 'rejected' ? 'Cancelled.' : a.status === 'failed' ? "Sorry, that couldn't be completed." : `Status: ${a.status}`

const paramsInput = z.object({ params: z.object({ id: z.string().min(1).max(64) }) }).passthrough()

export const actionEndpoints: AIEndpointDefinition<any>[] = [
  {
    path: '/ai/actions/:id/confirm',
    method: 'post',
    module: 'core',
    access: 'anyone',
    budget: false,
    rateLimit: { limit: 20, windowSec: 60 },
    input: paramsInput,
    async handler({ ctx, services, input, req }) {
      const key = req.headers.get('idempotency-key')
      if (!key) throw new AIError('validation', 'Idempotency-Key header is required')
      const action = await services.actions.confirm(input.params.id, key, ctx)
      const card: Card = { type: 'action-result', actionId: action.id, status: action.status, message: resultMessage(action) }
      return { action, card, requestId: ctx.requestId }
    },
  },
  {
    path: '/ai/actions/:id/reject',
    method: 'post',
    module: 'core',
    access: 'anyone',
    budget: false,
    rateLimit: { limit: 20, windowSec: 60 },
    input: paramsInput,
    async handler({ ctx, services, input }) {
      const action = await services.actions.reject(input.params.id, ctx)
      const card: Card = { type: 'action-result', actionId: action.id, status: action.status, message: resultMessage(action) }
      return { action, card, requestId: ctx.requestId }
    },
  },
]
