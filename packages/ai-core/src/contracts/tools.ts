/**
 * Agent tool contracts (design doc §7.2). Tiers are enforced in code by the agent runtime,
 * never by prompt instructions.
 */
import type { z } from 'zod'
import type { ConceptName } from './adapters'
import type { AIContext } from './context'
import type { Card, Citation } from './wire'
import type { CoreServices } from './services'
import type { ChatMessage, TaskClass } from './providers'

/**
 * read    — runs automatically with the caller's access.
 * low     — runs automatically; reversible; logged to audit.
 * confirm — runtime creates an ai-actions row (status 'proposed') and emits a confirmation card;
 *           the tool's run() executes only via POST /api/ai/actions/:id/confirm.
 * staff   — never exposed on storefront/channel surfaces or to non-staff actors.
 */
export type ToolTier = 'read' | 'low' | 'confirm' | 'staff'

export const TIER_ORDER: Record<ToolTier, number> = { read: 0, low: 1, confirm: 2, staff: 3 }

export interface ToolContext extends AIContext {
  services: CoreServices
  /** Set when a confirm-tier tool is running after confirmation. */
  actionId?: string
}

export interface ToolResult<O = unknown> {
  /** Compact data returned to the model (IDs and key fields, not whole docs). */
  data: O
  /** Cards streamed to the client; prices/stock come from here. */
  cards?: Card[]
  citations?: Citation[]
}

export interface AITool<I = any, O = any> {
  name: string
  description: string
  tier: ToolTier
  input: z.ZodType<I>
  /** Concepts that must be mapped for this tool to be available (startup validation). */
  requires?: ConceptName[]
  /** Only offer the tool when this returns true (e.g. order tools need a verified customer). */
  available?(ctx: ToolContext): boolean
  /** For confirm-tier tools: short title + summary shown on the confirmation card. */
  describeAction?(input: I, ctx: ToolContext): Promise<{ title: string; summary: string }> | { title: string; summary: string }
  run(input: I, ctx: ToolContext): Promise<ToolResult<O>>
}

export type AgentEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-start'; toolName: string; toolCallId: string; input: unknown }
  | { type: 'tool-end'; toolName: string; toolCallId: string; ok: boolean; data?: unknown }
  | { type: 'card'; card: Card }
  | { type: 'citations'; citations: Citation[] }
  | {
      type: 'finish'
      /** Final text after output guardrails (authoritative; may differ from the streamed deltas). */
      text: string
      steps: number
      toolResults: { toolName: string; data: unknown }[]
      /** Output guardrail issues (unverified prices/stock, removed links). */
      issues?: { code: string; message: string }[]
    }
  | { type: 'error'; code: string; message: string }

export interface RunAgentOptions {
  task?: TaskClass
  system: string
  messages: ChatMessage[]
  /** Tool names from the registry, or tool objects. Tier/availability filtering happens in the runtime. */
  tools: (string | AITool)[]
  ctx: AIContext
  maxSteps?: number
  temperature?: number
  maxOutputTokens?: number
  signal?: AbortSignal
  /** Thread id, stored on proposed actions. */
  conversationId?: string
}
