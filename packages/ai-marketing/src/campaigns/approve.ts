import { z } from 'zod'
import type { AIContext, AIEndpointDefinition, CoreServices } from '@payload-ai-suite/ai-core'
import { AIError } from '@payload-ai-suite/ai-core'
import type { PayloadRequest } from 'payload'
import type { ResolvedMarketingOptions } from '../options'
import { MODULE, SLUGS, TASKS, paramId, queueJob, userId } from '../util'
import { approvalHash, subjectOf } from './send'
import { SEQUENCE_KINDS, relId, type CampaignDoc } from './types'

const approveInput = z.object({
  params: z.object({ id: z.union([z.string(), z.number()]).transform(String) }).optional(),
  /** ISO date-time; omitted = send now (one-off) / activate now (sequence). */
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  /** Pick the subject per step at approval time (index into subjectVariants). */
  chosenSubjects: z.array(z.string().min(1).max(200).nullable()).optional(),
})
type ApproveInput = z.infer<typeof approveInput>

/** Validation a campaign must pass before it can be approved. */
export const approvalProblems = (c: CampaignDoc): string[] => {
  const problems: string[] = []
  if (!c.steps?.length) problems.push('Campaign has no steps')
  c.steps?.forEach((s, i) => {
    if (!subjectOf(s)) problems.push(`Step ${i + 1} has no subject`)
    if (!s.html?.trim()) problems.push(`Step ${i + 1} has no body`)
  })
  if ((c.kind === 'one-off' || c.kind === 'win-back') && !relId(c.segment)) problems.push('Choose a segment')
  return problems
}

export const approveCampaign = async (
  ctx: AIContext,
  services: CoreServices,
  options: ResolvedMarketingOptions,
  campaignId: string,
  input: Omit<ApproveInput, 'params'>,
  req?: PayloadRequest,
): Promise<{ id: string; status: string; scheduledAt?: string }> => {
  const { payload } = ctx
  const campaign = (await payload.findByID({
    collection: SLUGS.campaigns as never,
    id: campaignId,
    depth: 0,
    overrideAccess: !req,
    req,
  })) as unknown as CampaignDoc | null
  if (!campaign) throw new AIError('not_found', 'Campaign not found')
  if (!['draft', 'pending-approval', 'paused'].includes(campaign.status)) {
    throw new AIError('conflict', `Campaign is ${campaign.status}`)
  }
  const approver = userId(req) ?? (ctx.actor.user?.id !== undefined ? String(ctx.actor.user.id) : undefined)
  if (!approver) throw new AIError('forbidden', 'Approval needs a signed-in user')
  if (options.fourEyes && campaign.author && campaign.author === approver) {
    throw new AIError('forbidden', 'The author of a campaign cannot approve it (four-eyes rule)')
  }

  let steps = campaign.steps ?? []
  if (input.chosenSubjects) {
    steps = steps.map((s, i) => {
      const chosen = input.chosenSubjects?.[i]
      if (chosen == null) return s
      if (!(s.subjectVariants ?? []).some((v) => v.subject === chosen) && chosen !== s.chosenSubject) {
        throw new AIError('validation', `Step ${i + 1}: subject must be one of the variants`)
      }
      return { ...s, chosenSubject: chosen }
    })
  }
  const next: CampaignDoc = { ...campaign, steps }
  const problems = approvalProblems(next)
  if (problems.length) throw new AIError('validation', 'Campaign is not ready', { details: problems })

  const when = input.scheduledAt ? new Date(input.scheduledAt) : undefined
  const future = when && when.getTime() > Date.now() ? when : undefined
  const after = {
    steps,
    status: future ? 'scheduled' : 'approved',
    approvedBy: approver,
    approvedAt: new Date().toISOString(),
    approvedHash: approvalHash(next),
    scheduledAt: future ? future.toISOString() : campaign.scheduledAt ?? null,
  }
  await payload.update({ collection: SLUGS.campaigns as never, id: campaign.id, data: after as never, overrideAccess: true })
  await services.audit.log(
    {
      action: 'marketing.campaign.approve',
      target: { collection: SLUGS.campaigns, id: campaign.id },
      before: { status: campaign.status, approvedBy: campaign.approvedBy ?? null },
      after: { status: after.status, approvedBy: approver, scheduledAt: after.scheduledAt, approvedHash: after.approvedHash },
    },
    ctx,
  )
  // Sequences are sent by the trigger job; one-off campaigns are queued now.
  if (!SEQUENCE_KINDS.includes(campaign.kind)) {
    await queueJob(payload, TASKS.send, { campaignId: String(campaign.id), stepIndex: 0, tenant: ctx.tenant }, { waitUntil: future })
  }
  return { id: String(campaign.id), status: after.status, scheduledAt: after.scheduledAt ?? undefined }
}

