import { z } from 'zod'
import type {
  AITool,
  AgentEvent,
  AgentRuntime,
  ChatMessage,
  CoreServices,
  MessagePart,
  RunAgentOptions,
  ToolCall,
  ToolContext,
  ToolSpec,
} from '../contracts'
import { AIError, isAIError } from '../contracts'
import { tierAllowed, missingConcepts } from '../tools'

export const MAX_AGENT_STEPS = 5
const MAX_RESULT_CHARS = 6000

/** Zod -> JSON schema for provider tool specs. */
export const toolSpec = (tool: AITool): ToolSpec => {
  let schema: Record<string, unknown>
  try {
    schema = z.toJSONSchema(tool.input as z.ZodType, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>
  } catch {
    schema = { type: 'object' }
  }
  const { $schema: _drop, ...inputSchema } = schema
  return { name: tool.name, description: tool.description, inputSchema }
}

/** Shrink tool output before it goes back to the model: cap arrays, long strings and depth. */
export const compactResult = (v: unknown, depth = 0): unknown => {
  if (v == null || typeof v === 'number' || typeof v === 'boolean') return v
  if (typeof v === 'string') return v.length > 600 ? `${v.slice(0, 600)}…` : v
  if (depth > 4) return Array.isArray(v) ? `[${v.length} items]` : '[object]'
  if (Array.isArray(v)) {
    const head = v.slice(0, 10).map((x) => compactResult(x, depth + 1))
    return v.length > 10 ? [...head, `…${v.length - 10} more`] : head
  }
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (x === undefined || typeof x === 'function') continue
      out[k] = compactResult(x, depth + 1)
    }
    return out
  }
  return String(v)
}

const serialize = (v: unknown): string => {
  const s = JSON.stringify(compactResult(v)) ?? 'null'
  return s.length > MAX_RESULT_CHARS ? `${s.slice(0, MAX_RESULT_CHARS)}…(truncated)` : s
}

const TOOL_FAILED = {
  error: 'tool failed',
  instruction: "The tool failed. Tell the user you couldn't check this right now and offer a human hand-off. Do not guess.",
}

/**
 * Model <-> tool loop. Tiers are enforced here:
 * read/low run immediately (low is audited), confirm/staff become proposals with a confirmation card
 * and never run in this loop. Retrieved/tool text goes back to the model as quoted data.
 */
export const createAgentRuntime = (svc: () => CoreServices): AgentRuntime => ({
  async *run(o: RunAgentOptions): AsyncIterable<AgentEvent> {
    const services = svc()
    const ctx: ToolContext = { ...o.ctx, services }
    const maxSteps = Math.min(Math.max(1, o.maxSteps ?? MAX_AGENT_STEPS), MAX_AGENT_STEPS)

    const tools: AITool[] = []
    for (const t of o.tools) {
      const tool = typeof t === 'string' ? services.tools.get(t) : t
      if (!tool || tools.some((x) => x.name === tool.name)) continue
      if (!tierAllowed(tool.tier, ctx)) continue
      if (missingConcepts(tool, (c) => services.isConceptAvailable(c)).length) continue
      if (tool.available && !safeBool(() => tool.available!(ctx))) continue
      tools.push(tool)
    }
    const specs = tools.map(toolSpec)

    const policy = services.guardrails.systemPolicy(ctx)
    const system = o.system.includes(policy) ? o.system : `${o.system}\n\n${policy}`
    const messages: ChatMessage[] = [...o.messages]
    const toolResults: { toolName: string; data: unknown }[] = []
    let text = ''
    let steps = 0

    for (let step = 1; step <= maxSteps; step++) {
      if (o.signal?.aborted) return
      steps = step
      const calls: ToolCall[] = []
      let stepText = ''
      try {
        const stream = services.ai.streamText(
          {
            task: o.task ?? 'chat',
            system,
            messages,
            tools: specs.length ? specs : undefined,
            temperature: o.temperature,
            maxOutputTokens: o.maxOutputTokens,
            signal: o.signal,
          },
          ctx,
        )
        for await (const ev of stream) {
          if (ev.type === 'text-delta') {
            stepText += ev.text
            yield { type: 'text-delta', text: ev.text }
          } else if (ev.type === 'tool-call') calls.push(ev.toolCall)
          else if (ev.type === 'error') throw ev.error
        }
      } catch (e) {
        if (o.signal?.aborted) return
        const err = isAIError(e) ? e : new AIError('unknown', 'The assistant is unavailable right now')
        if (!isAIError(e)) ctx.payload.logger?.error?.({ err: e, requestId: ctx.requestId, msg: '[ai-suite] agent model call failed' })
        yield { type: 'error', code: err.code, message: err.message }
        return
      }
      text += stepText
      if (!calls.length) break

      messages.push({
        role: 'assistant',
        content: [
          ...(stepText ? [{ type: 'text', text: stepText } as MessagePart] : []),
          ...calls.map((c): MessagePart => ({ type: 'tool-call', toolCallId: c.toolCallId, toolName: c.toolName, input: c.input })),
        ],
      })
      const resultParts: MessagePart[] = []
      for (const call of calls) {
        yield { type: 'tool-start', toolName: call.toolName, toolCallId: call.toolCallId, input: call.input }
        const outcome = await runCall(call, tools, ctx, services, o.conversationId)
        for (const ev of outcome.events) yield ev
        if (outcome.ok) toolResults.push({ toolName: call.toolName, data: outcome.data })
        yield { type: 'tool-end', toolName: call.toolName, toolCallId: call.toolCallId, ok: outcome.ok, data: outcome.ok ? outcome.data : undefined }
        resultParts.push({
          type: 'tool-result',
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: services.guardrails.quote(`tool_result name="${call.toolName}"`, serialize(outcome.modelOutput)),
          isError: !outcome.ok,
        })
      }
      messages.push({ role: 'tool', content: resultParts })
    }

    const checked = services.guardrails.checkOutput(text, ctx, { toolResults: toolResults.map((r) => r.data) })
    yield {
      type: 'finish',
      text: checked.text,
      steps,
      toolResults,
      ...(checked.issues.length ? { issues: checked.issues } : {}),
    }
  },
})

