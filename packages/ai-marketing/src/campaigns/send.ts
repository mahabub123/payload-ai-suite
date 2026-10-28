import type { Payload, TaskConfig } from 'payload'
import type { AIContext, CoreServices } from '@payload-ai-suite/ai-core'
import { getAI } from '@payload-ai-suite/ai-core'
import type { ResolvedMarketingOptions } from '../options'
import { evaluateSegment } from '../segments/evaluate'
import { segmentDefinition } from '../segments/schema'
import { DAY_MS, MODULE, SLUGS, TASKS, contentHash, escapeHtml, formatMoney, normEmail, queueJob, startOfUtcDay } from '../util'
import { createUnsubscribeToken, loadUnsubscribed, unsubscribeUrl } from './unsubscribe'
import {
  SEQUENCE_KINDS,
  relId,
  type CampaignDoc,
  type CampaignStep,
  type DraftStatus,
  type ProductBlock,
  type Recipient,
} from './types'

/** What approval pins. Any edit to these after approval blocks sending until re-approved. */
export const approvalHash = (c: Pick<CampaignDoc, 'kind' | 'segment' | 'steps'>): string =>
  contentHash({
    kind: c.kind,
    segment: relId(c.segment) ?? null,
    steps: (c.steps ?? []).map((s) => ({
      delayHours: s.delayHours ?? 0,
      chosenSubject: s.chosenSubject ?? null,
      subjects: (s.subjectVariants ?? []).map((v) => v.subject),
      html: s.html ?? '',
      text: s.text ?? '',
      productBlocks: (s.productBlocks ?? []).map((p) => p.offeringId),
    })),
  })

export const subjectOf = (step: CampaignStep): string | undefined =>
  step.chosenSubject?.trim() || step.subjectVariants?.find((v) => v.subject?.trim())?.subject

/** SMTP 5xx / invalid recipient / 4xx from HTTP email APIs (except 429) are permanent; everything else is retried. */
export const isPermanentEmailError = (e: unknown): boolean => {
  const err = (e ?? {}) as { responseCode?: unknown; code?: unknown; statusCode?: unknown; status?: unknown; message?: unknown }
  if (typeof err.responseCode === 'number') return err.responseCode >= 500 && err.responseCode < 600
  if (err.code === 'EENVELOPE' || err.code === 'EMESSAGE') return true
  const http = typeof err.statusCode === 'number' ? err.statusCode : typeof err.status === 'number' ? err.status : undefined
  if (http !== undefined) return http >= 400 && http < 500 && http !== 408 && http !== 429
  return /invalid (recipient|address|email)|bad (recipient|address)|mailbox (unavailable|not found)|no such user|user unknown|does not exist/i.test(
    String(err.message ?? ''),
  )
}