export const approveEndpoint = (options: ResolvedMarketingOptions): AIEndpointDefinition<ApproveInput> => ({
  path: '/ai/marketing/campaigns/:id/approve',
  method: 'post',
  module: MODULE,
  access: [options.approvalRole, 'store-admin'],
  surface: 'admin',
  budget: false,
  input: approveInput,
  handler: ({ ctx, services, input, req }) => approveCampaign(ctx, services, options, paramId(input, req), input, req),
})

const pauseInput = z.object({
  params: z.object({ id: z.union([z.string(), z.number()]).transform(String) }).optional(),
  paused: z.boolean(),
})

/** Pause stops further sends immediately (the send job checks status); resuming requires approval again. */
export const pauseEndpoint = (options: ResolvedMarketingOptions): AIEndpointDefinition<z.infer<typeof pauseInput>> => ({
  path: '/ai/marketing/campaigns/:id/pause',
  method: 'post',
  module: MODULE,
  access: [options.approvalRole, 'store-admin'],
  surface: 'admin',
  budget: false,
  input: pauseInput,
  async handler({ ctx, services, input, req }) {
    const id = paramId(input, req)
    const campaign = (await ctx.payload.findByID({ collection: SLUGS.campaigns as never, id, depth: 0, req, overrideAccess: false })) as unknown as CampaignDoc
    const status = input.paused ? 'paused' : 'pending-approval'
    await ctx.payload.update({
      collection: SLUGS.campaigns as never,
      id,
      data: (input.paused ? { status } : { status, approvedAt: null, approvedBy: null, approvedHash: null }) as never,
      overrideAccess: true,
    })
    await services.audit.log(
      { action: input.paused ? 'marketing.campaign.pause' : 'marketing.campaign.unpause', target: { collection: SLUGS.campaigns, id }, before: { status: campaign.status }, after: { status } },
      ctx,
    )
    return { id, status }
  },
})

/** Author asks for approval: draft -> pending-approval. */
export const requestApprovalEndpoint: AIEndpointDefinition<{ params?: { id: string } }> = {
  path: '/ai/marketing/campaigns/:id/request-approval',
  method: 'post',
  module: MODULE,
  access: 'staff',
  surface: 'admin',
  budget: false,
  input: z.object({ params: z.object({ id: z.union([z.string(), z.number()]).transform(String) }).optional() }),
  async handler({ ctx, services, input, req }) {
    const id = paramId(input, req)
    const campaign = (await ctx.payload.findByID({ collection: SLUGS.campaigns as never, id, depth: 0, req, overrideAccess: false })) as unknown as CampaignDoc
    if (campaign.status !== 'draft') throw new AIError('conflict', `Campaign is ${campaign.status}`)
    const problems = approvalProblems(campaign)
    if (problems.length) throw new AIError('validation', 'Campaign is not ready', { details: problems })
    await ctx.payload.update({ collection: SLUGS.campaigns as never, id, data: { status: 'pending-approval' } as never, overrideAccess: true })
    await services.audit.log({ action: 'marketing.campaign.request-approval', target: { collection: SLUGS.campaigns, id } }, ctx)
    return { id, status: 'pending-approval' }
  },
}
