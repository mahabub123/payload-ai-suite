import type { Payload, TaskConfig } from 'payload'
import type { AIContext, CoreServices } from 'payload-ai-core'
import { getAI } from 'payload-ai-core'
import type { ResolvedMarketingOptions } from '../options'
import { evaluateSegment } from '../segments/evaluate'
import { segmentDefinition } from '../segments/schema'
import { DAY_MS, MODULE, SLUGS, TASKS, queueJob } from '../util'
import { draftKey } from './send'
import { relId, type CampaignDoc, type CampaignKind, type Recipient } from './types'

const LOOKBACK_DAYS = 7
const HOUR = 3_600_000

const kindEnabled = (o: ResolvedMarketingOptions, k: CampaignKind): boolean =>
  ({
    'abandoned-cart': o.sequences.abandonedCart,
    welcome: o.sequences.welcome,
    'win-back': o.sequences.winBack,
    'post-purchase-review': o.sequences.postPurchaseReview,
    'one-off': false,
  })[k]

/** Who is due for step 0 of a triggered sequence right now. */
export const dueRecipients = async (campaign: CampaignDoc, payload: Payload, ctx: AIContext, now: Date): Promise<Recipient[]> => {
  const { cart, customer, order } = ctx.adapters
  const delay = (campaign.steps?.[0]?.delayHours ?? 0) * HOUR
  const t = now.getTime()
  const out: Recipient[] = []
  switch (campaign.kind) {
    case 'abandoned-cart': {
      if (!cart || !customer) return []
      const carts = await cart.listAbandoned({ olderThan: new Date(t - Math.max(delay, HOUR)), limit: 500 }, ctx.adapterCtx)
      for (const c of carts) {
        if (!c.customerId || !c.items?.length) continue
        if (c.updatedAt && Date.parse(c.updatedAt) < t - LOOKBACK_DAYS * DAY_MS) continue
        const cust = await customer.get(c.customerId, ctx.adapterCtx).catch(() => null)
        if (cust?.email) out.push({ email: cust.email, customerId: cust.id, name: cust.name, ref: `cart:${c.id}` })
      }
      return out
    }
    case 'welcome': {
      if (!customer) return []
      for await (const c of customer.iterate({ batchSize: 200 }, ctx.adapterCtx)) {
        const created = c.createdAt ? Date.parse(c.createdAt) : NaN
        if (!c.email || Number.isNaN(created)) continue
        if (created + delay <= t && created >= t - delay - LOOKBACK_DAYS * DAY_MS) out.push({ email: c.email, customerId: c.id, name: c.name })
      }
      return out
    }
    case 'post-purchase-review': {
      if (!order) return []
      for await (const o of order.iterate({ from: new Date(t - delay - LOOKBACK_DAYS * DAY_MS), to: new Date(t - delay), batchSize: 200 }, ctx.adapterCtx)) {
        let email = o.customerEmail
        let name: string | undefined
        if (!email && o.customerId && customer) {
          const c = await customer.get(o.customerId, ctx.adapterCtx).catch(() => null)
          email = c?.email
          name = c?.name
        }
        if (email) out.push({ email, customerId: o.customerId, name, ref: `order:${o.id}` })
      }
      return out
    }
    case 'win-back': {
      const segmentId = relId(campaign.segment)
      if (!segmentId) return []
      const seg = (await payload.findByID({ collection: SLUGS.segments as never, id: segmentId, depth: 0, overrideAccess: true })) as unknown as { definition?: unknown }
      const def = segmentDefinition.safeParse(seg?.definition)
      if (!def.success) return []
      const ev = await evaluateSegment(def.data, ctx.adapters, ctx.adapterCtx, { now })
      return ev.members.filter((m) => m.email).map((m) => ({ email: m.email!, customerId: m.customerId, name: m.name }))
    }
    default:
      return []
  }
}

/** Hourly: find recipients due for step 0 of each active sequence and queue sends (idempotency dedupes). */
export const runSequences = async (
  payload: Payload,
  services: CoreServices,
  options: ResolvedMarketingOptions,
  now: Date = new Date(),
): Promise<{ queued: number }> => {
  const { docs } = await payload.find({
    collection: SLUGS.campaigns as never,
    where: { and: [{ status: { in: ['approved', 'sending'] } }, { kind: { not_equals: 'one-off' } }] },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  let queued = 0
  for (const campaign of docs as unknown as CampaignDoc[]) {
    if (!kindEnabled(options, campaign.kind)) continue
    const tenant = relId(campaign.tenant)
    if (!(await services.isModuleEnabled(MODULE, payload, tenant))) continue
    const ctx = services.systemContext(payload, { module: MODULE, tenant })
    const due = await dueRecipients(campaign, payload, ctx, now)
    const fresh: Recipient[] = []
    for (const r of due) {
      const key = draftKey(services, String(campaign.id), 0, r)
      const existing = await payload.count({ collection: SLUGS.drafts as never, where: { idempotencyKey: { equals: key } }, overrideAccess: true })
      if (!existing.totalDocs) fresh.push(r)
    }
    for (let i = 0; i < fresh.length; i += 200) {
      await queueJob(payload, TASKS.send, { campaignId: String(campaign.id), stepIndex: 0, recipients: fresh.slice(i, i + 200), tenant })
      queued++
    }
  }
  return { queued }
}

export const sequencesTask = (options: ResolvedMarketingOptions): TaskConfig<any> => ({
  slug: TASKS.sequences,
  label: 'AI marketing: trigger sequences',
  retries: 2,
  async handler({ req }) {
    return { output: await runSequences(req.payload, getAI(req.payload), options) }
  },
})
