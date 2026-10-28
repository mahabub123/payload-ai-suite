import { z } from 'zod'
import type {
  AIContext,
  AIEndpointDefinition,
  AIEndpointHandlerArgs,
  AITool,
  Card,
  CoreServices,
  PromptTemplate,
  StreamWireEvent,
} from 'payload-ai-core'
import { AIError } from 'payload-ai-core'
import { checkNumbers, collectEvidence, stripNumbers } from './numbers'
import { periodSchema, resolvePeriod, periodJSON, type ResolvedPeriod } from './period'
import { saveReport } from './reports'
import { isInsightsActor } from './metrics/tools'

export const ASK_PROMPT = 'insights.ask'
export const FIX_PROMPT = 'insights.fix-numbers'

export const insightsPrompts: PromptTemplate[] = [
  {
    slug: ASK_PROMPT,
    task: 'reason',
    brandVoice: false,
    description: 'System prompt for "Ask your data".',
    system: [
      'You are a business analyst answering a store manager\'s question about their own data.',
      'You can ONLY learn numbers by calling the metric tools. Never estimate, extrapolate or invent a number.',
      'Every number you write must be copied from a tool result (formatted money strings are fine; you may round).',
      'Do not compute new numbers yourself (no sums, differences or ratios) unless the tool already returned them.',
      'If a tool reports unavailable, say that data is not available. Charts are shown to the user automatically.',
      'Answer in {{locale}}, concisely: a short headline, then 2-5 bullet points. Today is {{today}}. {{periodHint}}',
    ].join('\n'),
  },
  {
    slug: FIX_PROMPT,
    task: 'reason',
    brandVoice: false,
    description: 'Rewrites an insights answer so every number matches tool output.',
    system: [
      'You correct a data answer. The draft contains numbers that do not match the tool results.',
      'Rewrite the draft so that every number is copied exactly from the tool results; remove any claim whose number is not there.',
      'Return only the corrected answer text.',
    ].join('\n'),
  },
]

export const askInputSchema = z.object({
  question: z.string().trim().min(3).max(1000),
  period: periodSchema.optional(),
})

export type AskInput = z.infer<typeof askInputSchema>

export interface MetricCall {
  tool: string
  toolCallId: string
  input: unknown
  ok?: boolean
  output?: unknown
}

export interface Verification {
  status: 'verified' | 'corrected' | 'stripped'
  text: string
  unverified: string[]
}

const renderPrompt = async (services: CoreServices, slug: string, vars: Record<string, unknown>, ctx: AIContext) => {
  try {
    return (await services.prompts.render(slug, vars, ctx)).system
  } catch {
    const t = insightsPrompts.find((p) => p.slug === slug)!
    return t.system.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => String(vars[k] ?? ''))
  }
}

/**
 * Number check: guardrails.checkOutput + our own matcher. On a mismatch regenerate once with the evidence;
 * if numbers are still unsupported, strip them.
 */
export const verifyAnswer = async (
  draft: string,
  evidenceSources: unknown[],
  toolOutputs: unknown[],
  services: CoreServices,
  ctx: AIContext,
): Promise<Verification> => {
  const evidence = collectEvidence(...evidenceSources, ...toolOutputs)
  const g = services.guardrails.checkOutput(draft, ctx, { toolResults: toolOutputs })
  const n = checkNumbers(g.text, evidence)
  if (g.ok && n.ok) return { status: 'verified', text: g.text, unverified: [] }

  let fixed = g.text
  try {
    const system = await renderPrompt(services, FIX_PROMPT, {}, ctx)
    const issues = [...n.unverified.map((t) => `unsupported number: ${t.raw}`), ...g.issues.map((i) => i.message)]
    const r = await services.ai.generateText(
      {
        task: 'reason',
        system,
        temperature: 0,
        prompt: [
          services.guardrails.quote('tool_results', JSON.stringify(toolOutputs)),
          services.guardrails.quote('draft', g.text),
          `Problems:\n- ${issues.join('\n- ')}`,
        ].join('\n\n'),
      },
      ctx,
    )
    if (r.text.trim()) fixed = r.text.trim()
  } catch {
    // Fall through to stripping the unverified numbers from the original draft.
  }
  const g2 = services.guardrails.checkOutput(fixed, ctx, { toolResults: toolOutputs })
  const n2 = checkNumbers(g2.text, evidence)
  if (g2.ok && n2.ok) return { status: 'corrected', text: g2.text, unverified: n.unverified.map((t) => t.raw) }
  return { status: 'stripped', text: stripNumbers(g2.text, n2.unverified), unverified: n2.unverified.map((t) => t.raw) }
}

const errorEvent = (e: unknown, requestId: string): StreamWireEvent => ({
  type: 'error',
  code: e instanceof AIError ? e.code : 'unknown',
  message: e instanceof AIError ? e.message : 'Something went wrong answering this question.',
  requestId,
})

