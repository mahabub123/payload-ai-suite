import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { AIContext, AITool, Card, StreamWireEvent } from 'payload-ai-core'
import { createFakeServices, createToolContext } from 'payload-ai-core/testing'
import { runAssistantTurn } from 'payload-ai-assistant'
import { IDENTITIES, MESSAGES, TASK_INBOUND, TASK_SEND } from './constants'
import { createDrivers } from './drivers'
import { hmacSha256Hex } from './drivers/signature'
import { ingestWebhook, processInbound } from './inbound'
import { LINK_TEXT } from './linking'
import { NO_TEMPLATE_REASON, processSend, TEMPLATE_REASON } from './outbound'
import type { AiChannelsOptions } from './options'
import { buildChannelContext, createRuntime, type ChannelRuntime } from './runtime'
import { createFakePayload } from './testing/fakePayload'
import { createWebhookEndpoints } from './endpoints'

vi.mock('payload-ai-assistant', () => ({ runAssistantTurn: vi.fn() }))
const turnMock = vi.mocked(runAssistantTurn)

const ENV = {
  WA_PHONE: '1111',
  WA_TOKEN: 'tok',
  WA_SECRET: 'app-secret',
  WA_VERIFY: 'verify-me',
  FB_TOKEN: 'page-tok',
  FB_SECRET: 'fb-secret',
  FB_VERIFY: 'fb-verify',
  MAIL_SECRET: 'mail-secret',
}

const baseOptions: AiChannelsOptions = {
  whatsapp: { phoneNumberIdEnv: 'WA_PHONE', accessTokenEnv: 'WA_TOKEN', appSecretEnv: 'WA_SECRET', verifyTokenEnv: 'WA_VERIFY' },
  messenger: { pageAccessTokenEnv: 'FB_TOKEN', appSecretEnv: 'FB_SECRET', verifyTokenEnv: 'FB_VERIFY' },
  email: { provider: 'generic', signingSecretEnv: 'MAIL_SECRET', replyFrom: 'Shop <help@shop.test>' },
}

const customers = [{ id: 'cust_1', email: 'rahim@example.com', name: 'Rahim' }]
const customerAdapter = {
  collection: 'customers',
  fields: {},
  current: async () => null,
  get: async (id: string) => customers.find((c) => c.id === id) ?? null,
  findByEmail: async (email: string) => customers.find((c) => c.email === email.toLowerCase()) ?? null,
  async *iterate() {},
}

const waBody = (id: string, text: string, from = '8801700000000', ts = 1761645600) =>
  JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { metadata: { phone_number_id: '1111' }, messages: [{ id, from, timestamp: String(ts), type: 'text', text: { body: text } }] } }] }],
  })
const signed = (body: string, secret = 'app-secret') => ({
  rawBody: body,
  headers: new Headers({ 'x-hub-signature-256': `sha256=${hmacSha256Hex(secret, body)}` }),
  query: new URLSearchParams(),
})

async function* events(...e: StreamWireEvent[]): AsyncIterable<StreamWireEvent> {
  for (const x of e) yield x
}

interface Setup {
  rt: ChannelRuntime
  fake: ReturnType<typeof createFakePayload>
  services: ReturnType<typeof createFakeServices>
  fetchMock: ReturnType<typeof vi.fn>
  clock: { now: Date }
}

const setup = (options: AiChannelsOptions = baseOptions, fetchImpl?: (url: string, init: RequestInit) => Promise<Response>): Setup => {
  const fake = createFakePayload()
  const services = createFakeServices({ adapters: { customer: customerAdapter } as never })
  // The fake hashId truncates to 8 bytes (collides on shared prefixes); use a real digest like the core's HMAC.
  services.crypto.hashId = (v) => createHash('sha256').update(v).digest('hex')
  const clock = { now: new Date(1761645600_000 + 60_000) }
  const fetchMock = vi.fn(fetchImpl ?? (async () => Response.json({ messages: [{ id: 'wamid.out' }], message_id: 'mid.out' })))
  const rt = createRuntime(fake.payload, options, {
    services,
    drivers: createDrivers(options, ENV),
    fetch: fetchMock as unknown as typeof fetch,
    now: () => clock.now,
    sleep: async () => {},
  })
  return { rt, fake, services, fetchMock, clock }
}

