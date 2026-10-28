import type { Payload, PayloadRequest } from 'payload'
import { AIError, getAI, hasRole } from 'payload-ai-core'
import type { AIContext, CoreServices, SuiteRole, TaskClass } from 'payload-ai-core'
import { AUTOMATIONS, RUNS } from '../collections'
import { matchFilter } from '../filter'
import { api, getPath, hasDrafts, idOf } from '../local'
import { COPILOT_CONTEXT_FLAG, PROTECTED_FIELDS } from '../options'
import type { AutomationDefinition, RunStatus } from './types'

export const RUN_TASK = 'ai-copilot-automation-run'
export const DISPATCH_TASK = 'ai-copilot-automation-dispatch'

export interface RunDoc {
  id: string | number
  automation: string | number | AutomationDefinition
  status: RunStatus
  triggerCollection?: string
  triggerDocId?: string
  triggerOperation?: string
  inputs?: { doc?: Record<string, unknown>; tenant?: string | number; scheduledFor?: string }
  outputs?: Record<string, unknown>
  costMicros?: number
  tenant?: unknown
}

const MAX_SNAPSHOT_CHARS = 8000

const snapshot = (services: CoreServices | undefined, collection: string | undefined, doc: Record<string, unknown> | undefined) => {
  if (!doc) return undefined
  const redacted = services && collection ? services.guardrails.redact(collection, doc) : doc
  const json = JSON.stringify(redacted)
  return json.length <= MAX_SNAPSHOT_CHARS ? redacted : { id: doc.id, _truncated: json.slice(0, MAX_SNAPSHOT_CHARS) }
}

/** Create a queued run record and queue the run job. */
export const enqueueRun = async (
  payload: Payload,
  automation: AutomationDefinition,
  trigger: { collection?: string; docId?: string; operation?: string; doc?: Record<string, unknown>; tenant?: string | number; scheduledFor?: string },
  opts: { req?: PayloadRequest; tenantField?: string; services?: CoreServices } = {},
): Promise<string | number> => {
  const data: Record<string, unknown> = {
    automation: automation.id,
    triggerCollection: trigger.collection,
    triggerDocId: trigger.docId,
    triggerOperation: trigger.operation,
    status: 'queued',
    inputs: { doc: snapshot(opts.services, trigger.collection, trigger.doc), tenant: trigger.tenant, scheduledFor: trigger.scheduledFor },
    costMicros: 0,
  }
  if (opts.tenantField && trigger.tenant !== undefined) data[opts.tenantField] = trigger.tenant
  const run = await api(payload).create({ collection: RUNS, data, overrideAccess: true, req: opts.req, context: { [COPILOT_CONTEXT_FLAG]: true } })
  await api(payload).jobs.queue({ task: RUN_TASK, input: { runId: String(run.id) }, req: opts.req })
  return run.id
}

const updateRun = (payload: Payload, id: string | number, data: Record<string, unknown>) =>
  api(payload).update({ collection: RUNS, id, data, overrideAccess: true, depth: 0, context: { [COPILOT_CONTEXT_FLAG]: true } }) as Promise<RunDoc>

const loadRun = async (payload: Payload, id: string | number) => {
  const run = (await api(payload).findByID({ collection: RUNS, id, depth: 0, overrideAccess: true }).catch(() => null)) as RunDoc | null
  if (!run) throw new AIError('not_found', 'Automation run not found')
  const automation = (await api(payload)
    .findByID({ collection: AUTOMATIONS, id: idOf(run.automation)!, depth: 0, overrideAccess: true })
    .catch(() => null)) as AutomationDefinition | null
  if (!automation) throw new AIError('not_found', 'Automation not found')
  return { run, automation }
}

const DEFAULT_SYSTEM: Record<AutomationDefinition['steps'][number]['type'], { task: TaskClass; system: string }> = {
  classify: { task: 'fast', system: 'Classify the record. Reply with a single lowercase label and nothing else.' },
  summarize: { task: 'fast', system: 'Summarize the record in 2-3 plain sentences for a staff member.' },
  draft: { task: 'write', system: 'Write a concise draft based on the record. Plain text only.' },
  extract: { task: 'fast', system: 'Extract the requested data from the record. Reply with a single JSON object only.' },
}

