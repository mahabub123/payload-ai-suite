import { describe, expect, it } from 'vitest'
import { chatReducer, initialChatState } from './chatReducer'
import type { ChatAction, ChatState } from './chatReducer'

const run = (actions: ChatAction[], s: ChatState = initialChatState) => actions.reduce(chatReducer, s)
const ev = (event: any): ChatAction => ({ type: 'event', assistantId: 'a1', event })

describe('chatReducer', () => {
  it('streams a reply: meta, text, tool, card, done', () => {
    const s = run([
      { type: 'send', id: 'u1', assistantId: 'a1', text: 'red dress?' },
      ev({ type: 'meta', requestId: 'r', conversationId: 'c1', aiNotice: true }),
      ev({ type: 'tool', name: 'searchOfferings', status: 'started' }),
      ev({ type: 'text', delta: 'Here ' }),
      ev({ type: 'card', card: { type: 'products', items: [] } }),
      ev({ type: 'tool', name: 'searchOfferings', status: 'done' }),
      ev({ type: 'text', delta: 'you go' }),
    ])
    expect(s.streaming).toBe(true)
    expect(s.conversationId).toBe('c1')
    expect(s.messages[1]).toMatchObject({ role: 'assistant', text: 'Here you go', status: 'streaming', activeTool: undefined })
    expect(s.messages[1].cards).toHaveLength(1)
    const done = chatReducer(s, ev({ type: 'done', messageId: 'm9', outcome: 'answered' }))
    expect(done.streaming).toBe(false)
    expect(done.messages[1]).toMatchObject({ status: 'done', serverId: 'm9', outcome: 'answered' })
  })

  it('records errors and hand-off', () => {
    const s = run([
      { type: 'send', id: 'u1', assistantId: 'a1', text: 'hi' },
      ev({ type: 'card', card: { type: 'handoff', ticketId: 't1', expectedReply: 'soon' } }),
      ev({ type: 'error', code: 'forbidden', message: 'nope', requestId: 'r' }),
    ])
    expect(s.handedOff).toBe(true)
    expect(s.streaming).toBe(false)
    expect(s.error).toEqual({ code: 'forbidden', message: 'nope' })
    expect(s.messages[1].status).toBe('error')
  })

  it('attaches action results to the message with the confirmation (replacing older results)', () => {
    const s = run([
      { type: 'send', id: 'u1', assistantId: 'a1', text: 'return it' },
      ev({ type: 'card', card: { type: 'confirmation', actionId: 'x1', tool: 'proposeReturn', title: 'Return', summary: '1 item', expiresAt: '2100-01-01T00:00:00Z' } }),
      ev({ type: 'done' }),
      { type: 'action-result', actionId: 'x1', status: 'failed', message: 'try again' },
      { type: 'action-result', actionId: 'x1', status: 'done', message: 'submitted' },
    ])
    const results = s.messages[1].cards.filter((c) => c.type === 'action-result')
    expect(results).toEqual([{ type: 'action-result', actionId: 'x1', status: 'done', message: 'submitted' }])
  })

  it('loads, gives feedback and resets', () => {
    let s = run([{ type: 'load', conversationId: 'c1', messages: [{ id: 'm1', serverId: 'm1', role: 'assistant', text: 'hi', cards: [], status: 'done' }] }])
    s = chatReducer(s, { type: 'feedback', id: 'm1', rating: 'down' })
    expect(s.messages[0].feedback).toBe('down')
    expect(chatReducer(s, { type: 'reset' })).toEqual(initialChatState)
  })
})