/** Ingest one WhatsApp message and run every queued job. */
const deliver = async (s: Setup, id: string, text: string) => {
  const before = s.fake.queued.length
  await ingestWebhook(s.rt, 'whatsapp', signed(waBody(id, text, undefined, Math.floor(s.clock.now.getTime() / 1000) - 5)))
  for (const job of s.fake.queued.slice(before)) {
    if (job.task === TASK_INBOUND) await processInbound(s.rt, job.input.messageId)
  }
  for (const job of s.fake.queued.slice(before)) {
    if (job.task === TASK_SEND) await processSend(s.rt, job.input.messageId)
  }
}

const lastOutText = (s: Setup) => s.fake.docs(MESSAGES).filter((d) => d.direction === 'out').at(-1)?.text as string
const sentBodies = (s: Setup) => s.fetchMock.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)))

beforeEach(() => {
  turnMock.mockReset()
  turnMock.mockImplementation(() => events({ type: 'meta', requestId: 'r', conversationId: 'conv_1' }, { type: 'text', delta: 'Hello from the assistant' }, { type: 'done' }))
})

describe('webhook ingest', () => {
  it('rejects bad signatures with 401 and queues nothing', async () => {
    const s = setup()
    const r = await ingestWebhook(s.rt, 'whatsapp', signed(waBody('w1', 'hi'), 'wrong-secret'))
    expect(r.status).toBe(401)
    expect(s.fake.queued).toHaveLength(0)
    expect(s.fake.docs(MESSAGES)).toHaveLength(0)
  })

  it('dedupes a replayed (validly signed) webhook: same message id is processed once', async () => {
    const s = setup()
    const req = signed(waBody('w1', 'hi'))
    expect(await ingestWebhook(s.rt, 'whatsapp', req)).toMatchObject({ status: 200, accepted: 1 })
    expect(await ingestWebhook(s.rt, 'whatsapp', req)).toMatchObject({ status: 200, accepted: 0, duplicates: 1 })
    const inbound = s.fake.queued.filter((q) => q.task === TASK_INBOUND)
    expect(inbound).toHaveLength(1)
    // Even if the job itself runs twice, the assistant runs once and one reply is queued.
    await processInbound(s.rt, inbound[0].input.messageId)
    await processInbound(s.rt, inbound[0].input.messageId)
    expect(turnMock).toHaveBeenCalledTimes(1)
    expect(s.fake.docs(MESSAGES).filter((d) => d.direction === 'out')).toHaveLength(1)
  })

  it('POST endpoint reads the raw body and acks 200; GET answers the Meta challenge', async () => {
    const s = setup()
    const [get, post] = createWebhookEndpoints(baseOptions, { services: s.services, drivers: s.rt.drivers, now: () => s.clock.now })
    const body = waBody('w9', 'hi')
    const mkReq = (method: string, url: string, b?: string, headers: Record<string, string> = {}) => {
      const r = new Request(url, { method, body: b, headers })
      return Object.assign(r, { payload: s.fake.payload, routeParams: { channel: 'whatsapp' }, searchParams: new URL(url).searchParams, pathname: new URL(url).pathname }) as never
    }
    const ok = (await post.handler({ req: mkReq('POST', 'http://x/api/ai/channels/whatsapp/webhook', body, { 'x-hub-signature-256': `sha256=${hmacSha256Hex('app-secret', body)}` }), ctx: {} as never, services: s.services, input: undefined })) as Response
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ accepted: 1 })
    const bad = (await post.handler({ req: mkReq('POST', 'http://x/api/ai/channels/whatsapp/webhook', body, { 'x-hub-signature-256': 'sha256=00' }), ctx: {} as never, services: s.services, input: undefined })) as Response
    expect(bad.status).toBe(401)
    const ch = (await get.handler({ req: mkReq('GET', 'http://x/api/ai/channels/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=777'), ctx: {} as never, services: s.services, input: undefined })) as Response
    expect(ch.status).toBe(200)
    expect(await ch.text()).toBe('777')
    const no = (await get.handler({ req: mkReq('GET', 'http://x/api/ai/channels/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=777'), ctx: {} as never, services: s.services, input: undefined })) as Response
    expect(no.status).toBe(403)
  })
})

