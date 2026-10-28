import { getAI, isAIError } from '@payload-ai-suite/ai-core'
import type {
  AIContext,
  Card,
  ChatMessage,
  ChatRequestBody,
  Citation,
  CoreServices,
  StreamWireEvent,
  ToolContext,
} from '@payload-ai-suite/ai-core'
import { createHandoff } from './handoff'
import { getAssistantOptions, resolveOptions } from './options'
import type { AiAssistantOptions, ResolvedAssistantOptions } from './options'
import { ASSISTANT_PROMPT } from './prompts'
import { beginTurn, endTurn, findVerifiedIdentity, hasOrderIdentity, MODULE, truncate, withCustomer } from './state'
import type { TurnState } from './state'
import { toolNames } from './tools'

export interface AssistantTurnInput {
  ctx: AIContext
  conversationId?: string
  message: string
  page?: ChatRequestBody['page']
  /** Conversation channel. Default 'web'. ai-channels passes 'whatsapp' | 'messenger' | 'email'. */
  channel?: string
  /** Override the options registered by aiAssistant() (tests, ai-channels). */
  options?: AiAssistantOptions
}

export type AssistantOutcome = 'answered' | 'added_to_cart' | 'handed_off'

const BUSY: Record<string, string> = {
  en: "Sorry, I'm a bit busy right now and can't answer properly.",
  bn: 'দুঃখিত, এই মুহূর্তে আমি ব্যস্ত, ঠিকভাবে উত্তর দিতে পারছি না।',
}
const REFUSE: Record<string, string> = {
  en: "Sorry, I can't help with that message. Could you rephrase your question about our products, orders or policies?",
  bn: 'দুঃখিত, এই বার্তায় আমি সাহায্য করতে পারছি না। আমাদের পণ্য, অর্ডার বা নীতিমালা নিয়ে প্রশ্নটি আবার লিখবেন?',
}
const CHECK_CARDS: Record<string, string> = {
  en: '_Please rely on the cards above for exact prices, stock and order details._',
  bn: '_সঠিক দাম, স্টক ও অর্ডারের তথ্যের জন্য উপরের কার্ডগুলো দেখুন।_',
}
const lang = (locale: string) => (locale?.toLowerCase().startsWith('bn') ? 'bn' : 'en')

export const contactText = (o: ResolvedAssistantOptions, locale: string, handedOff: boolean): string => {
  const bn = lang(locale) === 'bn'
  const c = o.contact
  const lines = [
    c.email && `${bn ? 'ইমেইল' : 'Email'}: ${c.email}`,
    c.phone && `${bn ? 'ফোন' : 'Phone'}: ${c.phone}`,
    c.whatsapp && `WhatsApp: ${c.whatsapp}`,
    c.hours && `${bn ? 'সময়' : 'Hours'}: ${c.hours}`,
  ].filter(Boolean)
  const parts: string[] = []
  if (handedOff)
    parts.push(bn ? `আমাদের টিমের একজন সদস্য ${o.expectedReplyTime} উত্তর দেবেন।` : `A member of our team will get back to you ${o.expectedReplyTime}.`)
  if (lines.length) parts.push(`${bn ? 'আমাদের সাথে যোগাযোগ করুন:' : 'You can also reach us here:'}\n${lines.map((l) => `- ${l}`).join('\n')}`)
  else if (!handedOff) parts.push(bn ? 'অনুগ্রহ করে একটু পরে আবার চেষ্টা করুন।' : 'Please try again in a little while.')
  return parts.join('\n\n')
}

const describePage = async (ctx: AIContext, page: ChatRequestBody['page']): Promise<string | undefined> => {
  if (!page) return undefined
  const lines: string[] = []
  if (page.url) lines.push(`URL: ${truncate(page.url, 300)}`)
  try {
    if (page.offeringId && ctx.adapters.offering) {
      const o = await ctx.adapters.offering.get(page.offeringId, ctx.adapterCtx)
      if (o)
        lines.push(
          `Viewing product: id=${o.id} title=${JSON.stringify(o.title)} price=${o.price ? `${o.price.amount} ${o.price.currency} (minor units)` : 'n/a'} inStock=${o.inStock ?? 'unknown'}`,
        )
    }
    if (page.cartId && ctx.adapters.cart) {
      const cart = await ctx.adapters.cart.get({ ...ctx.adapterCtx, cartId: page.cartId })
      if (cart)
        lines.push(`Cart: ${cart.items.map((i) => `${i.quantity}x ${JSON.stringify(i.title)} (id=${i.offeringId}${i.variantId ? `/${i.variantId}` : ''})`).join(', ') || 'empty'}`)
    }
  } catch (e) {
    ctx.payload.logger?.warn?.({ err: e, requestId: ctx.requestId }, '[ai-assistant] page context failed')
  }
  return lines.length ? lines.join('\n') : undefined
}

