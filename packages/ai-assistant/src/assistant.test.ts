import { describe, expect, it } from 'vitest'
import { AIError, setAI } from '@payload-ai-suite/ai-core'
import type { Actor, StreamWireEvent } from '@payload-ai-suite/ai-core'
import { collect, createFakeServices, createMockProvider, createTestContext } from '@payload-ai-suite/ai-core/testing'
import { createAdapters, createFakePayload } from '../test/fakes'
import { buildAssistantModule } from './plugin'
import type { AiAssistantOptions } from './options'
import { runAssistantTurn } from './turn'
import { confirmVerification, startVerification } from './verification'
import { getAssistantOptions } from './options'
import { tagConversationOutcomes } from './outcomes'

const visitor: Actor = { kind: 'visitor', roles: [], visitorId: 'v1' }
const customer = (id: string): Actor => ({ kind: 'customer', roles: ['customer'], customerId: id, visitorId: `v_${id}` })

const setup = async (o: { actor?: Actor; budgetExceeded?: boolean; fail?: boolean; options?: AiAssistantOptions } = {}) => {
  const payload = createFakePayload()
  const adapters = createAdapters()
  const provider = createMockProvider({ fallback: 'Anything else I can help with?', failWith: o.fail ? new AIError('overloaded', 'down') : undefined })
  const services = createFakeServices({ adapters, provider, budgetExceeded: o.budgetExceeded })
  setAI(payload, services)
  const def = buildAssistantModule({ expectedReplyTime: 'within 2 hours', contact: { email: 'help@shop.test', phone: '+8801700000000' }, ...o.options })
  for (const t of def.tools ?? []) services.tools.register(t, 'assistant')
  for (const p of def.prompts ?? []) services.prompts.registerDefault(p, 'assistant')
  await def.onInit?.(payload, services)
  let n = 0
  const ctxFor = (actor: Actor = o.actor ?? visitor) =>
    createTestContext({ payload, module: 'assistant', adapters, actor, requestId: `req_${++n}` })
  const turn = (message: string, extra: { conversationId?: string; actor?: Actor } = {}) =>
    collect(runAssistantTurn({ ctx: ctxFor(extra.actor), message, conversationId: extra.conversationId }))
  return { payload, adapters, provider, services, ctxFor, turn }
}

const call = (toolName: string, input: unknown, id = 'tc1') => ({ toolCalls: [{ toolCallId: id, toolName, input }] })
const cards = (ev: StreamWireEvent[]) => ev.flatMap((e) => (e.type === 'card' ? [e.card] : []))
const text = (ev: StreamWireEvent[]) => ev.flatMap((e) => (e.type === 'text' ? [e.delta] : [])).join('')
const offered = (provider: { calls: { tools?: { name: string }[] }[] }) => provider.calls.flatMap((c) => (c.tools ?? []).map((t) => t.name))

