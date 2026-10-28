import type { AIContext, AITool, CoreServices, StreamWireEvent } from '@payload-ai-suite/ai-core'

export interface CopilotChatInput {
  message: string
  conversationId?: string
  /** Current admin location, e.g. { collection: 'products', id: '123' }. */
  page?: { collection?: string; id?: string | number; url?: string }
}

const SYSTEM = (allowed: string[]) =>
  [
    'You are the staff copilot inside the Payload admin.',
    `You can read these collections: ${allowed.join(', ') || '(none)'}.`,
    'Use findDocuments / summarizeDocument to look things up and copilotSearchKnowledge for policies and docs.',
    'You never write data directly. For any change to documents, call proposeBulkEdit: it saves a diff the staff member reviews and applies.',
    'Be brief. Refer to documents by id and title.',
  ].join('\n')

/** Copilot chat turn: thread (channel 'admin') -> agent with staff tools -> SSE wire events. */
export async function* copilotChat(
  services: CoreServices,
  ctx: AIContext,
  input: CopilotChatInput,
  tools: AITool[],
  allowed: string[],
): AsyncIterable<StreamWireEvent> {
  const thread = await services.memory.thread(ctx, { conversationId: input.conversationId, channel: 'admin' })
  yield { type: 'meta', requestId: ctx.requestId, conversationId: thread.id }
  const check = services.guardrails.checkInput(input.message, ctx)
  if (!check.ok) {
    yield { type: 'error', code: 'validation', message: check.issues[0]?.message ?? 'Message rejected', requestId: ctx.requestId }
    return
  }
  const history = await services.memory.context(thread.id, ctx, { lastTurns: 10 })
  await services.memory.append(thread.id, { role: 'user', text: input.message }, ctx)

  const pageHint = input.page?.collection ? `\nThe staff member is viewing ${input.page.collection}${input.page.id ? `/${input.page.id}` : ''}.` : ''
  const system = `${services.guardrails.systemPolicy(ctx)}\n\n${SYSTEM(allowed)}${pageHint}${history.summary ? `\n\nConversation so far: ${history.summary}` : ''}`

  const cards: NonNullable<Parameters<typeof services.memory.append>[1]['cards']> = []
  const toolCalls: unknown[] = []
  let text = ''
  try {
    for await (const ev of services.agent.run({
      task: 'chat',
      system,
      messages: [...history.messages, { role: 'user', content: input.message }],
      tools,
      ctx,
    })) {
      switch (ev.type) {
        case 'text-delta':
          text += ev.text
          yield { type: 'text', delta: ev.text }
          break
        case 'tool-start':
          toolCalls.push({ name: ev.toolName, input: ev.input })
          yield { type: 'tool', name: ev.toolName, status: 'started' }
          break
        case 'tool-end':
          yield { type: 'tool', name: ev.toolName, status: ev.ok ? 'done' : 'error' }
          break
        case 'card':
          cards.push(ev.card)
          yield { type: 'card', card: ev.card }
          break
        case 'citations':
          cards.push({ type: 'citations', citations: ev.citations })
          yield { type: 'card', card: { type: 'citations', citations: ev.citations } }
          break
        case 'finish':
          text = ev.text || text
          break
        case 'error':
          yield { type: 'error', code: ev.code, message: ev.message, requestId: ctx.requestId }
          break
      }
    }
  } catch (e) {
    const err = e as { code?: string; message?: string }
    yield { type: 'error', code: err.code ?? 'unknown', message: err.message ?? 'Copilot failed', requestId: ctx.requestId }
    return
  }
  const saved = await services.memory.append(thread.id, { role: 'assistant', text, cards, toolCalls }, ctx)
  await services.memory.maybeSummarize(thread.id, ctx)
  yield { type: 'done', messageId: saved.id }
}