const buildSystem = async (
  ctx: AIContext,
  services: CoreServices,
  opts: ResolvedAssistantOptions,
  summary: string | undefined,
  page: ChatRequestBody['page'],
): Promise<string> => {
  const g = services.guardrails
  const settings = await services.settings(ctx.payload, ctx.tenant)
  const verified = hasOrderIdentity(ctx)
  const rendered = await services.prompts.render(
    ASSISTANT_PROMPT,
    {
      locale: ctx.locale,
      brandVoice: settings.brandVoice ? `Brand voice: ${settings.brandVoice}` : '',
      orderNote: verified
        ? ' The shopper is identified; order tools are available.'
        : ' The shopper is not identified; to look up an order use requestOrderVerification (login or order number + email + one-time code).',
      handoffNote: opts.handoff === false ? '' : `- Offer handOff to a human when asked or when you cannot help; replies come ${opts.expectedReplyTime}.`,
    },
    ctx,
  )
  const parts = [g.systemPolicy(ctx), rendered.system]
  if (summary) parts.push(g.quote('conversation-summary', summary))
  const pageText = await describePage(ctx, page)
  if (pageText) parts.push(g.quote('page-context', pageText))
  if (ctx.actor.customerId) {
    const mem = await services.memory.customerMemory.get(ctx).catch(() => null)
    if (mem && Object.keys(mem).length) parts.push(g.quote('customer-memory', truncate(JSON.stringify(mem), 1500)))
  }
  return parts.join('\n\n')
}

const OUTCOME_RANK: Record<AssistantOutcome, number> = { answered: 0, added_to_cart: 1, handed_off: 2 }

/**
 * One assistant turn: guardrails -> memory -> context -> agent (tools) -> wire events -> save -> outcome.
 * Never throws for model/provider/budget failures: the shopper gets a friendly message and contact options.
 */