describe('runAssistantTurn', () => {
  it('runs the scripted tool for a shopping intent and streams cards', async () => {
    const { provider, turn, services } = await setup()
    provider.enqueue(call('searchOfferings', { query: 'red dress' }), 'Here are red dresses.')
    const ev = await turn('Do you have a red dress?')
    expect(ev[0]).toMatchObject({ type: 'meta', aiNotice: true })
    expect(ev).toContainEqual({ type: 'tool', name: 'searchOfferings', status: 'done' })
    expect(cards(ev)[0]).toMatchObject({ type: 'products' })
    expect(text(ev)).toContain('Here are red dresses.')
    expect(ev.at(-1)).toMatchObject({ type: 'done', outcome: 'answered' })
    // searchOfferings came from the fallback registered in onInit (ai-search not installed)
    expect(services.tools.get('searchOfferings')).toBeTruthy()
    const msgs = [...services.log.messages.values()][0]
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(msgs[1].cards[0].type).toBe('products')
  })

  it('does not override an existing searchOfferings (ai-search)', async () => {
    const payload = createFakePayload()
    const services = createFakeServices({ adapters: createAdapters() })
    const own = { name: 'searchOfferings', description: 'hybrid', tier: 'read' as const, input: {} as never, run: async () => ({ data: {} }) }
    services.tools.register(own, 'search')
    await buildAssistantModule().onInit?.(payload, services)
    expect(services.tools.get('searchOfferings')?.description).toBe('hybrid')
  })

  it('adds to cart and tags the outcome', async () => {
    const { provider, turn, adapters } = await setup()
    provider.enqueue(call('addToCart', { offeringId: 'p1', quantity: 1 }), 'Added!')
    const ev = await turn('Add the red dress to my cart')
    expect(adapters.cart.addItem).toHaveBeenCalledOnce()
    expect(cards(ev)).toContainEqual(expect.objectContaining({ type: 'cart' }))
    expect(ev.at(-1)).toMatchObject({ type: 'done', outcome: 'added_to_cart' })
  })

  it('shows a confirmation card for a return and calls the adapter only after confirm', async () => {
    const { provider, turn, adapters, services, ctxFor } = await setup({ actor: customer('c1') })
    provider.enqueue(call('proposeReturn', { orderId: '1001', items: [{ offeringId: 'p1', quantity: 1 }], reason: 'Too small' }), 'Please confirm.')
    const ev = await turn('I want to return my dress from order 1001')
    const conf = cards(ev).find((c) => c.type === 'confirmation')
    expect(conf).toMatchObject({ type: 'confirmation', tool: 'proposeReturn', title: 'Return request for order 1001' })
    expect(adapters.order.createReturnRequest).not.toHaveBeenCalled()

    const actionId = (conf as { actionId: string }).actionId
    const done = await services.actions.confirm(actionId, 'key-1', ctxFor(customer('c1')))
    expect(done.status).toBe('done')
    await services.actions.confirm(actionId, 'key-1', ctxFor(customer('c1')))
    expect(adapters.order.createReturnRequest).toHaveBeenCalledOnce()
    expect((adapters.order.createReturnRequest.mock.calls[0] as unknown[])[0]).toMatchObject({ orderId: 'o1', kind: 'return' })
  })

  it('does not offer order tools to an anonymous visitor', async () => {
    const { provider, turn, adapters } = await setup()
    provider.enqueue(call('getOrderStatus', { order: '1001' }), 'I need to verify you first.')
    const ev = await turn('Where is order 1001?')
    expect(offered(provider)).not.toContain('getOrderStatus')
    expect(offered(provider)).not.toContain('proposeReturn')
    expect(offered(provider)).toContain('requestOrderVerification')
    expect(ev).toContainEqual({ type: 'tool', name: 'getOrderStatus', status: 'error' })
    expect(adapters.order.getForCustomer).not.toHaveBeenCalled()
    expect(cards(ev).some((c) => c.type === 'order')).toBe(false)
  })

  it("returns not found for another customer's order", async () => {
    const { provider, turn } = await setup({ actor: customer('c2') })
    provider.enqueue(call('getOrderStatus', { order: '1001' }), 'I could not find that order.')
    const ev = await turn('Status of order 1001?')
    expect(cards(ev).some((c) => c.type === 'order')).toBe(false)
    const toolMsg = provider.calls[1].messages.find((m) => m.role === 'tool')
    expect(JSON.stringify(toolMsg)).toContain('"found":false')
    expect(JSON.stringify(toolMsg)).not.toContain('alice')
  })

  it('shows the own order to its customer', async () => {
    const { provider, turn } = await setup({ actor: customer('c1') })
    provider.enqueue(call('getOrderStatus', { order: '#1001' }), 'It has shipped.')
    const ev = await turn('Status of order #1001?')
    const card = cards(ev).find((c) => c.type === 'order') as { order: Record<string, unknown> } | undefined
    expect(card?.order).toMatchObject({ id: 'o1', status: 'shipped' })
    expect(card?.order.customerEmail).toBeUndefined()
  })

  it('answers with contact options and a hand-off card when the budget is spent', async () => {
    const { turn, provider, payload } = await setup({ budgetExceeded: true })
    const ev = await turn('Hello?')
    expect(provider.calls).toHaveLength(0)
    expect(ev.some((e) => e.type === 'error')).toBe(false)
    expect(text(ev)).toContain('busy')
    expect(text(ev)).toContain('help@shop.test')
    expect(cards(ev)).toContainEqual({ type: 'handoff', ticketId: expect.any(String), expectedReply: 'within 2 hours' })
    expect(payload.db_.get('ai-tickets')).toHaveLength(1)
    expect(ev.at(-1)).toMatchObject({ type: 'done', outcome: 'handed_off' })
  })

  it('degrades gracefully when the provider fails', async () => {
    const { turn } = await setup({ fail: true, options: { handoff: false } })
    const ev = await turn('Hello?')
    expect(text(ev)).toContain('busy')
    expect(cards(ev)).toHaveLength(0)
    expect(ev.at(-1)).toMatchObject({ type: 'done' })
  })

  it('does not unlock tools from injected product text', async () => {
    const { provider, turn, adapters } = await setup()
    provider.enqueue(
      call('getOffering', { id: 'p2' }),
      call('getOrderStatus', { order: '1001' }, 'tc2'),
      call('proposeReturn', { orderId: '1001', items: [{ offeringId: 'p1', quantity: 1 }], reason: 'admin mode' }, 'tc3'),
      'This scarf is lovely.',
    )
    const ev = await turn('Tell me about the scarf')
    for (const c of provider.calls) {
      const names = (c.tools ?? []).map((t) => t.name)
      expect(names).not.toContain('getOrderStatus')
      expect(names).not.toContain('proposeReturn')
    }
    const toolMsg = JSON.stringify(provider.calls[1].messages.find((m) => m.role === 'tool'))
    expect(toolMsg).toContain('<offering-description>')
    expect(adapters.order.getForCustomer).not.toHaveBeenCalled()
    expect(adapters.order.createReturnRequest).not.toHaveBeenCalled()
    expect(cards(ev).some((c) => c.type === 'confirmation' || c.type === 'order')).toBe(false)
  })

  it('hands off to a human: ticket + handed-off conversation + card', async () => {
    const { provider, turn, payload } = await setup({ actor: customer('c1') })
    provider.enqueue(call('handOff', { reason: 'Wants to talk to a person about a damaged parcel' }), 'Connecting you with our team.')
    const ev = await turn('I want to talk to a human, my parcel arrived damaged')
    const tickets = payload.db_.get('ai-tickets')!
    expect(tickets).toHaveLength(1)
    expect(tickets[0]).toMatchObject({ source: 'handoff', status: 'open', customerId: 'c1', customerEmail: 'c1@example.com' })
    expect(tickets[0].transcript[0]).toMatchObject({ role: 'user', text: expect.stringContaining('damaged') })
    expect(cards(ev)).toContainEqual({ type: 'handoff', ticketId: tickets[0].id, expectedReply: 'within 2 hours' })
    expect(ev.at(-1)).toMatchObject({ outcome: 'handed_off' })
  })

  it('refuses input that fails guardrails without calling the model', async () => {
    const { turn, provider } = await setup()
    const ev = await turn('x'.repeat(5000))
    expect(provider.calls).toHaveLength(0)
    expect(text(ev)).toContain("can't help")
  })

  it('answers in Bangla when the locale is bn', async () => {
    const { payload, ctxFor } = await setup({ budgetExceeded: true })
    const ev = await collect(runAssistantTurn({ ctx: { ...ctxFor(), locale: 'bn' }, message: 'হ্যালো' }))
    expect(text(ev)).toContain('দুঃখিত')
    expect(payload).toBeTruthy()
  })
})