const safeBool = (f: () => boolean) => {
  try {
    return f()
  } catch {
    return false
  }
}

interface CallOutcome {
  ok: boolean
  data?: unknown
  modelOutput: unknown
  events: AgentEvent[]
}

const runCall = async (
  call: ToolCall,
  tools: AITool[],
  ctx: ToolContext,
  services: CoreServices,
  conversationId: string | undefined,
): Promise<CallOutcome> => {
  const tool = tools.find((t) => t.name === call.toolName)
  if (!tool) return { ok: false, modelOutput: { error: `Tool "${call.toolName}" is not available here.` }, events: [] }
  const parsed = tool.input.safeParse(call.input)
  if (!parsed.success) {
    return {
      ok: false,
      modelOutput: { error: 'invalid input', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
      events: [],
    }
  }
  const input = parsed.data
  if (tool.tier === 'confirm' || tool.tier === 'staff') {
    try {
      const { action, card } = await services.actions.propose(tool, input, ctx, { conversationId })
      const data = { status: 'awaiting_confirmation', actionId: action.id }
      return {
        ok: true,
        data,
        modelOutput: { ...data, note: 'A confirmation card is shown to the user. Nothing has happened yet; it runs only if they confirm.' },
        events: [{ type: 'card', card }],
      }
    } catch (e) {
      ctx.payload.logger?.error?.({ err: e, requestId: ctx.requestId, msg: `[ai-suite] propose ${tool.name} failed` })
      return { ok: false, modelOutput: TOOL_FAILED, events: [] }
    }
  }
  try {
    const res = await tool.run(input, ctx)
    if (tool.tier === 'low') {
      await services.audit
        .log({ action: 'tool.run', target: { id: tool.name }, after: compactResult(res.data), meta: { tool: tool.name, tier: 'low', input, module: ctx.module } }, ctx)
        .catch(() => undefined)
    }
    const events: AgentEvent[] = (res.cards ?? []).map((card) => ({ type: 'card', card }))
    if (res.citations?.length) events.push({ type: 'citations', citations: res.citations })
    return { ok: true, data: res.data, modelOutput: res.data, events }
  } catch (e) {
    ctx.payload.logger?.warn?.({ err: e, requestId: ctx.requestId, msg: `[ai-suite] tool ${tool.name} failed` })
    return { ok: false, modelOutput: TOOL_FAILED, events: [] }
  }
}
