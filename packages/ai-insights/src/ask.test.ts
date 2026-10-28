import { describe, expect, it } from 'vitest'
import { collect, createFakeServices, createMockProvider, createTestContext, createToolContext } from 'payload-ai-core/testing'
import type { Actor, StreamWireEvent } from 'payload-ai-core'
import { askEndpoint, askInsights } from './ask'
import { buildMetricTools } from './metrics/tools'
import { resolveInsightsOptions } from './options'
import { adapters, fakePayload, order } from './test/helpers'
import { REPORTS } from './collections'

const tools = buildMetricTools(resolveInsightsOptions())
const orders = [
  order('1', '2026-10-01T10:00:00Z', 10_000),
  order('2', '2026-10-01T18:00:00Z', 5_050),
  order('3', '2026-10-06T09:00:00Z', 20_000),
]
const manager: Actor = { kind: 'staff', roles: ['manager'], user: { id: 'u1' } as any }
const revenueCall = { toolCalls: [{ toolCallId: 't1', toolName: 'revenue', input: { period: { from: '2026-10-01', to: '2026-10-14' }, groupBy: 'day' } }] }

const setup = (actor: Actor = manager) => {
  const provider = createMockProvider()
  const services = createFakeServices({ provider, adapters: adapters(orders) })
  for (const t of tools) services.tools.register(t, 'insights')
  const fp = fakePayload({ collections: [REPORTS] })
  const ctx = createTestContext({ payload: fp.payload, module: 'insights', surface: 'admin', actor, adapters: services.adapters })
  return { provider, services, ctx, ...fp }
}

const textOf = (events: StreamWireEvent[]) => events.filter((e) => e.type === 'text').map((e) => (e as { delta: string }).delta).join('')

describe('POST /ai/insights/ask', () => {
  it('streams text and chart cards, verifies numbers and saves a report', async () => {
    const { provider, services, ctx, store } = setup()
    provider.enqueue(revenueCall, 'Revenue was ৳350.50 from 3 orders (average ৳116.83).')
    const events = await collect(askInsights({ ctx, services, input: { question: 'How much revenue in early October?' } }, tools))
    expect(events[0]).toMatchObject({ type: 'meta' })
    expect(events.some((e) => e.type === 'card' && e.card.type === 'chart')).toBe(true)
    expect(events.at(-1)).toMatchObject({ type: 'done', outcome: 'verified' })
    const report = store[REPORTS][0]
    expect(report).toMatchObject({ kind: 'ask', verification: 'verified', createdBy: 'u1', question: 'How much revenue in early October?' })
    expect(report.metricCalls[0]).toMatchObject({ tool: 'revenue', ok: true })
    expect(report.charts).toHaveLength(1)
  })

  it('catches an invented number and regenerates once', async () => {
    const { provider, services, ctx, store } = setup()
    provider.enqueue(revenueCall, 'Revenue was ৳999.00 from 3 orders.', 'Revenue was ৳350.50 from 3 orders.')
    const events = await collect(askInsights({ ctx, services, input: { question: 'Revenue?' } }, tools))
    expect(events.at(-1)).toMatchObject({ type: 'done', outcome: 'corrected' })
    expect(textOf(events)).toContain('**Correction**')
    expect(store[REPORTS][0].answer).toBe('Revenue was ৳350.50 from 3 orders.')
  })

  it('strips numbers that are still unverified after the retry', async () => {
    const { provider, services, ctx, store } = setup()
    provider.enqueue(revenueCall, 'Revenue grew 42% to ৳350.50.', 'Revenue grew 42% to ৳350.50.')
    const events = await collect(askInsights({ ctx, services, input: { question: 'Revenue?' } }, tools))
    expect(events.at(-1)).toMatchObject({ type: 'done', outcome: 'stripped' })
    expect(store[REPORTS][0].answer).toBe('Revenue grew [unverified] to ৳350.50.')
  })

  it('rejects non-managers and hides metric tools from them', async () => {
    for (const actor of [
      { kind: 'staff', roles: ['content'] },
      { kind: 'customer', roles: ['customer'], customerId: 'c1' },
      { kind: 'visitor', roles: [], visitorId: 'v' },
    ] as Actor[]) {
      const { services, ctx } = setup(actor)
      await expect(askEndpoint(tools).handler({ ctx, services, input: { question: 'Revenue?' }, req: {} as any })).rejects.toMatchObject({ code: 'forbidden' })
      await expect(collect(askInsights({ ctx, services, input: { question: 'Revenue?' } }, tools))).rejects.toMatchObject({ code: 'forbidden' })
      expect(services.tools.availableFor(createToolContext(services, { actor, surface: 'admin' }))).toHaveLength(0)
    }
    expect(askEndpoint(tools).access).toEqual(['manager'])
  })

  it('offers metric tools to managers and store admins', () => {
    const { services } = setup()
    const names = (roles: Actor['roles']) =>
      services.tools.availableFor(createToolContext(services, { actor: { kind: 'staff', roles }, surface: 'admin' })).map((t) => t.name)
    expect(names(['manager'])).toEqual(expect.arrayContaining(['revenue', 'topProducts', 'repeatRate', 'cartAbandonment', 'searchZeroResults', 'aiImpact']))
    expect(names(['store-admin'])).toContain('revenue')
    expect(tools.every((t) => t.tier === 'read')).toBe(true)
  })
})