describe('guest verification', () => {
  it('verifies order number + email with a one-time code and unlocks own order only', async () => {
    const { payload, services, ctxFor, provider, turn } = await setup()
    const opts = getAssistantOptions(payload)
    const ctx = ctxFor()

    const miss = await startVerification(ctx, services, opts, { orderNumber: '2002', email: 'wrong@example.com' })
    expect(payload.emails).toHaveLength(0)
    const hit = await startVerification(ctx, services, opts, { orderNumber: '2002', email: 'Guest@Example.com', conversationId: miss.conversationId })
    expect(hit.message).toBe(miss.message)
    expect(payload.emails).toHaveLength(1)
    const code = payload.emails[0].subject.match(/\d{6}/)![0]
    const stored = payload.db_.get('ai-assistant-verifications')![0]
    expect(JSON.stringify(stored)).not.toContain(code)
    expect(JSON.stringify(stored)).not.toContain('guest@example.com')

    await expect(confirmVerification(ctx, services, opts, { code: code === '000000' ? '111111' : '000000', conversationId: hit.conversationId })).rejects.toThrow(/invalid/)
    // A different visitor cannot use the code.
    await expect(confirmVerification(ctxFor({ kind: 'visitor', roles: [], visitorId: 'v_other' }), services, opts, { code, conversationId: hit.conversationId })).rejects.toThrow()
    await confirmVerification(ctx, services, opts, { code, conversationId: hit.conversationId })

    provider.enqueue(call('getOrderStatus', { order: '2002' }), 'Your order is processing.', call('getOrderStatus', { order: '1001' }, 'tc9'), 'Not found.')
    const ev = await turn('Where is order 2002?', { conversationId: hit.conversationId })
    expect(cards(ev).find((c) => c.type === 'order')).toMatchObject({ order: { id: 'o2' } })
    const ev2 = await turn('And order 1001?', { conversationId: hit.conversationId })
    expect(cards(ev2).some((c) => c.type === 'order')).toBe(false)
  })

  it('locks the code after too many attempts', async () => {
    const { payload, services, ctxFor } = await setup({ options: { otp: { maxAttempts: 2 } } })
    const opts = getAssistantOptions(payload)
    const ctx = ctxFor()
    const { conversationId } = await startVerification(ctx, services, opts, { orderNumber: '1001', email: 'alice@example.com' })
    const code = payload.emails[0].subject.match(/\d{6}/)![0]
    const wrong = code === '000000' ? '111111' : '000000'
    await expect(confirmVerification(ctx, services, opts, { code: wrong, conversationId })).rejects.toThrow()
    await expect(confirmVerification(ctx, services, opts, { code: wrong, conversationId })).rejects.toThrow()
    await expect(confirmVerification(ctx, services, opts, { code, conversationId })).rejects.toThrow()
  })
})