export async function* runAssistantTurn(input: AssistantTurnInput): AsyncIterable<StreamWireEvent> {
  const services = getAI(input.ctx.payload)
  const opts = input.options ? resolveOptions(input.options) : getAssistantOptions(input.ctx.payload)
  const channel = input.channel ?? 'web'
  let ctx: AIContext = { ...input.ctx, module: MODULE }
  const started = Date.now()

  let conversationId: string
  let handedOffBefore = false
  try {
    const thread = await services.memory.thread(ctx, { conversationId: input.conversationId, channel })
    conversationId = thread.id
    handedOffBefore = Boolean(thread.handedOff)
  } catch (e) {
    const code = isAIError(e) ? e.code : 'unknown'
    yield { type: 'error', code, message: code === 'forbidden' ? 'Conversation not available' : 'Could not start the conversation', requestId: ctx.requestId }
    return
  }

  const state: TurnState = { conversationId, channel, page: input.page, options: opts }
  if (!ctx.actor.customerId) {
    const identity = await findVerifiedIdentity(ctx, services, conversationId)
    if (identity?.customerId) ctx = withCustomer(ctx, identity.customerId)
    else if (identity) state.identity = identity
  }
  beginTurn(ctx.requestId, state)
  yield { type: 'meta', requestId: ctx.requestId, conversationId, aiNotice: true }

  const cards: Card[] = []
  const citations: Citation[] = []
  const toolCalls: { name: string; ok: boolean }[] = []
  let text = ''
  let outcome: AssistantOutcome = 'answered'
  let firstTurn = true

  const finish = async function* (finalText: string): AsyncGenerator<StreamWireEvent> {
    let messageId: string | undefined
    try {
      const saved = await services.memory.append(
        conversationId,
        { role: 'assistant', text: finalText, cards, citations, toolCalls, latencyMs: Date.now() - started },
        ctx,
      )
      messageId = saved.id
    } catch (e) {
      ctx.payload.logger?.error?.({ err: e, requestId: ctx.requestId }, '[ai-assistant] saving reply failed')
    }
    try {
      // Outcomes only move up (answered < added_to_cart < handed_off); 'answered' is written once.
      if (OUTCOME_RANK[outcome] > 0 ? !(handedOffBefore && outcome !== 'handed_off') : firstTurn && !handedOffBefore)
        await services.memory.update(conversationId, { outcome }, ctx)
      await services.memory.maybeSummarize(conversationId, ctx)
    } catch (e) {
      ctx.payload.logger?.warn?.({ err: e, requestId: ctx.requestId }, '[ai-assistant] post-turn bookkeeping failed')
    }
    yield { type: 'done', messageId, outcome }
  }

  try {
    const check = services.guardrails.checkInput(input.message, ctx)
    await services.memory.append(conversationId, { role: 'user', text: truncate(input.message, 8000) }, ctx)
    if (!check.ok) {
      const t = REFUSE[lang(ctx.locale)]
      yield { type: 'text', delta: t }
      yield* finish(t)
      return
    }

    let failed = false
    try {
      await services.budgets.assert({ payload: ctx.payload, tenant: ctx.tenant, module: MODULE })
      const settings = await services.settings(ctx.payload, ctx.tenant)
      const history = await services.memory.context(conversationId, ctx, { lastTurns: 8 })
      firstTurn = history.messages.filter((m) => m.role === 'user').length <= 1
      const messages: ChatMessage[] = [...history.messages]
      const last = messages[messages.length - 1]
      if (!last || last.role !== 'user' || last.content !== input.message) messages.push({ role: 'user', content: input.message })
      const system = await buildSystem(ctx, services, opts, history.summary, input.page)
      const toolCtx: ToolContext = { ...ctx, services }
      const tools = services.tools.availableFor(toolCtx, toolNames(opts)).filter((t) => t.tier !== 'staff').map((t) => t.name)

      for await (const ev of services.agent.run({
        task: 'chat',
        system,
        messages,
        tools,
        ctx,
        maxSteps: opts.maxSteps,
        maxOutputTokens: settings.limits.maxOutputTokensShopper,
      })) {
        switch (ev.type) {
          case 'text-delta':
            text += ev.text
            yield { type: 'text', delta: ev.text }
            break
          case 'tool-start':
            yield { type: 'tool', name: ev.toolName, status: 'started' }
            break
          case 'tool-end':
            toolCalls.push({ name: ev.toolName, ok: ev.ok })
            if (ev.ok && ev.toolName === 'addToCart' && OUTCOME_RANK[outcome] < OUTCOME_RANK.added_to_cart) outcome = 'added_to_cart'
            if (ev.ok && ev.toolName === 'handOff') outcome = 'handed_off'
            yield { type: 'tool', name: ev.toolName, status: ev.ok ? 'done' : 'error' }
            break
          case 'card':
            cards.push(ev.card)
            yield { type: 'card', card: ev.card }
            break
          case 'citations': {
            const fresh = ev.citations.filter((c) => !citations.some((x) => x.sourceCollection === c.sourceCollection && x.sourceId === c.sourceId))
            citations.push(...fresh)
            // Knowledge tools already stream a citations card; only emit one when none was sent.
            if (fresh.length && !cards.some((c) => c.type === 'citations')) {
              const card: Card = { type: 'citations', citations: fresh }
              cards.push(card)
              yield { type: 'card', card }
            }
            break
          }
          case 'finish': {
            if (!text && ev.text) {
              text = ev.text
              yield { type: 'text', delta: ev.text }
            }
            const checked = services.guardrails.checkOutput(text, ctx, { toolResults: ev.toolResults.map((r) => r.data) })
            if (!checked.ok) {
              const note = `\n\n${CHECK_CARDS[lang(ctx.locale)]}`
              text = checked.text + note
              yield { type: 'text', delta: note }
            } else text = checked.text
            break
          }
          case 'error':
            failed = true
            ctx.payload.logger?.warn?.({ code: ev.code, requestId: ctx.requestId }, '[ai-assistant] agent error')
            break
        }
        if (failed) break
      }
    } catch (e) {
      failed = true
      ctx.payload.logger?.warn?.({ err: e, requestId: ctx.requestId }, '[ai-assistant] agent failed')
    }

    if (failed) {
      let handedOff = outcome === 'handed_off'
      if (!handedOff && opts.handoff !== false) {
        try {
          const card = await createHandoff(ctx, services, {
            conversationId,
            reason: 'Assistant unavailable (busy or budget limit)',
            expectedReplyTime: opts.expectedReplyTime,
          })
          cards.push(card)
          yield { type: 'card', card }
          handedOff = true
          outcome = 'handed_off'
        } catch (e) {
          ctx.payload.logger?.error?.({ err: e, requestId: ctx.requestId }, '[ai-assistant] fallback hand-off failed')
        }
      }
      const msg = `${text ? '\n\n' : ''}${BUSY[lang(ctx.locale)]}\n\n${contactText(opts, ctx.locale, handedOff)}`
      text += msg
      yield { type: 'text', delta: msg }
    }
    yield* finish(text)
  } finally {
    endTurn(ctx.requestId)
  }
}
