import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { AITool, AgentEvent, AIContext, ChatMessage, MessagePart } from '../contracts'
import { collect, createFakePayload, createFakeServices, createTestContext } from '../testing'
import { createToolRegistry } from '../tools'
import { createAgentRuntime } from '.'
import { createActionService, ACTIONS_SLUG } from '../actions'
import { createGuardrails } from '../guardrails'

const setup = () => {
  const services = createFakeServices({ adapters: { offering: {} as never } })
  services.tools = createToolRegistry(() => services)
  services.agent = createAgentRuntime(() => services)
  services.actions = createActionService(() => services)
  const payload = createFakePayload()
  const runs: Record<string, number> = {}
  const tool = (name: string, tier: AITool['tier'], extra: Partial<AITool> = {}): AITool => ({
    name,
    description: `${name} tool`,
    tier,
    input: z.object({ q: z.string() }),
    describeAction: (i: { q: string }) => ({ title: `Do ${name}`, summary: i.q }),
    run: vi.fn(async (i: { q: string }) => {
      runs[name] = (runs[name] ?? 0) + 1
      return { data: { ok: true, q: i.q, price: { amount: 125000, currency: 'BDT' } } }
    }),
    ...extra,
  })
  const tools = {
    search: tool('search', 'read'),
    addToCart: tool('addToCart', 'low'),
    proposeReturn: tool('proposeReturn', 'confirm'),
    publish: tool('publish', 'staff'),
    orders: tool('orders', 'read', { requires: ['order'] }),
    gated: tool('gated', 'read', { available: (ctx) => Boolean(ctx.actor.customerId) }),
    broken: tool('broken', 'read', { run: async () => Promise.reject(new Error('db down: secret details')) }),
  }
  for (const t of Object.values(tools)) services.tools.register(t, 'test')
  const ctx = (o: Partial<AIContext> = {}) => createTestContext({ payload, adapters: services.adapters, ...o })
  return { services, payload, tools, runs, ctx }
}

const staffActor = { kind: 'staff' as const, roles: ['store-admin' as const], user: { id: 7, collection: 'users' } as never }

describe('tool registry tiers', () => {
  it('never offers staff tools to visitors or on storefront/channel surfaces', () => {
    const { services, ctx } = setup()
    const names = (c: AIContext) => services.tools.availableFor({ ...c, services }).map((t) => t.name).sort()
    expect(names(ctx())).toEqual(['addToCart', 'broken', 'proposeReturn', 'search'])
    expect(names(ctx({ actor: staffActor, surface: 'storefront' }))).not.toContain('publish')
    expect(names(ctx({ actor: { ...staffActor }, surface: 'channel' }))).not.toContain('publish')
    expect(names(ctx({ actor: staffActor, surface: 'admin' }))).toContain('publish')
    expect(names(ctx({ actor: { kind: 'customer', roles: ['customer'], customerId: 'c1' } }))).toContain('gated')
  })

  it('disables tools whose concepts are unmapped, with a reason', () => {
    const { services } = setup()
    expect(services.tools.disabled()).toEqual({ orders: 'requires unmapped concept(s): order' })
  })

  it('keeps the first registration of a tool name', () => {
    const { services, tools } = setup()
    services.tools.register({ ...tools.search, description: 'other' }, 'other')
    expect(services.tools.get('search')?.description).toBe('search tool')
  })
})

