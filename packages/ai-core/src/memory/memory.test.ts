import { describe, expect, it } from 'vitest'
import { createFakePayload, createFakeServices, createMockProvider, createTestContext } from '../testing'
import { createMemoryService, runRetention, SUMMARY_THRESHOLD } from './index'

const setup = () => {
  const provider = createMockProvider({ fallback: 'SUMMARY' })
  const services = createFakeServices({ provider })
  const payload = createFakePayload()
  const memory = createMemoryService(() => services)
  const visitor = (id: string) => createTestContext({ payload, module: 'assistant', actor: { kind: 'visitor', roles: [], visitorId: id } })
  return { services, payload, memory, visitor, provider }
}

describe('MemoryService', () => {
  it('enforces thread ownership', async () => {
    const { memory, visitor } = setup()
    const t = await memory.thread(visitor('v1'), { channel: 'web' })
    await memory.append(t.id, { role: 'user', text: 'hi' }, visitor('v1'))
    await expect(memory.thread(visitor('v2'), { conversationId: t.id, channel: 'web' })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(memory.append(t.id, { role: 'user', text: 'x' }, visitor('v2'))).rejects.toMatchObject({ code: 'forbidden' })
    await expect(memory.thread(visitor('v1'), { conversationId: 'missing', channel: 'web' })).rejects.toMatchObject({ code: 'not_found' })
    const ctx = await memory.context(t.id, visitor('v1'))
    expect(ctx.messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('a visitor who verifies an order keeps their thread; another visitor verified as the same customer does not', async () => {
    const { memory, payload, visitor } = setup()
    const verified = (vid: string) => createTestContext({ payload, module: 'assistant', actor: { kind: 'visitor', roles: [], visitorId: vid, customerId: '42' } })
    const t = await memory.thread(visitor('v1'), { channel: 'web' })
    await memory.append(t.id, { role: 'user', text: 'Where is order DS-2001?' }, verified('v1'))
    expect((await memory.context(t.id, verified('v1'))).messages).toHaveLength(1)
    await expect(memory.append(t.id, { role: 'user', text: 'x' }, verified('v2'))).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('customer threads are keyed by hashed customer id', async () => {
    const { memory, payload, services } = setup()
    const c = (id: string) => createTestContext({ payload, actor: { kind: 'customer', roles: ['customer'], customerId: id } })
    const t = await memory.thread(c('42'), { channel: 'web' })
    const doc = await payload.findByID({ collection: 'ai-conversations' as never, id: t.id })
    expect((doc as any).customerHash).toBe(services.crypto.hashId('42'))
    await expect(memory.thread(c('43'), { conversationId: t.id, channel: 'web' })).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('writes a rolling summary past the threshold', async () => {
    const { memory, visitor, payload, provider } = setup()
    const ctx = visitor('v1')
    const t = await memory.thread(ctx, { channel: 'web' })
    for (let i = 0; i < SUMMARY_THRESHOLD; i++) await memory.append(t.id, { role: i % 2 ? 'assistant' : 'user', text: `m${i}` }, ctx)
    await memory.maybeSummarize(t.id, ctx)
    expect(provider.calls).toHaveLength(0)
    await memory.append(t.id, { role: 'user', text: 'one more' }, ctx)
    await memory.maybeSummarize(t.id, ctx)
    expect(provider.calls).toHaveLength(1)
    const conv: any = await payload.findByID({ collection: 'ai-conversations' as never, id: t.id })
    expect(conv.summary).toBe('SUMMARY')
    expect(conv.summarizedUpTo).toBe(SUMMARY_THRESHOLD + 1 - 4)
    expect((await memory.context(t.id, ctx)).summary).toBe('SUMMARY')
  })

  it('customer memory get/set/clear', async () => {
    const { memory, payload } = setup()
    const ctx = createTestContext({ payload, actor: { kind: 'customer', roles: ['customer'], customerId: '7' } })
    expect(await memory.customerMemory.get(ctx)).toBeNull()
    await memory.customerMemory.set({ size: 'M' }, ctx)
    await memory.customerMemory.set({ color: 'red' }, ctx)
    expect(await memory.customerMemory.get(ctx)).toEqual({ size: 'M', color: 'red' })
    await memory.customerMemory.clear(ctx)
    expect(await memory.customerMemory.get(ctx)).toBeNull()
    await expect(memory.customerMemory.set({ a: 1 }, createTestContext({ payload }))).rejects.toMatchObject({ code: 'forbidden' })
  })
})

describe('retention', () => {
  it('deletes expired shopper and staff conversations with their messages', async () => {
    const payload = createFakePayload()
    const day = 86_400_000
    const now = new Date('2026-10-28T00:00:00Z')
    const ago = (d: number) => new Date(now.getTime() - d * day).toISOString()
    const mk = async (data: Record<string, unknown>) => {
      const c: any = await payload.create({ collection: 'ai-conversations' as never, data: { channel: 'web', module: 'assistant', ...data } as never })
      await payload.create({ collection: 'ai-messages' as never, data: { conversation: c.id, role: 'user', text: 'x' } as never })
      return c.id
    }
    const oldShopper = await mk({ visitorHash: 'v', lastMessageAt: ago(100) })
    const freshShopper = await mk({ visitorHash: 'v', lastMessageAt: ago(10) })
    const staffMid = await mk({ userId: '1', surface: 'admin', lastMessageAt: ago(100) })
    const staffOld = await mk({ userId: '1', surface: 'admin', lastMessageAt: ago(400) })
    const r = await runRetention(payload, { shopperChatsDays: 90, staffChatsDays: 365 }, now)
    expect(r).toEqual({ conversations: 2, messages: 2 })
    const left = [...payload.store.get('ai-conversations')!.keys()]
    expect(left.sort()).toEqual([freshShopper, staffMid].map(String).sort())
    expect(left).not.toContain(String(oldShopper))
    expect(left).not.toContain(String(staffOld))
    expect(await runRetention(payload, { shopperChatsDays: 90, staffChatsDays: 365 }, now)).toEqual({ conversations: 0, messages: 0 })
  })
})