/** POST /ai/insights/ask — streams text + chart cards, verifies numbers, saves an ai-insight-reports row. */
export async function* askInsights(
  args: Pick<AIEndpointHandlerArgs<AskInput>, 'ctx' | 'services' | 'input'>,
  tools: AITool[],
  now: Date = new Date(),
): AsyncIterable<StreamWireEvent> {
  const { services, input } = args
  const ctx: AIContext = { ...args.ctx, surface: 'admin' }
  if (!isInsightsActor(ctx)) throw new AIError('forbidden', 'Insights are available to managers only.')
  yield { type: 'meta', requestId: ctx.requestId }

  const check = services.guardrails.checkInput(input.question, ctx)
  if (!check.ok) {
    yield { type: 'error', code: 'validation', message: check.issues[0]?.message ?? 'Question rejected.', requestId: ctx.requestId }
    return
  }

  let period: ResolvedPeriod | undefined
  try {
    period = input.period ? resolvePeriod(input.period, now) : undefined
  } catch (e) {
    yield errorEvent(new AIError('validation', (e as Error).message), ctx.requestId)
    return
  }
  const periodHint = period
    ? `Unless the question says otherwise, use period { "from": "${period.from.toISOString()}", "to": "${period.to.toISOString()}" } (${period.label}).`
    : 'Default period: last28d.'
  const system = `${await renderPrompt(services, ASK_PROMPT, { locale: ctx.locale, today: now.toISOString().slice(0, 10), periodHint }, ctx)}\n\n${services.guardrails.systemPolicy(ctx)}`

  const calls = new Map<string, MetricCall>()
  const charts: Card[] = []
  let text = ''
  let outputs: unknown[] = []
  try {
    for await (const ev of services.agent.run({
      task: 'reason',
      system,
      messages: [{ role: 'user', content: input.question }],
      tools,
      ctx,
      maxSteps: 5,
      temperature: 0,
    })) {
      switch (ev.type) {
        case 'text-delta':
          text += ev.text
          yield { type: 'text', delta: ev.text }
          break
        case 'tool-start':
          calls.set(ev.toolCallId, { tool: ev.toolName, toolCallId: ev.toolCallId, input: ev.input })
          yield { type: 'tool', name: ev.toolName, status: 'started' }
          break
        case 'tool-end': {
          const c = calls.get(ev.toolCallId)
          if (c) Object.assign(c, { ok: ev.ok, output: ev.data })
          yield { type: 'tool', name: ev.toolName, status: ev.ok ? 'done' : 'error' }
          break
        }
        case 'card':
          if (ev.card.type === 'chart') {
            charts.push(ev.card)
            yield { type: 'card', card: ev.card }
          }
          break
        case 'finish':
          text = ev.text || text
          outputs = ev.toolResults.map((r) => r.data)
          break
        case 'error':
          yield { type: 'error', code: ev.code, message: ev.message, requestId: ctx.requestId }
          return
      }
    }
  } catch (e) {
    yield errorEvent(e, ctx.requestId)
    return
  }
  if (!outputs.length) outputs = [...calls.values()].filter((c) => c.ok).map((c) => c.output)

  const metricCalls = [...calls.values()]
  const evidenceSources = [input.question, metricCalls.map((c) => c.input), period ? periodJSON(period) : undefined]
  const v = await verifyAnswer(text, evidenceSources, outputs, services, ctx)
  if (v.status !== 'verified') {
    yield {
      type: 'text',
      delta: `\n\n---\n**Correction** (some numbers above did not match the data${v.status === 'stripped' ? ' and were removed' : ''}):\n\n${v.text}`,
    }
  }

  let reportId: string | number | undefined
  try {
    const firstPeriod = period ? periodJSON(period) : firstToolPeriod(metricCalls)
    const saved = await saveReport(
      ctx.payload,
      {
        question: input.question,
        kind: 'ask',
        period: firstPeriod,
        answer: v.text,
        verification: v.status,
        metricCalls,
        charts,
        createdBy: (ctx.actor.user as { id?: string | number } | null | undefined)?.id,
      },
      ctx.tenant,
    )
    reportId = saved.id
  } catch (e) {
    ctx.payload.logger?.error?.({ err: e, requestId: ctx.requestId }, '[ai-insights] failed to save report')
  }
  yield { type: 'done', messageId: reportId === undefined ? undefined : String(reportId), outcome: v.status }
}

const firstToolPeriod = (calls: MetricCall[]) => {
  for (const c of calls) {
    const p = (c.output as { period?: { from: string; to: string; label: string } } | undefined)?.period
    if (p?.from) return p
  }
  return undefined
}

export const askEndpoint = (tools: AITool[]): AIEndpointDefinition<AskInput> => ({
  path: '/ai/insights/ask',
  method: 'post',
  module: 'insights',
  access: ['manager'],
  surface: 'admin',
  input: askInputSchema,
  rateLimit: { limit: 20, windowSec: 60 },
  handler: async (args) => {
    // The guard pipeline already enforces the role; check again before any streaming starts.
    if (!isInsightsActor(args.ctx)) throw new AIError('forbidden', 'Insights are available to managers only.')
    return askInsights(args, tools)
  },
})