describe('agent runtime', () => {
  it('a visitor cannot make the model run a staff tool', async () => {
    const { services, ctx, runs } = setup()
    services.provider.enqueue({ toolCalls: [{ toolCallId: 't1', toolName: 'publish', input: { q: 'x' } }] }, 'Sorry, I cannot do that.')
    const events = await collect(services.agent.run({ system: 'S', messages: [{ role: 'user', content: 'publish' }], tools: ['publish', 'search'], ctx: ctx() }))
    expect(runs.publish).toBeUndefined()
    expect(services.provider.calls[0].tools?.map((t) => t.name)).toEqual(['search'])
    expect(events.find((e) => e.type === 'tool-end')).toMatchObject({ ok: false })
  })

  it('confirm-tier tools create a proposal and a card, never run', async () => {
    const { services, ctx, runs, payload } = setup()
    services.provider.enqueue({ toolCalls: [{ toolCallId: 't1', toolName: 'proposeReturn', input: { q: 'order 42' } }] }, 'Please confirm.')
    const events = await collect(
      services.agent.run({ system: 'S', messages: [{ role: 'user', content: 'return' }], tools: ['proposeReturn'], ctx: ctx(), conversationId: 'conv1' }),
    )
    expect(runs.proposeReturn).toBeUndefined()
    const card = events.find((e): e is Extract<AgentEvent, { type: 'card' }> => e.type === 'card')?.card
    expect(card).toMatchObject({ type: 'confirmation', tool: 'proposeReturn', title: 'Do proposeReturn', summary: 'order 42' })
    const rows = [...payload.store.get(ACTIONS_SLUG)!.values()]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'proposed', visitorHash: 'v_test', conversationId: 'conv1' })
  })

  it('runs read tools, audits low tools and feeds compact quoted results back', async () => {
    const { services, ctx, runs } = setup()
    services.provider.enqueue(
      { toolCalls: [{ toolCallId: 'a', toolName: 'search', input: { q: 'shoes' } }, { toolCallId: 'b', toolName: 'addToCart', input: { q: 'p1' } }] },
      'Added.',
    )
    const events = await collect(services.agent.run({ system: 'S', messages: [{ role: 'user', content: 'hi' }], tools: ['search', 'addToCart'], ctx: ctx() }))
    expect(runs).toEqual({ search: 1, addToCart: 1 })
    expect(services.log.audit).toHaveLength(1)
    expect(services.log.audit[0]).toMatchObject({ action: 'tool.run', meta: { tool: 'addToCart', tier: 'low' } })
    const second = services.provider.calls[1].messages
    const toolMsg = second.find((m: ChatMessage) => m.role === 'tool')!
    const out = (toolMsg.content as MessagePart[])[0] as Extract<MessagePart, { type: 'tool-result' }>
    expect(String(out.output)).toContain('<tool_result name="search">')
    const finish = events.at(-1) as Extract<AgentEvent, { type: 'finish' }>
    expect(finish).toMatchObject({ type: 'finish', text: 'Added.', steps: 2 })
    expect(finish.toolResults.map((r) => r.toolName)).toEqual(['search', 'addToCart'])
  })

  it('tells the model the tool failed instead of leaking or guessing', async () => {
    const { services, ctx } = setup()
    services.provider.enqueue({ toolCalls: [{ toolCallId: 'a', toolName: 'broken', input: { q: 'x' } }] }, "I couldn't check that right now.")
    await collect(services.agent.run({ system: 'S', messages: [{ role: 'user', content: 'hi' }], tools: ['broken'], ctx: ctx() }))
    const toolMsg = services.provider.calls[1].messages.find((m: ChatMessage) => m.role === 'tool')!
    const part = (toolMsg.content as MessagePart[])[0] as Extract<MessagePart, { type: 'tool-result' }>
    expect(part.isError).toBe(true)
    expect(String(part.output)).toContain('tool failed')
    expect(String(part.output)).not.toContain('secret details')
  })

  it('rejects invalid tool input without running the tool', async () => {
    const { services, ctx, runs } = setup()
    services.provider.enqueue({ toolCalls: [{ toolCallId: 'a', toolName: 'search', input: { nope: 1 } }] }, 'ok')
    await collect(services.agent.run({ system: 'S', messages: [{ role: 'user', content: 'hi' }], tools: ['search'], ctx: ctx() }))
    expect(runs.search).toBeUndefined()
  })

  it('stops after at most 5 model steps', async () => {
    const { services, ctx } = setup()
    services.provider.enqueue(...Array.from({ length: 10 }, (_, i) => ({ toolCalls: [{ toolCallId: `c${i}`, toolName: 'search', input: { q: 'x' } }] })))
    const events = await collect(services.agent.run({ system: 'S', messages: [], tools: ['search'], ctx: ctx(), maxSteps: 50 }))
    expect(services.provider.calls).toHaveLength(5)
    expect(events.at(-1)).toMatchObject({ type: 'finish', steps: 5 })
  })

  it('checks final text against tool results (price mismatch flagged)', async () => {
    const { services, ctx } = setup()
    const settings = await services.settings(ctx().payload)
    services.guardrails = createGuardrails(() => services, { settings: () => settings })
    services.provider.enqueue({ toolCalls: [{ toolCallId: 'a', toolName: 'search', input: { q: 'x' } }] }, 'It costs ৳999.')
    const events = await collect(services.agent.run({ system: 'S', messages: [], tools: ['search'], ctx: ctx() }))
    const finish = events.at(-1) as Extract<AgentEvent, { type: 'finish' }>
    expect(finish.issues?.map((i) => i.code)).toContain('unverified_price')
  })

  it('emits an error event (no finish) when the budget is spent', async () => {
    const services = createFakeServices({ budgetExceeded: true })
    services.tools = createToolRegistry(() => services)
    services.agent = createAgentRuntime(() => services)
    const events = await collect(services.agent.run({ system: 'S', messages: [], tools: [], ctx: createTestContext() }))
    expect(events).toEqual([{ type: 'error', code: 'budget_exceeded', message: 'Budget exhausted' }])
  })
})