const productBlocksHtml = (blocks: ProductBlock[]): string => {
  if (!blocks.length) return ''
  const cells = blocks
    .map((b) => {
      const img = b.imageUrl ? `<img src="${escapeHtml(b.imageUrl)}" alt="${escapeHtml(b.title)}" width="160" style="display:block;max-width:100%">` : ''
      const price = b.price ? `<div>${escapeHtml(formatMoney(b.price))}</div>` : ''
      const title = b.url ? `<a href="${escapeHtml(b.url)}">${escapeHtml(b.title)}</a>` : escapeHtml(b.title)
      return `<td style="padding:8px;vertical-align:top;width:${Math.floor(100 / blocks.length)}%">${img}<div>${title}</div>${price}</td>`
    })
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`
}

const productBlocksText = (blocks: ProductBlock[]): string =>
  blocks.map((b) => `- ${b.title}${b.price ? ` — ${formatMoney(b.price)}` : ''}${b.url ? ` ${b.url}` : ''}`).join('\n')

/** Prices/stock come from the offering adapter at send time, falling back to the drafted snapshot. */
const refreshBlocks = async (blocks: ProductBlock[], ctx: AIContext): Promise<ProductBlock[]> => {
  const offering = ctx.adapters.offering
  if (!offering || !blocks.length) return blocks
  const out: ProductBlock[] = []
  for (const b of blocks) {
    const o = await offering.get(b.offeringId, ctx.adapterCtx).catch(() => null)
    if (!o) continue
    if (o.inStock === false) continue
    out.push({ offeringId: o.id, title: o.title, url: o.url ?? b.url, imageUrl: o.imageUrl ?? b.imageUrl, price: o.price ?? b.price })
  }
  return out
}

export const buildEmail = (
  step: CampaignStep,
  recipient: Recipient,
  blocks: ProductBlock[],
  unsubscribe: string,
): { subject: string; html: string; text: string; headers: Record<string, string> } => {
  const name = recipient.name?.trim() || 'there'
  const html = (step.html ?? '').replace(/\{\{\s*name\s*\}\}/g, escapeHtml(name))
  const text = (step.text ?? '').replace(/\{\{\s*name\s*\}\}/g, name)
  const subject = (subjectOf(step) ?? '').replace(/\{\{\s*name\s*\}\}/g, name)
  const footer = `<p style="font-size:12px;color:#666;margin-top:24px">You receive this email because you are a customer of our store. <a href="${escapeHtml(unsubscribe)}">Unsubscribe</a></p>`
  return {
    subject,
    html: `${html}${productBlocksHtml(blocks)}${footer}`,
    text: [text, productBlocksText(blocks), `Unsubscribe: ${unsubscribe}`].filter(Boolean).join('\n\n'),
    headers: {
      'List-Unsubscribe': `<${unsubscribe}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }
}

export interface SendInput {
  campaignId: string
  stepIndex?: number
  recipients?: Recipient[]
  tenant?: string | number
}

export interface SendResult {
  status: 'done' | 'skipped' | 'partial'
  reason?: string
  sent: number
  skipped: number
  failed: number
  deferred: number
  transient: number
}

export const draftKey = (services: CoreServices, campaignId: string, step: number, r: Recipient) =>
  services.crypto.hashId(`${campaignId}:${step}:${normEmail(r.email)}${r.ref ? `:${r.ref}` : ''}`)

