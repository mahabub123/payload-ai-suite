import { describe, expect, it } from 'vitest'
import { setup } from '../../test/setup'
import { approveCampaign } from './approve'
import { isPermanentEmailError, sendCampaignStep, approvalHash } from './send'
import { createUnsubscribeToken, unsubscribeGetEndpoint, verifyUnsubscribeToken } from './unsubscribe'
import { draftsEndpoint } from './compose'
import { runSequences } from './sequences'
import { SLUGS, TASKS } from '../util'
import type { AiMarketingOptions } from '../options'
import type { CampaignDoc } from './types'

const step = {
  delayHours: 0,
  subjectVariants: [{ subject: 'Hello {{name}}' }, { subject: 'New in store' }, { subject: 'Just for you' }],
  chosenSubject: null,
  html: '<p>Hi {{name}}</p>',
  text: 'Hi {{name}}',
  productBlocks: [],
}

const seed = async (opts: AiMarketingOptions = {}, campaign: Partial<CampaignDoc> = {}) => {
  const env = setup(opts)
  const seg = await env.payload.create({
    collection: SLUGS.segments as never,
    data: { name: 'Opted in', definition: { match: 'all', conditions: [{ type: 'marketingOptIn', value: true }] } } as never,
  })
  const c = (await env.payload.create({
    collection: SLUGS.campaigns as never,
    data: { name: 'Spring', kind: 'one-off', segment: seg.id, steps: [step], status: 'draft', author: 'u-author', ...campaign } as never,
  })) as unknown as CampaignDoc
  const approve = (by = 'u-approver', input = {}) =>
    approveCampaign(env.staff(by), env.services, env.options, String(c.id), input, env.req(by))
  const send = (input: Partial<Parameters<typeof sendCampaignStep>[3]> = {}, now?: Date) =>
    sendCampaignStep(env.payload, env.services, env.options, { campaignId: String(c.id), stepIndex: 0, ...input }, now)
  const drafts = () => [...env.payload.db_.get(SLUGS.drafts)!.values()]
  const campaignDoc = () => env.payload.db_.get(SLUGS.campaigns)!.get(String(c.id))!
  return { ...env, campaign: c, approve, send, drafts, campaignDoc }
}

describe('approval gate', () => {
  it('does not send a campaign that is not approved', async () => {
    const t = await seed()
    const r = await t.send()
    expect(r).toMatchObject({ status: 'skipped', reason: 'not-approved', sent: 0 })
    expect(t.payload.emails).toHaveLength(0)
  })

  it('approve records approver, audits and queues the send job', async () => {
    const t = await seed()
    const out = await t.approve('u-approver', { chosenSubjects: ['New in store'] })
    expect(out.status).toBe('approved')
    expect(t.campaignDoc()).toMatchObject({ approvedBy: 'u-approver', status: 'approved' })
    expect(t.campaignDoc().steps[0].chosenSubject).toBe('New in store')
    expect(t.services.log.audit).toEqual([expect.objectContaining({ action: 'marketing.campaign.approve' })])
    expect(t.payload.jobs_).toEqual([expect.objectContaining({ task: TASKS.send, input: expect.objectContaining({ stepIndex: 0 }) })])
  })

  it('rejects subjects that are not one of the variants', async () => {
    const t = await seed()
    await expect(t.approve('u-approver', { chosenSubjects: ['Totally different'] })).rejects.toMatchObject({ code: 'validation' })
  })

  it('four-eyes: the author cannot approve', async () => {
    const t = await seed({ fourEyes: true })
    await expect(t.approve('u-author')).rejects.toMatchObject({ code: 'forbidden' })
    await expect(t.approve('u-other')).resolves.toMatchObject({ status: 'approved' })
  })

  it('content edited after approval blocks sending', async () => {
    const t = await seed()
    await t.approve()
    const doc = t.campaignDoc()
    doc.steps[0].html = '<p>sneaky edit</p>'
    expect(approvalHash(doc as CampaignDoc)).not.toBe(doc.approvedHash)
    const r = await t.send()
    expect(r.reason).toBe('changed-after-approval')
    expect(t.payload.emails).toHaveLength(0)
  })
})