describe('actions confirm/reject', () => {
  const propose = async () => {
    const s = setup()
    const { action } = await s.services.actions.propose(s.tools.proposeReturn, { q: 'order 42' }, { ...s.ctx(), services: s.services })
    return { ...s, action }
  }

  it('confirms once per idempotency key and runs the tool exactly once', async () => {
    const { services, ctx, action, runs, payload } = await propose()
    const a = await services.actions.confirm(action.id, 'key-1', ctx())
    const b = await services.actions.confirm(action.id, 'key-1', ctx())
    expect(a.status).toBe('done')
    expect(b).toEqual(a)
    expect(runs.proposeReturn).toBe(1)
    await expect(services.actions.confirm(action.id, 'key-2', ctx())).rejects.toMatchObject({ code: 'conflict' })
    expect(services.log.audit.some((e: any) => e.action === 'action.confirm')).toBe(true)
    expect(payload.store.get(ACTIONS_SLUG)!.get(action.id)).toMatchObject({ idempotencyKey: 'key-1', status: 'done' })
  })

  it('rejects a different visitor and allows staff', async () => {
    const { services, ctx, action } = await propose()
    await expect(services.actions.confirm(action.id, 'k', ctx({ actor: { kind: 'visitor', roles: [], visitorId: 'v_other' } }))).rejects.toMatchObject({
      code: 'forbidden',
    })
    await expect(services.actions.reject(action.id, ctx({ actor: { kind: 'customer', roles: ['customer'], customerId: 'c9' } }))).rejects.toMatchObject({
      code: 'forbidden',
    })
    const done = await services.actions.confirm(action.id, 'k', ctx({ actor: staffActor, surface: 'admin' }))
    expect(done.status).toBe('done')
  })

  it('refuses expired actions', async () => {
    const s = setup()
    let now = Date.now()
    s.services.actions = createActionService(() => s.services, { now: () => now })
    const { action } = await s.services.actions.propose(s.tools.proposeReturn, { q: 'x' }, { ...s.ctx(), services: s.services })
    now += 16 * 60_000
    await expect(s.services.actions.confirm(action.id, 'k', s.ctx())).rejects.toMatchObject({ code: 'conflict' })
    expect(s.runs.proposeReturn).toBeUndefined()
  })

  it('staff-tier proposals can only be approved by staff', async () => {
    const s = setup()
    const { action } = await s.services.actions.propose(s.tools.publish, { q: 'x' }, { ...s.ctx({ actor: staffActor, surface: 'admin' }), services: s.services })
    await expect(s.services.actions.confirm(action.id, 'k', s.ctx())).rejects.toMatchObject({ code: 'forbidden' })
    expect((await s.services.actions.confirm(action.id, 'k', s.ctx({ actor: staffActor }))).status).toBe('done')
  })

  it('reject marks the action rejected and confirm afterwards conflicts', async () => {
    const { services, ctx, action, runs } = await propose()
    expect((await services.actions.reject(action.id, ctx())).status).toBe('rejected')
    await expect(services.actions.confirm(action.id, 'k', ctx())).rejects.toMatchObject({ code: 'conflict' })
    expect(runs.proposeReturn).toBeUndefined()
  })
})