describe('inbound -> assistant -> send', () => {
  it('runs the assistant as an unverified channel actor and keeps one conversation per identity', async () => {
    const s = setup()
    await deliver(s, 'w1', 'Do you have red sarees?')
    await deliver(s, 'w2', 'And blue?')
    expect(turnMock).toHaveBeenCalledTimes(2)
    const [first, second] = turnMock.mock.calls.map((c) => c[0])
    expect(first.ctx.actor).toMatchObject({ kind: 'channel', roles: [], channel: { name: 'whatsapp', verified: false } })
    expect(first.ctx.actor.customerId).toBeUndefined()
    expect(first.ctx.surface).toBe('channel')
    expect(first.ctx.adapterCtx.system).toBe(false)
    expect(first.channel).toBe('whatsapp')
    expect(first.conversationId).toBeUndefined()
    expect(second.conversationId).toBe('conv_1')
    expect(s.fake.docs(IDENTITIES)).toHaveLength(1)
    const sends = sentBodies(s)
    expect(sends).toHaveLength(2)
    expect(sends[0]).toMatchObject({ messaging_product: 'whatsapp', to: '8801700000000', type: 'text', text: { body: 'Hello from the assistant' } })
    // externalId stored hashed + encrypted, never in clear
    const ident = s.fake.docs(IDENTITIES)[0]
    expect(JSON.stringify(ident)).not.toContain('8801700000000')
  })

  it('renders cards with prices from card data', async () => {
    const s = setup()
    const card: Card = { type: 'products', items: [{ id: 'p1', title: 'Red Saree', price: { amount: 250000, currency: 'BDT' }, inStock: true, categoryIds: [] }] }
    turnMock.mockImplementation(() => events({ type: 'text', delta: 'Here you go:' }, { type: 'card', card }, { type: 'done' }))
    await deliver(s, 'w1', 'red saree')
    expect(lastOutText(s)).toMatch(/Here you go:\n\n\* Red Saree - .*2,500/)
  })

  it('splits long replies per channel limit', async () => {
    const s = setup()
    turnMock.mockImplementation(() => events({ type: 'text', delta: 'word '.repeat(2000) }, { type: 'done' }))
    await deliver(s, 'w1', 'tell me everything')
    const sends = sentBodies(s)
    expect(sends.length).toBe(3)
    for (const b of sends) expect(b.text.body.length).toBeLessThanOrEqual(4096)
  })

  it('answers with a busy message when the budget is spent (no assistant call)', async () => {
    const s = setup()
    s.services.budgets.assert = async () => {
      const { AIError } = await import('payload-ai-core')
      throw new AIError('budget_exceeded', 'spent')
    }
    await deliver(s, 'w1', 'hi')
    expect(turnMock).not.toHaveBeenCalled()
    expect(lastOutText(s)).toMatch(/can't answer automatically/)
  })
})

describe('WhatsApp 24-hour window', () => {
  const queueOutOfWindow = async (s: Setup) => {
    await deliver(s, 'w1', 'hi')
    s.fetchMock.mockClear()
    const out = s.fake.docs(MESSAGES).find((d) => d.direction === 'out')!
    out.status = 'queued'
    out.partsSent = 0
    s.clock.now = new Date(s.clock.now.getTime() + 25 * 3600_000)
    return out
  }

  it('sends the approved template instead of free text when the last inbound is older than 24h', async () => {
    const s = setup({ ...baseOptions, whatsapp: { ...(baseOptions.whatsapp as object), templates: { reengage: { name: 'reengage_v1', language: 'en_US' } } } as never })
    const out = await queueOutOfWindow(s)
    const r = await processSend(s.rt, out.id)
    expect(r).toEqual({ status: 'sent', reason: TEMPLATE_REASON })
    const [body] = sentBodies(s)
    expect(body).toMatchObject({ type: 'template', template: { name: 'reengage_v1', language: { code: 'en_US' } } })
    expect(body.text).toBeUndefined()
  })

  it('skips with a recorded reason when no template is configured', async () => {
    const s = setup()
    const out = await queueOutOfWindow(s)
    expect(await processSend(s.rt, out.id)).toEqual({ status: 'skipped', reason: NO_TEMPLATE_REASON })
    expect(s.fetchMock).not.toHaveBeenCalled()
    expect(s.fake.docs(MESSAGES).find((d) => d.id === out.id)).toMatchObject({ status: 'skipped', reason: NO_TEMPLATE_REASON })
  })
})

describe('send retries', () => {
  it('retries transient failures with backoff, then throws for the job retry; resumes without double-sending', async () => {
    let calls = 0
    const s = setup(baseOptions, async () => {
      calls++
      return calls <= 3 ? new Response('{"error":{"message":"down"}}', { status: 503 }) : Response.json({ messages: [{ id: 'ok' }] })
    })
    await ingestWebhook(s.rt, 'whatsapp', signed(waBody('w1', 'hi', undefined, Math.floor(s.clock.now.getTime() / 1000))))
    await processInbound(s.rt, s.fake.queued[0].input.messageId)
    const sendJob = s.fake.queued.find((q) => q.task === TASK_SEND)!
    await expect(processSend(s.rt, sendJob.input.messageId)).rejects.toThrow(/503/)
    expect(s.fake.docs(MESSAGES).find((d) => d.id === sendJob.input.messageId)).toMatchObject({ status: 'retrying', attempts: 1 })
    expect(await processSend(s.rt, sendJob.input.messageId)).toEqual({ status: 'sent' })
    expect(await processSend(s.rt, sendJob.input.messageId)).toEqual({ status: 'noop' })
    expect(calls).toBe(4)
  })

  it('does not retry permanent failures', async () => {
    const s = setup(baseOptions, async () => new Response('{"error":{"message":"invalid recipient","code":100}}', { status: 400 }))
    await deliver(s, 'w1', 'hi')
    expect(s.fetchMock).toHaveBeenCalledTimes(1)
    expect(s.fake.docs(MESSAGES).find((d) => d.direction === 'out')).toMatchObject({ status: 'failed' })
  })
})

describe('account linking (one-time code)', () => {
  it('sends a code to the account email and links on the correct code', async () => {
    const s = setup()
    await deliver(s, 'w1', 'rahim@example.com')
    expect(lastOutText(s)).toBe(LINK_TEXT.sent(10))
    expect(s.fake.emails).toHaveLength(1)
    expect(s.fake.emails[0].to).toBe('rahim@example.com')
    const code = /is (\d{6})/.exec(s.fake.emails[0].text)![1]
    await deliver(s, 'w2', code)
    expect(lastOutText(s)).toBe(LINK_TEXT.linked)
    const ident = s.fake.docs(IDENTITIES)[0]
    expect(ident).toMatchObject({ customerId: 'cust_1', pendingCodeHash: null })
    expect(ident.verifiedAt).toBeTruthy()
    // Subsequent turns run as a verified channel actor with the customer id.
    await deliver(s, 'w3', 'where is my order?')
    expect(turnMock.mock.calls.at(-1)![0].ctx.actor).toMatchObject({ kind: 'channel', customerId: 'cust_1', channel: { verified: true } })
  })

  it('never reveals whether an email exists', async () => {
    const s = setup()
    await deliver(s, 'w1', 'nobody@example.com')
    expect(lastOutText(s)).toBe(LINK_TEXT.sent(10))
    expect(s.fake.emails).toHaveLength(0)
    // Any code fails: there is no customer behind the pending code.
    await deliver(s, 'w2', '123456')
    expect(lastOutText(s)).toBe(LINK_TEXT.wrong(4))
    expect(s.fake.docs(IDENTITIES)[0].customerId).toBeUndefined()
  })

  it('rejects a wrong code and counts attempts, then discards the code', async () => {
    const s = setup()
    await deliver(s, 'w1', 'rahim@example.com')
    const code = /is (\d{6})/.exec(s.fake.emails[0].text)![1]
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 1; i <= 4; i++) {
      await deliver(s, `bad${i}`, wrong)
      expect(lastOutText(s)).toBe(LINK_TEXT.wrong(5 - i))
    }
    await deliver(s, 'bad5', wrong)
    expect(lastOutText(s)).toBe(LINK_TEXT.tooMany)
    // the right code no longer works (pending code discarded -> goes to the assistant)
    await deliver(s, 'late', code)
    expect(s.fake.docs(IDENTITIES)[0].customerId).toBeUndefined()
  })

  it('rejects an expired code', async () => {
    const s = setup()
    await deliver(s, 'w1', 'rahim@example.com')
    const code = /is (\d{6})/.exec(s.fake.emails[0].text)![1]
    s.clock.now = new Date(s.clock.now.getTime() + 11 * 60_000)
    await deliver(s, 'w2', code)
    expect(lastOutText(s)).toBe(LINK_TEXT.expired)
    expect(s.fake.docs(IDENTITIES)[0].customerId).toBeUndefined()
  })

  it('prompts to link when the assistant asks for verification', async () => {
    const s = setup()
    turnMock.mockImplementation(() => events({ type: 'text', delta: 'I need to verify you first.' }, { type: 'card', card: { type: 'verify', reason: 'order', methods: ['order-email-otp'] } }, { type: 'done' }))
    await deliver(s, 'w1', 'where is my order')
    expect(lastOutText(s)).toContain('reply with the email address on your account')
  })
})

