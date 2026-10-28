import { describe, expect, it, vi } from 'vitest'
import { setup } from '../../test/setup'
import { triageTicket } from './triage'
import { onSupportReply } from './reply'

const triageReply = (o: Partial<{ topic: string; confidence: number; orderNumber: string | null }> = {}) => ({
  object: { topic: 'order-status', priority: 'high', sentiment: 'negative', language: 'en', orderNumber: '#1001', confidence: 0.95, ...o },
})
const answerReply = (reply = 'Your order 1001 is in transit with Pathao, expected 2026-10-30.', confidence = 0.95) => ({
  object: { answerable: true, reply, confidence },
})

const ticketData = {
  subject: 'Where is my order?',
  customerEmail: 'rina@example.com',
  customerId: 'cust-1',
  transcript: [{ role: 'user', text: 'Hi, where is my order #1001? It is late.' }],
}

describe('triage job', () => {
  it('updates topic, priority, sentiment, language and links the order', async () => {
    const t = setup({ autoAnswerTopics: [] })
    const { id } = await t.createTicket(ticketData)
    t.services.provider.enqueue(triageReply())
    const r = await triageTicket(t.payload, t.services, t.options, { ticketId: id })
    expect(r.linkedOrderId).toBe('ord-1')
    expect(t.ticket(id)).toMatchObject({
      topic: 'order-status',
      priority: 'high',
      sentiment: 'negative',
      language: 'en',
      linkedOrderId: 'ord-1',
      triageConfidence: 0.95,
    })
    expect(t.ticket(id).triagedAt).toBeTruthy()
    // the ticket is quoted data in the prompt
    expect(t.services.provider.calls[0].messages.at(-1)!.content).toContain('<ticket>')
    // idempotent: second run skips
    expect((await triageTicket(t.payload, t.services, t.options, { ticketId: id })).skipped).toBe('already-triaged')
  })

  it('rejects topics outside the configured list', async () => {
    const t = setup()
    const { id } = await t.createTicket(ticketData)
    t.services.provider.enqueue(triageReply({ topic: 'crypto-scam' }))
    await expect(triageTicket(t.payload, t.services, t.options, { ticketId: id })).rejects.toMatchObject({ code: 'bad_request' })
  })
})

describe('auto-answer', () => {
  it('answers when topic is allow-listed, confidence >= bar and grounded (order data)', async () => {
    const t = setup()
    const { id } = await t.createTicket(ticketData)
    t.services.provider.enqueue(triageReply(), answerReply())
    const r = await triageTicket(t.payload, t.services, t.options, { ticketId: id })
    expect(r.autoAnswer).toEqual({ sent: true, channel: 'email' })
    expect(t.payload.emails).toEqual([expect.objectContaining({ to: 'rina@example.com', subject: 'Re: Where is my order?' })])
    const doc = t.ticket(id)
    expect(doc.status).toBe('pending')
    expect(doc.autoAnswered).toBe(true)
    expect(doc.replies).toEqual([expect.objectContaining({ auto: true, channel: 'email' })])
    expect(t.services.log.audit).toEqual([expect.objectContaining({ action: 'support.auto-answer' })])
  })

  it('does not answer below the confidence bar', async () => {
    const t = setup({ autoAnswerConfidence: 0.9 })
    const { id } = await t.createTicket(ticketData)
    t.services.provider.enqueue(triageReply({ confidence: 0.89 }))
    const r = await triageTicket(t.payload, t.services, t.options, { ticketId: id })
    expect(r.autoAnswer).toEqual({ sent: false, reason: 'low-confidence' })
    expect(t.payload.emails).toHaveLength(0)
    expect(t.ticket(id).status).toBe('open')
  })

  it('does not answer topics that are not allow-listed, however confident', async () => {
    const t = setup()
    const { id } = await t.createTicket({ ...ticketData, transcript: [{ role: 'user', text: 'I want a refund' }] })
    t.services.provider.enqueue(triageReply({ topic: 'refund', confidence: 0.99, orderNumber: null }))
    const r = await triageTicket(t.payload, t.services, t.options, { ticketId: id })
    expect(r.autoAnswer).toEqual({ sent: false, reason: 'topic-not-allowed' })
    expect(t.payload.emails).toHaveLength(0)
  })

  it('does not answer when nothing grounds the answer', async () => {
    const t = setup()
    const { id } = await t.createTicket({ subject: 'Opening hours?', customerEmail: 'x@example.com', transcript: [{ role: 'user', text: 'When are you open?' }] })
    t.services.provider.enqueue(triageReply({ topic: 'store-hours', orderNumber: null }))
    const r = await triageTicket(t.payload, t.services, t.options, { ticketId: id })
    expect(r.autoAnswer).toEqual({ sent: false, reason: 'not-grounded' })
    expect(t.services.provider.calls).toHaveLength(1) // no answer generation attempted
  })

  it('answers from policies (knowledge) and delivers through a channel listener when one handles it', async () => {
    const t = setup()
    await t.addPolicy('pol-1', 'Store hours', 'We are open every day from 10am to 8pm.')
    const listener = vi.fn(async () => true)
    onSupportReply(t.payload, listener)
    const { id } = await t.createTicket({ subject: 'Hours', source: 'channel', transcript: [{ role: 'user', text: 'When are you open?' }] })
    t.services.provider.enqueue(triageReply({ topic: 'store-hours', orderNumber: null }), answerReply('We are open every day from 10am to 8pm.'))
    const r = await triageTicket(t.payload, t.services, t.options, { ticketId: id })
    expect(r.autoAnswer).toEqual({ sent: true, channel: 'hook' })
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ auto: true, body: 'We are open every day from 10am to 8pm.' }), t.payload)
    expect(t.payload.emails).toHaveLength(0)
  })

  it('does not send when the model says the facts are insufficient', async () => {
    const t = setup()
    const { id } = await t.createTicket(ticketData)
    t.services.provider.enqueue(triageReply(), { object: { answerable: false, reply: '', confidence: 0.2 } })
    const r = await triageTicket(t.payload, t.services, t.options, { ticketId: id })
    expect(r.autoAnswer).toEqual({ sent: false, reason: 'not-answerable' })
    expect(t.payload.emails).toHaveLength(0)
  })
})