const normalizeOutput = (type: string, text: string): unknown => {
  const t = text.trim()
  if (type === 'classify') return t.split('\n')[0].trim().toLowerCase().replace(/[.!"'`]+$/g, '').replace(/^["'`]+/, '')
  if (type === 'extract') {
    const m = t.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        return JSON.parse(m[0])
      } catch {
        /* fall through to raw text */
      }
    }
  }
  return t
}

/** Run the AI steps of a run. Pauses at awaiting-approval when required, otherwise performs the action. */
export const executeRun = async (
  payload: Payload,
  runId: string | number,
  opts: { services?: CoreServices; defaultApprovalRole?: SuiteRole } = {},
): Promise<RunDoc> => {
  const services = opts.services ?? getAI(payload)
  const { run, automation } = await loadRun(payload, runId)
  if (!['queued', 'running', 'failed'].includes(run.status)) return run
  const tenant = run.inputs?.tenant
  const ctx = services.systemContext(payload, { module: 'copilot', tenant })
  await updateRun(payload, run.id, { status: 'running', error: null })
  const outputs: Record<string, unknown> = {}
  let cost = 0
  try {
    const doc = run.inputs?.doc ?? {}
    for (const step of automation.steps ?? []) {
      const base = DEFAULT_SYSTEM[step.type]
      const docBlock = services.guardrails.quote('record', JSON.stringify(doc))
      const prior = Object.keys(outputs).length ? services.guardrails.quote('previous_outputs', JSON.stringify(outputs)) : ''
      let task: TaskClass = base.task
      let system = `${base.system}${step.instructions ? `\n\nInstructions: ${step.instructions}` : ''}`
      let prompt = `${docBlock}\n${prior}`.trim()
      let promptRef: { slug: string; version: number } | undefined
      if (step.promptSlug) {
        const r = await services.prompts.render(step.promptSlug, { doc, outputs, instructions: step.instructions ?? '' }, ctx)
        task = r.task
        system = r.system
        prompt = r.user ?? prompt
        promptRef = { slug: r.slug, version: r.version }
      }
      const res = await services.ai.generateText({ task, system, prompt, promptRef, maxOutputTokens: step.type === 'draft' ? 1200 : 400 }, ctx)
      cost += res.costMicros ?? 0
      outputs[step.outputKey] = normalizeOutput(step.type, res.text)
    }
    if (automation.approval?.required) {
      return await updateRun(payload, run.id, { status: 'awaiting-approval', outputs, costMicros: cost })
    }
    const actionResult = await performAction(payload, services, ctx, automation, { ...run, outputs })
    return await updateRun(payload, run.id, { status: 'done', outputs, costMicros: cost, actionResult })
  } catch (e) {
    await updateRun(payload, run.id, { status: 'failed', outputs, costMicros: cost, error: (e as Error).message })
    throw e
  }
}

const resolveMapping = (src: string, scope: Record<string, unknown>) =>
  /^(outputs|doc)\./.test(src) ? getPath(scope, src) : src