describe('channel actors and tiers', () => {
  const staffTool: AITool = { name: 'publishAll', description: 'staff', tier: 'staff', input: z.object({}), run: async () => ({ data: { published: true } }) }
  const returnTool: AITool = {
    name: 'proposeReturn',
    description: 'return',
    tier: 'confirm',
    input: z.object({ orderId: z.string() }),
    describeAction: (i: { orderId: string }) => ({ title: `Return order ${i.orderId}`, summary: 'Return all items' }),
    run: vi.fn(async () => ({ data: { message: 'Return R-1 created.' } })),
  }

  it('channel context never exposes staff-tier tools', () => {
    const s = setup()
    s.services.tools.register(staffTool, 'copilot')
    s.services.tools.register(returnTool, 'assistant')
    const ctx: AIContext = buildChannelContext(s.rt, { externalIdHash: 'h', verifiedAt: '2026-10-01', customerId: 'cust_1' }, 'whatsapp')
    expect(ctx.actor.roles).toEqual([])
    expect(ctx.actor.kind).toBe('channel')
    const names = s.services.tools.availableFor({ ...ctx, services: s.services }).map((t) => t.name)
    expect(names).toContain('proposeReturn')
    expect(names).not.toContain('publishAll')
  })

  const linkedSetup = async () => {
    const s = setup()
    s.services.tools.register(staffTool, 'copilot')
    s.services.tools.register(returnTool, 'assistant')
    await deliver(s, 'w0', 'hi')
    Object.assign(s.fake.docs(IDENTITIES)[0], { customerId: 'cust_1', verifiedAt: '2026-10-01T00:00:00Z' })
    return s
  }

  it('confirms via "YES <code>" with the channel message id as idempotency key', async () => {
    const s = await linkedSetup()
    const { card } = await s.services.actions.propose(returnTool, { orderId: '1042' }, createToolContext(s.services))
    turnMock.mockImplementation(() => events({ type: 'text', delta: 'I can start that return.' }, { type: 'card', card }, { type: 'done' }))
    await deliver(s, 'w1', 'return order 1042')
    const code = /Reply YES ([A-Z0-9]+)/.exec(lastOutText(s))![1]
    const confirm = vi.spyOn(s.services.actions, 'confirm')
    await deliver(s, 'w2', `yes ${code}`)
    expect(confirm).toHaveBeenCalledWith((card as { actionId: string }).actionId, 'whatsapp:w2', expect.objectContaining({ surface: 'channel' }))
    expect(lastOutText(s)).toBe('Done: Return order 1042.\nReturn R-1 created.')
    expect(returnTool.run).toHaveBeenCalledTimes(1)
    // replaying the same code does nothing
    await deliver(s, 'w3', `YES ${code}`)
    expect(lastOutText(s)).toMatch(/isn't valid/)
    expect(returnTool.run).toHaveBeenCalledTimes(1)
  })

  it('refuses to confirm a staff-tier action from a channel', async () => {
    const s = await linkedSetup()
    const action = await s.services.actions.propose(staffTool, {}, createToolContext(s.services))
    turnMock.mockImplementation(() => events({ type: 'card', card: action.card }, { type: 'done' }))
    await deliver(s, 'w1', 'publish everything')
    const code = /Reply YES ([A-Z0-9]+)/.exec(lastOutText(s))![1]
    const confirm = vi.spyOn(s.services.actions, 'confirm')
    await deliver(s, 'w2', `YES ${code}`)
    expect(confirm).not.toHaveBeenCalled()
    expect(lastOutText(s)).toMatch(/needs a team member/)
  })

  it('requires a verified identity to confirm', async () => {
    const s = setup()
    s.services.tools.register(returnTool, 'assistant')
    const { card } = await s.services.actions.propose(returnTool, { orderId: '1' }, createToolContext(s.services))
    turnMock.mockImplementation(() => events({ type: 'card', card }, { type: 'done' }))
    await deliver(s, 'w1', 'return')
    const code = /Reply YES ([A-Z0-9]+)/.exec(lastOutText(s))![1]
    await deliver(s, 'w2', `YES ${code}`)
    expect(lastOutText(s)).toBe(LINK_TEXT.askEmail)
  })
})

describe('email channel', () => {
  const now = new Date(1761645600_000 + 60_000)
  const mail = (o: { id: string; from?: string; subject?: string; text: string; refs?: string; inReplyTo?: string }) => {
    const body = JSON.stringify({ messageId: o.id, from: o.from ?? 'Rahim <rahim@example.com>', subject: o.subject ?? 'Order question', text: o.text, references: o.refs, inReplyTo: o.inReplyTo })
    const ts = String(Math.floor(now.getTime() / 1000))
    return { rawBody: body, headers: new Headers({ 'x-timestamp': ts, 'x-signature': hmacSha256Hex('mail-secret', `${ts}.${body}`) }), query: new URLSearchParams() }
  }
  const run = async (s: Setup, r: ReturnType<typeof mail>) => {
    const before = s.fake.queued.length
    expect((await ingestWebhook(s.rt, 'email', r)).status).toBe(200)
    for (const j of s.fake.queued.slice(before)) if (j.task === TASK_INBOUND) await processInbound(s.rt, j.input.messageId)
    for (const j of s.fake.queued.slice(before)) if (j.task === TASK_SEND) await processSend(s.rt, j.input.messageId)
  }

  it('maps sender to customer, strips quotes, threads by References and replies via sendEmail', async () => {
    const s = setup()
    let n = 0
    turnMock.mockImplementation(() => events({ type: 'meta', requestId: 'r', conversationId: `conv_${++n}` }, { type: 'text', delta: 'Your order shipped.' }, { type: 'done' }))
    await run(s, mail({ id: '<m1@example.com>', text: 'Where is order 1042?\n\nOn Mon, Shop wrote:\n> hi' }))
    const call = turnMock.mock.calls[0][0]
    expect(call.message).toBe('Where is order 1042?')
    expect(call.ctx.actor).toMatchObject({ kind: 'channel', customerId: 'cust_1', channel: { name: 'email', verified: true } })
    expect(s.fake.emails).toHaveLength(1)
    const reply = s.fake.emails[0]
    expect(reply).toMatchObject({ from: 'Shop <help@shop.test>', to: 'rahim@example.com', subject: 'Re: Order question', inReplyTo: '<m1@example.com>', text: 'Your order shipped.' })

    // A reply referencing our message continues the same conversation.
    await run(s, mail({ id: '<m2@example.com>', subject: 'Re: Order question', text: 'Thanks!', refs: `<m1@example.com> ${reply.messageId}`, inReplyTo: reply.messageId }))
    expect(turnMock.mock.calls[1][0].conversationId).toBe('conv_1')
    // A different subject with no references starts a new thread.
    await run(s, mail({ id: '<m3@example.com>', subject: 'Another thing', text: 'Do you sell mugs?' }))
    expect(turnMock.mock.calls[2][0].conversationId).toBeUndefined()
    // Same subject without headers threads by subject.
    await run(s, mail({ id: '<m4@example.com>', subject: 'RE: another thing', text: 'Blue ones?' }))
    expect(turnMock.mock.calls[3][0].conversationId).toBe('conv_3')
  })

  it('unknown senders stay unverified', async () => {
    const s = setup()
    await run(s, mail({ id: '<x@z.test>', from: 'z@z.test', text: 'hi' }))
    expect(turnMock.mock.calls[0][0].ctx.actor).toMatchObject({ channel: { verified: false } })
    expect(turnMock.mock.calls[0][0].ctx.actor.customerId).toBeUndefined()
  })
})

describe('queueChannelReply', () => {
  it('queues a proactive message through the send job', async () => {
    const { queueChannelReply } = await import('./inbound')
    const s = setup()
    await deliver(s, 'w1', 'hi')
    s.fetchMock.mockClear()
    const ident = s.fake.docs(IDENTITIES)[0]
    const out = await queueChannelReply(s.fake.payload, { identityId: ident.id, text: 'An agent replied: your refund is approved.' })
    expect(s.fake.queued.at(-1)).toEqual({ task: TASK_SEND, input: { messageId: out!.id } })
    await processSend(s.rt, String(out!.id))
    expect(sentBodies(s)[0].text.body).toBe('An agent replied: your refund is approved.')
  })
})