const findDraft = async (payload: Payload, key: string) => {
  const res = await payload.find({
    collection: SLUGS.drafts as never,
    where: { idempotencyKey: { equals: key } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return res.docs[0] as unknown as { id: string | number; status: DraftStatus; attempts?: number } | undefined
}

const updateDraft = (payload: Payload, id: string | number, data: Record<string, unknown>) =>
  payload.update({ collection: SLUGS.drafts as never, id, data: data as never, overrideAccess: true })

/** Recipients of a segment campaign; later steps go only to people who received the first step. */
const segmentRecipients = async (payload: Payload, campaign: CampaignDoc, step: number, ctx: AIContext): Promise<Recipient[]> => {
  if (step > 0) {
    const out: Recipient[] = []
    let pageNo = 1
    for (;;) {
      const res = await payload.find({
        collection: SLUGS.drafts as never,
        where: { and: [{ campaign: { equals: campaign.id } }, { step: { equals: 0 } }, { status: { equals: 'sent' } }] },
        limit: 500,
        page: pageNo,
        depth: 0,
        overrideAccess: true,
      })
      for (const d of res.docs as unknown as { email?: string; customerId?: string; ref?: string }[])
        if (d.email) out.push({ email: d.email, customerId: d.customerId, ref: d.ref })
      if (!res.hasNextPage) break
      pageNo++
    }
    return out
  }
  const segmentId = relId(campaign.segment)
  if (!segmentId) return []
  const seg = (await payload.findByID({ collection: SLUGS.segments as never, id: segmentId, depth: 0, overrideAccess: true })) as unknown as {
    definition?: unknown
  }
  const def = segmentDefinition.parse(seg.definition)
  const evaluation = await evaluateSegment(def, ctx.adapters, ctx.adapterCtx)
  return evaluation.members
    .filter((m) => m.email)
    .map((m) => ({ email: m.email!, customerId: m.customerId, name: m.name, marketingOptIn: m.marketingOptIn }))
}

/**
 * Send one campaign step. Idempotent per (campaign, step, recipient[, ref]): re-running never sends twice.
 * Throws only when some recipients hit transient errors, so the Jobs Queue retries just those.
 */
export const sendCampaignStep = async (
  payload: Payload,
  services: CoreServices,
  options: ResolvedMarketingOptions,
  input: SendInput,
  now: Date = new Date(),
): Promise<SendResult> => {
  const stepIndex = input.stepIndex ?? 0
  const result: SendResult = { status: 'done', sent: 0, skipped: 0, failed: 0, deferred: 0, transient: 0 }
  const campaign = (await payload
    .findByID({ collection: SLUGS.campaigns as never, id: input.campaignId, depth: 0, overrideAccess: true })
    .catch(() => null)) as unknown as CampaignDoc | null
  if (!campaign) return { ...result, status: 'skipped', reason: 'not-found' }
  const tenant = input.tenant ?? relId(campaign.tenant)
  if (!(await services.isModuleEnabled(MODULE, payload, tenant))) return { ...result, status: 'skipped', reason: 'module-disabled' }

  // Approval gate: nothing is sent unless approved and unchanged since approval.
  if (!['approved', 'scheduled', 'sending'].includes(campaign.status) || !campaign.approvedAt) {
    return { ...result, status: 'skipped', reason: campaign.status === 'paused' ? 'paused' : 'not-approved' }
  }
  if (campaign.approvedHash !== approvalHash(campaign)) {
    await payload.update({
      collection: SLUGS.campaigns as never,
      id: campaign.id,
      data: { status: 'pending-approval' } as never,
      overrideAccess: true,
    })
    return { ...result, status: 'skipped', reason: 'changed-after-approval' }
  }
  const step = campaign.steps?.[stepIndex]
  if (!step || !subjectOf(step) || !step.html) return { ...result, status: 'skipped', reason: 'no-step' }

  const isSequence = SEQUENCE_KINDS.includes(campaign.kind)
  if (!isSequence && campaign.status !== 'sending') {
    await payload.update({ collection: SLUGS.campaigns as never, id: campaign.id, data: { status: 'sending' } as never, overrideAccess: true })
  }

  const ctx = services.systemContext(payload, { module: MODULE, tenant })
  let recipients = input.recipients ?? (await segmentRecipients(payload, campaign, stepIndex, ctx))
  if (campaign.kind === 'abandoned-cart' && stepIndex > 0 && ctx.adapters.cart) {
    // Follow-ups only while the cart is still abandoned.
    const still = await ctx.adapters.cart.listAbandoned({ olderThan: new Date(now.getTime() - 3_600_000), limit: 5000 }, ctx.adapterCtx)
    const ids = new Set(still.map((c) => String(c.id)))
    recipients = recipients.filter((r) => !r.ref || ids.has(r.ref))
  }
  const unsubscribed = await loadUnsubscribed(payload, tenant)
  const blocks = await refreshBlocks(step.productBlocks ?? [], ctx)

  const sentToday = await payload.count({
    collection: SLUGS.drafts as never,
    where: { and: [{ status: { equals: 'sent' } }, { sentAt: { greater_than_equal: startOfUtcDay(now).toISOString() } }] },
    overrideAccess: true,
  })
  let remaining = Math.max(0, options.dailySendLimit - sentToday.totalDocs)
  const base = options.unsubscribeUrlBase ?? `${payload.config.serverURL ?? ''}/api/ai/marketing/unsubscribe`
  const campaignId = String(campaign.id)
  const seen = new Set<string>()
  const delivered: Recipient[] = []

  for (const r of recipients as (Recipient & { marketingOptIn?: boolean })[]) {
    if (!r.email || !/^[^\s@]+@[^\s@]+$/.test(r.email)) continue
    const key = draftKey(services, campaignId, stepIndex, r)
    if (seen.has(key)) continue
    seen.add(key)

    let draft = await findDraft(payload, key)
    if (draft && draft.status !== 'queued') {
      if (draft.status === 'sent') delivered.push(r)
      if (draft.status === 'sending') {
        // A previous run crashed mid-send: the outcome is unknown, so never risk a second email.
        await updateDraft(payload, draft.id, { status: 'failed', error: 'Outcome unknown after interrupted send; not retried' })
        result.failed++
      }
      continue
    }

    const emailHash = services.crypto.hashId(normEmail(r.email))
    let optedOut = unsubscribed.has(emailHash) || r.marketingOptIn === false
    if (!optedOut && r.marketingOptIn === undefined && r.customerId && ctx.adapters.customer) {
      const c = await ctx.adapters.customer.get(r.customerId, ctx.adapterCtx).catch(() => null)
      optedOut = c?.marketingOptIn === false
    }

    if (!draft) {
      const data = {
        campaign: campaign.id,
        step: stepIndex,
        recipientHash: emailHash,
        email: normEmail(r.email),
        customerId: r.customerId,
        ref: r.ref,
        subject: subjectOf(step),
        idempotencyKey: key,
        status: optedOut ? 'skipped' : 'queued',
        error: optedOut ? 'unsubscribed or opted out' : undefined,
        attempts: 0,
        ...(tenant !== undefined ? { tenant } : {}),
      }
      try {
        draft = (await payload.create({ collection: SLUGS.drafts as never, data: data as never, overrideAccess: true })) as never
      } catch (e) {
        // Unique idempotencyKey: another worker created it first.
        if (await findDraft(payload, key)) continue
        throw e
      }
      if (optedOut) {
        result.skipped++
        continue
      }
    } else if (optedOut) {
      await updateDraft(payload, draft.id, { status: 'skipped', error: 'unsubscribed or opted out' })
      result.skipped++
      continue
    }

    if (remaining <= 0) {
      result.deferred++
      continue
    }

    const d = draft!
    await updateDraft(payload, d.id, { status: 'sending', attempts: (d.attempts ?? 0) + 1 })
    const token = createUnsubscribeToken(services.crypto, r.email, { campaignId, tenant })
    const email = buildEmail(step, r, blocks, unsubscribeUrl(base, token))
    try {
      await payload.sendEmail({
        to: r.email,
        ...(options.fromAddress ? { from: options.fromAddress } : {}),
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: email.headers,
      })
      await updateDraft(payload, d.id, { status: 'sent', sentAt: new Date().toISOString(), html: email.html, text: email.text, error: null })
      remaining--
      result.sent++
      delivered.push(r)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (isPermanentEmailError(e)) {
        await updateDraft(payload, d.id, { status: 'failed', error: message.slice(0, 500) })
        result.failed++
      } else {
        await updateDraft(payload, d.id, { status: 'queued', error: message.slice(0, 500) })
        result.transient++
      }
    }
  }

  if (result.deferred > 0) {
    // Daily limit reached: continue tomorrow (UTC) with the same input; idempotency skips those already sent.
    await queueJob(payload, TASKS.send, { ...input, stepIndex }, { waitUntil: new Date(startOfUtcDay(now).getTime() + DAY_MS + 60_000) })
    result.status = 'partial'
  }
  if (result.transient > 0) {
    throw Object.assign(new Error(`${result.transient} transient email failure(s); will retry`), { result })
  }
  if (result.deferred === 0) {
    const next = campaign.steps?.[stepIndex + 1]
    if (next && (!input.recipients || delivered.length > 0)) {
      await queueJob(
        payload,
        TASKS.send,
        { campaignId, stepIndex: stepIndex + 1, recipients: input.recipients ? delivered.map(({ email, customerId, name, ref }) => ({ email, customerId, name, ref })) : undefined, tenant },
        { waitUntil: new Date(now.getTime() + (next.delayHours ?? 0) * 3_600_000) },
      )
    } else if (!isSequence) {
      await payload.update({ collection: SLUGS.campaigns as never, id: campaign.id, data: { status: 'sent' } as never, overrideAccess: true })
    }
  }
  return result
}

export const sendTask = (options: ResolvedMarketingOptions): TaskConfig<any> => ({
  slug: TASKS.send,
  label: 'AI marketing: send campaign step',
  retries: { attempts: 4, backoff: { type: 'exponential', delay: 60_000 } },
  async handler({ input, req }) {
    const out = await sendCampaignStep(req.payload, getAI(req.payload), options, input as SendInput)
    return { output: out }
  },
})
