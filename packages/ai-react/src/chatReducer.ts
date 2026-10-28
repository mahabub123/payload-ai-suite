import type { ActionStatus, Card, StreamWireEvent } from 'payload-ai-core/wire'

export interface ChatUIMessage {
  /** Client id (stable key). */
  id: string
  /** Server message id (for feedback) once known. */
  serverId?: string
  role: 'user' | 'assistant'
  text: string
  cards: Card[]
  status: 'streaming' | 'done' | 'error'
  /** Tool currently running for this message, for a "checking stock…" indicator. */
  activeTool?: string
  feedback?: 'up' | 'down'
  outcome?: string
}

export interface ChatState {
  conversationId?: string
  messages: ChatUIMessage[]
  streaming: boolean
  aiNotice: boolean
  handedOff: boolean
  error?: { code: string; message: string }
}

export type ChatAction =
  | { type: 'send'; id: string; assistantId: string; text: string }
  | { type: 'event'; assistantId: string; event: StreamWireEvent }
  | { type: 'fail'; assistantId: string; code: string; message: string }
  | { type: 'stop'; assistantId: string }
  | { type: 'load'; conversationId: string; messages: ChatUIMessage[]; handedOff?: boolean }
  | { type: 'conversation'; conversationId?: string }
  | { type: 'action-result'; actionId: string; status: ActionStatus; message: string }
  | { type: 'feedback'; id: string; rating: 'up' | 'down' }
  | { type: 'reset' }

export const initialChatState: ChatState = { messages: [], streaming: false, aiNotice: true, handedOff: false }

const patchMessage = (s: ChatState, id: string, f: (m: ChatUIMessage) => ChatUIMessage): ChatState => ({
  ...s,
  messages: s.messages.map((m) => (m.id === id ? f(m) : m)),
})

export const chatReducer = (state: ChatState, action: ChatAction): ChatState => {
  switch (action.type) {
    case 'send':
      return {
        ...state,
        streaming: true,
        error: undefined,
        messages: [
          ...state.messages,
          { id: action.id, role: 'user', text: action.text, cards: [], status: 'done' },
          { id: action.assistantId, role: 'assistant', text: '', cards: [], status: 'streaming' },
        ],
      }
    case 'event': {
      const ev = action.event
      switch (ev.type) {
        case 'meta':
          return { ...state, conversationId: ev.conversationId ?? state.conversationId, aiNotice: ev.aiNotice ?? state.aiNotice }
        case 'text':
          return patchMessage(state, action.assistantId, (m) => ({ ...m, text: m.text + ev.delta }))
        case 'card': {
          const s = patchMessage(state, action.assistantId, (m) => ({ ...m, cards: [...m.cards, ev.card] }))
          return ev.card.type === 'handoff' ? { ...s, handedOff: true } : s
        }
        case 'tool':
          return patchMessage(state, action.assistantId, (m) => ({ ...m, activeTool: ev.status === 'started' ? ev.name : undefined }))
        case 'done':
          return {
            ...patchMessage(state, action.assistantId, (m) => ({ ...m, status: 'done', activeTool: undefined, serverId: ev.messageId, outcome: ev.outcome })),
            streaming: false,
          }
        case 'error':
          return chatReducer(state, { type: 'fail', assistantId: action.assistantId, code: ev.code, message: ev.message })
        default:
          return state
      }
    }
    case 'fail':
      return {
        ...patchMessage(state, action.assistantId, (m) => ({ ...m, status: 'error', activeTool: undefined })),
        streaming: false,
        error: { code: action.code, message: action.message },
      }
    case 'stop':
      return { ...patchMessage(state, action.assistantId, (m) => ({ ...m, status: 'done', activeTool: undefined })), streaming: false }
    case 'load':
      return { ...state, conversationId: action.conversationId, messages: action.messages, handedOff: action.handedOff ?? state.handedOff }
    case 'conversation':
      return { ...state, conversationId: action.conversationId }
    case 'action-result': {
      // Show the result right under the confirmation card it answers.
      const card: Card = { type: 'action-result', actionId: action.actionId, status: action.status, message: action.message }
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.cards.some((c) => c.type === 'confirmation' && c.actionId === action.actionId)
            ? { ...m, cards: [...m.cards.filter((c) => !(c.type === 'action-result' && c.actionId === action.actionId)), card] }
            : m,
        ),
      }
    }
    case 'feedback':
      return patchMessage(state, action.id, (m) => ({ ...m, feedback: action.rating }))
    case 'reset':
      return { ...initialChatState }
  }
}

/** Has this confirmation already been answered (confirmed/rejected/failed)? */
export const actionResultFor = (m: ChatUIMessage, actionId: string) =>
  m.cards.find((c): c is Extract<Card, { type: 'action-result' }> => c.type === 'action-result' && c.actionId === actionId)
