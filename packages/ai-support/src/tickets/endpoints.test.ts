import { describe, expect, it, vi } from 'vitest'
import { setup } from '../../test/setup'
import { replyEndpoint, suggestEndpoint } from './endpoints'

describe('suggest endpoint', () => {
  it('grounds the suggestion in knowledge + linked order + thread and stores it on the ticket', async () => {
    const t = setup()
    await t.addPolicy('pol-ship', 'Shipping policy', 'Orders inside Dhaka arrive in 2-3 days.')
    const search = vi.spyOn(t.services.knowledge, 'search')
    const { id } = await t.createTicket({
      subject: 'Late delivery',
      customerId: 'cust-1',
      customerEmail: 'rina@example.com',
      linkedOrderId: 'ord-1',
      transcript: [{ role: 'user', text: 'My saree has not arrived yet.' }],
    })
    t.services.provider.enqueue({ object: { reply: 'Your order is in transit with Pathao (ETA 2026-10-30).', summary: 'Customer asks about a late saree order.' } })
    const input = suggestEndpoint.input!.parse({ params: { id } })
    const out = (await suggestEndpoint.handler({ ctx: t.staff(), services: t.services, input, req: t.req('agent-1', { id }) })) as {
      suggestedReply: string
      citations: { sourceId: string }[]
      order: { number: string } | null
    }
    expect(search).toHaveBeenCalledWith('My saree has not arrived yet.', expect.anything(), expect.objectContaining({ visibility: ['public', 'customers'] }))
    expect(out.citations.map((c) => c.sourceId)).toContain('pol-ship')
    expect(out.order?.number).toBe('1001')
    const prompt = t.services.provider.calls[0].messages.at(-1)!.content as string
    expect(prompt).toContain('Orders inside Dhaka arrive in 2-3 days.')
    expect(prompt).toContain('Pathao')
    expect(prompt).toContain('My saree has not arrived yet.')
    expect(t.ticket(id)).toMatchObject({ suggestedReply: out.suggestedReply, summary: 'Customer asks about a late saree order.' })
  })
})

describe('reply endpoint', () => {
  it('sends the agent-edited reply, records it, sets status and audits', async () => {
    const t = setup()
    const { id } = await t.createTicket({ subject: 'Hi', customerEmail: 'rina@example.com', suggestedReply: 'Draft' })
    const input = replyEndpoint.input!.parse({ params: { id }, body: 'Edited answer', status: 'solved' })
    const out = await replyEndpoint.handler({ ctx: t.staff('agent-7'), services: t.services, input, req: t.req('agent-7', { id }) })
    expect(out).toMatchObject({ ok: true, channel: 'email', status: 'solved' })
    expect(t.payload.emails[0]).toMatchObject({ to: 'rina@example.com', text: 'Edited answer' })
    expect(t.ticket(id).replies).toEqual([expect.objectContaining({ body: 'Edited answer', auto: false, sentBy: 'agent-7' })])
    expect(t.ticket(id).status).toBe('solved')
    expect(t.services.log.audit).toEqual([expect.objectContaining({ action: 'support.reply' })])
  })

  it('fails clearly when there is no way to reach the customer', async () => {
    const t = setup()
    const { id } = await t.createTicket({ subject: 'Hi' })
    const input = replyEndpoint.input!.parse({ params: { id }, body: 'Hello' })
    await expect(replyEndpoint.handler({ ctx: t.staff(), services: t.services, input, req: t.req('a', { id }) })).rejects.toMatchObject({ code: 'conflict' })
  })
})