describe('sending', () => {
  it('sends once per recipient even when the job re-runs', async () => {
    const t = await seed()
    await t.approve()
    const first = await t.send()
    expect(first.sent).toBe(3) // alice, bob, dan (carol opted out is not in the segment)
    const second = await t.send()
    expect(second.sent).toBe(0)
    expect(t.payload.emails).toHaveLength(3)
    expect(new Set(t.drafts().map((d) => d.idempotencyKey)).size).toBe(t.drafts().length)
    expect(t.campaignDoc().status).toBe('sent')
  })

  it('every email has an unsubscribe link and List-Unsubscribe headers, personalised subject', async () => {
    const t = await seed()
    await t.approve()
    await t.send()
    const mail = t.payload.emails.find((m) => m.to === 'alice@example.com')!
    expect(mail.subject).toBe('Hello Alice')
    expect(mail.html).toContain('/api/ai/marketing/unsubscribe?token=')
    expect(mail.text).toContain('Unsubscribe: https://shop.test/api/ai/marketing/unsubscribe?token=')
    expect(mail.headers['List-Unsubscribe']).toMatch(/^<https:\/\/shop\.test\/api\/ai\/marketing\/unsubscribe\?token=.+>$/)
    expect(mail.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
  })

  it('skips unsubscribed recipients and explicitly opted-out customers', async () => {
    const t = await seed()
    const token = createUnsubscribeToken(t.services.crypto, 'Bob@Example.com')
    const res = (await unsubscribeGetEndpoint.handler({ ctx: t.staff('x'), services: t.services, input: { token }, req: t.req('x') })) as Response
    expect(res.status).toBe(200)
    await t.approve()
    // explicit recipient list including an opted-out customer
    const r = await t.send({
      recipients: [
        { email: 'alice@example.com', customerId: 'c1' },
        { email: 'bob@example.com', customerId: 'c2' },
        { email: 'carol@example.com', customerId: 'c3' },
      ],
    })
    expect(r).toMatchObject({ sent: 1, skipped: 2 })
    expect(t.payload.emails.map((m) => m.to)).toEqual(['alice@example.com'])
  })

  it('rejects tampered unsubscribe tokens', async () => {
    const t = await seed()
    const token = createUnsubscribeToken(t.services.crypto, 'bob@example.com')
    expect(verifyUnsubscribeToken(t.services.crypto, token)?.email).toBe('bob@example.com')
    const [body, sig] = token.split('.')
    const forged = `${Buffer.from(JSON.stringify({ e: t.services.crypto.encrypt('alice@example.com') })).toString('base64url')}.${sig}`
    expect(verifyUnsubscribeToken(t.services.crypto, forged)).toBeNull()
    expect(verifyUnsubscribeToken(t.services.crypto, `${body}.deadbeef`)).toBeNull()
    const res = (await unsubscribeGetEndpoint.handler({ ctx: t.staff('x'), services: t.services, input: { token: forged }, req: t.req('x') })) as Response
    expect(res.status).toBe(400)
  })

  it('enforces the daily send limit and continues tomorrow', async () => {
    const t = await seed({ dailySendLimit: 2 })
    await t.approve()
    t.payload.jobs_.length = 0
    const now = new Date('2026-10-28T10:00:00Z')
    const r = await t.send({}, now)
    expect(r).toMatchObject({ sent: 2, deferred: 1, status: 'partial' })
    expect(t.payload.jobs_).toHaveLength(1)
    expect(t.payload.jobs_[0].waitUntil!.toISOString()).toBe('2026-10-29T00:01:00.000Z')
    expect(t.campaignDoc().status).toBe('sending')
  })

  it('permanent failures are not retried; transient failures are retried and sent once', async () => {
    const t = await seed()
    await t.approve()
    t.payload.failEmail.set('alice@example.com', { error: Object.assign(new Error('550 5.1.1 user unknown'), { responseCode: 550 }) })
    t.payload.failEmail.set('bob@example.com', { error: Object.assign(new Error('connection timeout'), { code: 'ETIMEDOUT' }), once: true })
    await expect(t.send()).rejects.toThrow(/transient/)
    const byEmail = () => Object.fromEntries(t.drafts().map((d) => [d.email, d.status]))
    expect(byEmail()).toEqual({ 'alice@example.com': 'failed', 'bob@example.com': 'queued', 'dan@example.com': 'sent' })
    // job retry
    const r = await t.send()
    expect(r.sent).toBe(1)
    expect(byEmail()).toEqual({ 'alice@example.com': 'failed', 'bob@example.com': 'sent', 'dan@example.com': 'sent' })
    expect(t.payload.emails.map((m) => m.to).sort()).toEqual(['bob@example.com', 'dan@example.com'])
  })

  it('an interrupted send (status sending) is never re-sent', async () => {
    const t = await seed()
    await t.approve()
    await t.payload.create({
      collection: SLUGS.drafts as never,
      data: { idempotencyKey: (await import('./send')).draftKey(t.services, String(t.campaign.id), 0, { email: 'alice@example.com' }), status: 'sending', email: 'alice@example.com' } as never,
    })
    await t.send()
    expect(t.payload.emails.map((m) => m.to)).not.toContain('alice@example.com')
  })

  it('classifies email errors', () => {
    expect(isPermanentEmailError({ responseCode: 550 })).toBe(true)
    expect(isPermanentEmailError({ responseCode: 421 })).toBe(false)
    expect(isPermanentEmailError({ statusCode: 422 })).toBe(true)
    expect(isPermanentEmailError({ statusCode: 429 })).toBe(false)
    expect(isPermanentEmailError({ code: 'ECONNRESET' })).toBe(false)
    expect(isPermanentEmailError(new Error('Invalid recipient address'))).toBe(true)
  })
})

describe('sequences', () => {
  it('abandoned-cart trigger queues step 0 for carts with a customer, once', async () => {
    const t = await seed({}, { kind: 'abandoned-cart', segment: null })
    t.data.carts = [
      { id: 'cart1', customerId: 'c1', items: [{ offeringId: 'shoe-1', title: 'Shoe', quantity: 1 }], updatedAt: new Date(Date.now() - 3 * 3_600_000).toISOString() },
      { id: 'cart2', items: [{ offeringId: 'shoe-1', title: 'Shoe', quantity: 1 }], updatedAt: new Date(Date.now() - 3 * 3_600_000).toISOString() },
    ]
    await t.approve()
    expect(t.payload.jobs_).toHaveLength(0) // sequences are not queued on approval
    await runSequences(t.payload, t.services, t.options)
    expect(t.payload.jobs_).toHaveLength(1)
    const job = t.payload.jobs_[0]
    expect(job.input.recipients).toEqual([expect.objectContaining({ email: 'alice@example.com', ref: 'cart:cart1' })])
    await t.send({ recipients: job.input.recipients })
    expect(t.payload.emails).toHaveLength(1)
    t.payload.jobs_.length = 0
    await runSequences(t.payload, t.services, t.options)
    expect(t.payload.jobs_).toHaveLength(0)
  })

  it('disabled sequence kinds are not triggered', async () => {
    const t = await seed({ sequences: { abandonedCart: false } }, { kind: 'abandoned-cart', segment: null })
    t.data.carts = [{ id: 'cart1', customerId: 'c1', items: [{ offeringId: 'shoe-1', title: 'Shoe', quantity: 1 }], updatedAt: new Date(Date.now() - 3 * 3_600_000).toISOString() }]
    await t.approve()
    await runSequences(t.payload, t.services, t.options)
    expect(t.payload.jobs_).toHaveLength(0)
  })
})

describe('drafts endpoint', () => {
  it('composes subject variants, sanitized html, text and product blocks from the adapter and saves to the campaign', async () => {
    const t = await seed()
    t.services.provider.enqueue({ object: { subjectVariants: ['A', 'B', 'C', 'B'], markdown: '# Spring\n\nHello **{{name}}** — see [new shoes](https://shop.test/shoes).' } })
    const input = draftsEndpoint.input!.parse({ brief: 'spring launch', campaignId: String(t.campaign.id), offeringIds: ['shoe-1'], save: true })
    const out = (await draftsEndpoint.handler({ ctx: t.staff('u1'), services: t.services, input, req: t.req('u1') })) as { subjectVariants: string[]; text: string; productBlocks: { offeringId: string; price?: { amount: number } }[] }
    expect(out.subjectVariants).toEqual(['A', 'B', 'C'])
    // The model is told about the {{name}} merge tag literally, not a blanked variable.
    expect(t.services.provider.calls.at(-1)?.system).toContain('You may use {{name}} for the recipient name')
    expect(out.text).toContain('new shoes (https://shop.test/shoes)')
    expect(out.productBlocks).toEqual([expect.objectContaining({ offeringId: 'shoe-1', price: { amount: 2500, currency: 'USD' } })])
    const saved = t.campaignDoc().steps[0]
    expect(saved.subjectVariants).toHaveLength(3)
    expect(saved.markdown).toContain('# Spring')
  })
})
