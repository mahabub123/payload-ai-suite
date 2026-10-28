import type { AIContext, StreamWireEvent } from 'payload-ai-core'
import { runAssistantTurn } from 'payload-ai-assistant'

export interface AssistantTurnArgs {
  ctx: AIContext
  conversationId?: string
  message: string
  page?: { url?: string; offeringId?: string; cartId?: string }
  channel?: string
}

export type RunTurn = (args: AssistantTurnArgs) => AsyncIterable<StreamWireEvent>

/** The website assistant's turn runner, reused unchanged for every channel. */
export const defaultRunTurn: RunTurn = (args) => runAssistantTurn(args)