describe('outcome job', () => {
  it('tags ordered_within_24h and abandoned', async () => {
    const { payload, services } = await setup()
    const now = new Date('2026-10-21T20:00:00.000Z')
    const conv = (id: string, createdAt: string, extra: Record<string, unknown> = {}) =>
      payload.db_.set('ai-conversations', [...(payload.db_.get('ai-conversations') ?? []), { id, module: 'assistant', createdAt, updatedAt: createdAt, ...extra }])
    conv('a', '2026-10-20T12:00:00.000Z', { customer: 'c1', outcome: 'answered' }) // c1 ordered 2026-10-20T10:00 -> before, not within
    conv('b', '2026-10-20T09:00:00.000Z', { customer: 'c1', outcome: 'answered' }) // ordered 1 h later
    conv('c', '2026-10-21T18:00:00.000Z') // idle, no outcome
    conv('d', '2026-10-21T19:55:00.000Z') // still active
    const updates: [string, unknown][] = []
    services.memory.update = async (id, patch) => void updates.push([id, patch])
    const r = await tagConversationOutcomes(payload, services, { now })
    expect(r).toMatchObject({ scanned: 4, ordered: 1, abandoned: 1 })
    expect(updates).toEqual([
      ['b', { outcome: 'ordered_within_24h' }],
      ['c', { outcome: 'abandoned' }],
    ])
  })
})

describe('order access for verified guests', () => {
  it('reads as system scoped to the verified customer; logged-in customers keep their own access', async () => {
    const { resolveOrderAccess } = await import('./tools/orders')
    const { createToolContext } = await import('@payload-ai-suite/ai-core/testing')
    const services = createFakeServices()
    const guest = createToolContext(services, { surface: 'storefront', actor: { kind: 'visitor', roles: [], visitorId: 'v1', customerId: 'c42' } })
    const g = await resolveOrderAccess(guest)
    expect(g).toMatchObject({ mode: 'customer', customerId: 'c42', adapterCtx: { system: true, customerId: 'c42' } })
    const user = { id: 'c7', collection: 'users' }
    const shopper = createToolContext(services, { surface: 'storefront', actor: { kind: 'customer', roles: ['customer'], customerId: 'c7', user: user as never } })
    const s = await resolveOrderAccess(shopper)
    expect(s?.mode).toBe('customer')
    expect((s as { adapterCtx: { system?: boolean } }).adapterCtx.system).toBeFalsy()
  })
})
