import { describe, expect, it } from 'vitest'
import { segmentDefinition, segmentProposal, type SegmentDefinition } from './schema'
import { evaluateSegment } from './evaluate'
import { segmentPreviewEndpoint, segmentSaveEndpoint, refreshSegments } from './endpoints'
import { setup } from '../../test/setup'

const run = async (def: SegmentDefinition) => {
  const { adapters, staff } = setup()
  const ctx = staff('u1')
  return evaluateSegment(def, adapters, ctx.adapterCtx)
}

describe('segment filter evaluation', () => {
  it('purchasedCategory within N days', async () => {
    const r = await run({ match: 'all', conditions: [{ type: 'purchasedCategory', categoryIds: ['shoes'], withinDays: 30 }] })
    expect(r.members.map((m) => m.customerId).sort()).toEqual(['c1', 'c3'])
  })

  it('orderCount, totalSpent (minor units) and opt-in combined with all', async () => {
    const r = await run({
      match: 'all',
      conditions: [
        { type: 'orderCount', op: 'gte', value: 2 },
        { type: 'totalSpent', op: 'gt', amount: 60_000 },
        { type: 'marketingOptIn', value: true },
      ],
    })
    expect(r.members.map((m) => m.customerId)).toEqual(['c1'])
  })

  it('lastOrderDaysAgo for win-back, any-match', async () => {
    const r = await run({ match: 'all', conditions: [{ type: 'lastOrderDaysAgo', op: 'gt', value: 90 }] })
    expect(r.members.map((m) => m.customerId)).toEqual(['c2'])
    const any = await run({
      match: 'any',
      conditions: [
        { type: 'lastOrderDaysAgo', op: 'gt', value: 90 },
        { type: 'signedUpDaysAgo', op: 'lt', value: 7 },
      ],
    })
    expect(any.members.map((m) => m.customerId).sort()).toEqual(['c2', 'c4'])
  })

  it('masks emails in the sample', async () => {
    const r = await run({ match: 'all', conditions: [{ type: 'marketingOptIn', value: true }] })
    expect(r.size).toBe(3)
    expect(r.sample[0].email).toBe('a***@example.com')
    expect(JSON.stringify(r.sample)).not.toContain('alice@')
  })
})

describe('segment schema never accepts SQL', () => {
  it('rejects raw SQL, unknown keys and unknown condition types', () => {
    expect(segmentDefinition.safeParse('SELECT * FROM customers').success).toBe(false)
    expect(segmentDefinition.safeParse({ match: 'all', conditions: [], sql: 'SELECT 1' }).success).toBe(false)
    expect(segmentDefinition.safeParse({ match: 'all', conditions: [{ type: 'sql', query: 'DROP TABLE x' }] }).success).toBe(false)
    expect(
      segmentDefinition.safeParse({ match: 'all', conditions: [{ type: 'orderCount', op: 'gt', value: 1, where: '1=1' }] }).success,
    ).toBe(false)
    expect(segmentProposal.safeParse({ definition: { match: 'all', conditions: [{ type: 'marketingOptIn', value: true }] }, explanation: 'x', sql: 'y' }).success).toBe(false)
  })
})

describe('segment preview / save endpoints', () => {
  it('turns a description into a structured filter via the reason model and returns count + masked sample', async () => {
    const { services, staff, req } = setup()
    services.provider.enqueue({
      object: {
        definition: { match: 'all', conditions: [{ type: 'purchasedCategory', categoryIds: ['shoes'], withinDays: 30 }, { type: 'marketingOptIn', value: true }] },
        explanation: 'Opted-in customers who bought shoes in the last 30 days.',
      },
    })
    const ctx = staff('u1')
    const input = segmentPreviewEndpoint.input!.parse({ description: 'people who bought shoes last month' })
    const out = (await segmentPreviewEndpoint.handler({ ctx, services, input, req: req('u1') })) as { size: number; sample: { email?: string }[] }
    expect(out.size).toBe(1)
    expect(out.sample[0].email).toBe('a***@example.com')
    const call = services.provider.calls.at(-1)!
    expect(call.system).toContain('shoes: Shoes')
  })

  it('rejects filters referencing categories that do not exist', async () => {
    const { services, staff, req } = setup()
    services.provider.enqueue({ object: { definition: { match: 'all', conditions: [{ type: 'purchasedCategory', categoryIds: ['made-up'] }] }, explanation: '' } })
    const input = segmentPreviewEndpoint.input!.parse({ description: 'made up' })
    await expect(segmentPreviewEndpoint.handler({ ctx: staff('u1'), services, input, req: req('u1') })).rejects.toMatchObject({ code: 'validation' })
  })

  it('saves and refreshes a segment', async () => {
    const { services, staff, req, payload } = setup()
    const ctx = staff('u1')
    const input = segmentSaveEndpoint.input!.parse({ name: 'Opted in', definition: { match: 'all', conditions: [{ type: 'marketingOptIn', value: true }] } })
    const saved = (await segmentSaveEndpoint.handler({ ctx, services, input, req: req('u1') })) as { id: string; size: number }
    expect(saved.size).toBe(3)
    const r = await refreshSegments(services, services.systemContext(payload, { module: 'marketing' }))
    expect(r.refreshed).toBe(1)
  })
})