/** Perform the automation's action. Only called for runs that are not (or no longer) awaiting approval. */
export const performAction = async (
  payload: Payload,
  services: CoreServices,
  ctx: AIContext,
  automation: AutomationDefinition,
  run: Pick<RunDoc, 'id' | 'outputs' | 'inputs' | 'triggerCollection' | 'triggerDocId'>,
): Promise<Record<string, unknown>> => {
  const a = automation.action
  const scope = { outputs: run.outputs ?? {}, doc: run.inputs?.doc ?? {} }
  if (a.when && !matchFilter(a.when, scope)) return { skipped: true, reason: 'condition not met' }
  const local = api(payload)
  const auditCtx = { payload, tenant: ctx.tenant, requestId: ctx.requestId, actor: ctx.actor }
  if (a.type === 'notify') {
    const subject = a.subject || `[AI automation] ${automation.name}`
    const lines = Object.entries(scope.outputs).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    const text = [`Automation "${automation.name}"`, run.triggerCollection ? `Record: ${run.triggerCollection}/${run.triggerDocId}` : '', '', ...lines].join('\n')
    if (a.channel === 'email' && a.emailTo?.length) {
      await local.sendEmail({ to: a.emailTo.join(', '), subject, text })
    }
    await services.audit.log({ action: 'copilot.automation.notify', target: { collection: RUNS, id: run.id }, meta: { channel: a.channel ?? 'admin', subject } }, auditCtx)
    return { notified: a.channel ?? 'admin' }
  }
  if (a.type === 'create-draft') {
    if (!a.collection) throw new AIError('validation', 'create-draft action needs a collection')
    const data: Record<string, unknown> = {}
    for (const [target, src] of Object.entries(a.fieldMapping ?? {})) {
      if (PROTECTED_FIELDS.has(target)) continue
      data[target] = resolveMapping(src, scope)
    }
    const drafts = hasDrafts(payload, a.collection)
    if (drafts) data._status = 'draft'
    const created = await local.create({ collection: a.collection, data, draft: drafts, overrideAccess: true, context: { [COPILOT_CONTEXT_FLAG]: true } })
    await services.audit.log({ action: 'copilot.automation.create-draft', target: { collection: a.collection, id: created.id }, after: data }, auditCtx)
    return { created: { collection: a.collection, id: created.id } }
  }
  if (a.type === 'tag') {
    if (!a.field || !run.triggerCollection || !run.triggerDocId) throw new AIError('validation', 'tag action needs a field and a trigger document')
    if (PROTECTED_FIELDS.has(a.field)) throw new AIError('forbidden', `Field ${a.field} cannot be tagged`)
    const value = a.valueFrom ? scope.outputs[a.valueFrom] : undefined
    const before = await local.findByID({ collection: run.triggerCollection, id: run.triggerDocId, depth: 0, overrideAccess: true })
    const current = before?.[a.field]
    const next = Array.isArray(current) ? [...new Set([...current, value])] : value
    await local.update({
      collection: run.triggerCollection,
      id: run.triggerDocId,
      data: { [a.field]: next },
      overrideAccess: true,
      context: { [COPILOT_CONTEXT_FLAG]: true },
    })
    await services.audit.log(
      { action: 'copilot.automation.tag', target: { collection: run.triggerCollection, id: run.triggerDocId }, before: { [a.field]: current }, after: { [a.field]: next } },
      auditCtx,
    )
    return { tagged: { field: a.field, value: next } }
  }
  throw new AIError('validation', `Unknown action type`)
}

/** Approve or reject a run waiting for approval. Approve performs the action. Repeat calls are no-ops. */
export const decideRun = async (
  services: CoreServices,
  ctx: AIContext,
  runId: string | number,
  decision: 'approve' | 'reject',
  defaultApprovalRole: SuiteRole = 'store-admin',
): Promise<RunDoc> => {
  const payload = ctx.payload
  const { run, automation } = await loadRun(payload, runId)
  if (ctx.tenant !== undefined && run.inputs?.tenant !== undefined && String(run.inputs.tenant) !== String(ctx.tenant)) {
    throw new AIError('not_found', 'Automation run not found')
  }
  const role = (automation.approval?.role ?? defaultApprovalRole) as SuiteRole
  if (!hasRole(ctx.actor.roles, [role, 'store-admin'])) throw new AIError('forbidden', `Approving this automation requires the ${role} role`)
  const target: RunStatus = decision === 'approve' ? 'approved' : 'rejected'
  const settled: Record<string, RunStatus[]> = { approve: ['approved', 'done'], reject: ['rejected'] }
  if (settled[decision].includes(run.status)) return run
  if (run.status !== 'awaiting-approval') throw new AIError('conflict', `Run is ${run.status}`)
  const decidedBy = idOf(ctx.actor.user) ?? 'unknown'
  let updated = await updateRun(payload, run.id, { status: target, decidedBy, decidedAt: new Date().toISOString() })
  await services.audit.log(
    { action: `copilot.automation.${decision}`, target: { collection: RUNS, id: run.id }, meta: { automation: automation.id } },
    { payload, tenant: ctx.tenant, requestId: ctx.requestId, actor: ctx.actor },
  )
  if (decision === 'approve') {
    const sys = services.systemContext(payload, { module: 'copilot', tenant: run.inputs?.tenant })
    try {
      const actionResult = await performAction(payload, services, { ...sys, requestId: ctx.requestId, actor: ctx.actor }, automation, run)
      updated = await updateRun(payload, run.id, { status: 'done', actionResult })
    } catch (e) {
      updated = await updateRun(payload, run.id, { status: 'failed', error: (e as Error).message })
    }
  }
  return updated
}
