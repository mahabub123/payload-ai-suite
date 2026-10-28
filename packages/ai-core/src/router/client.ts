import type { Payload } from 'payload'
import { z } from 'zod'
import type {
  AICoreOptions,
  AIClient,
  AIContext,
  AIProvider,
  BudgetService,
  CallMeta,
  Capability,
  ChatMessage,
  ChatRequest,
  ChatResult,
  GenerateTextOptions,
  ModelInfo,
  RouteConfig,
  StreamEvent,
  TaskClass,
  Usage,
  UsageRecordInput,
  UsageService,
} from '../contracts'
import { AIError, isAIError } from '../contracts'
import { SLUGS } from '../collections/slugs'
import type { ProviderRegistry } from '../providers/registry'
import { MOCK_MODELS } from '../providers/registry'
import { allowsFallback, countsForBreaker, mapProviderError } from '../providers/errors'
import { parseJsonLoose } from '../providers/normalize'
import type { LoadedSettings } from '../settings'
import { computeCostMicros } from '../usage/cost'
import { loose } from '../usage/db'
import { CircuitBreaker } from './circuit'
import type { CircuitBreakerOptions } from './circuit'
import { isUsable, preferLocale, requiredCapabilities, resolveRouteConfig } from './resolve'
import type { RouteRow, RouteSources } from './resolve'
import { routingVersion } from './state'


/**
 * Output cap when the caller sets none. Without one, providers default to the model maximum (64k+ tokens):
 * one runaway generation can cost dollars, and gateways reserve credit for the full maximum up front.
 */
const DEFAULT_MAX_OUTPUT: Record<TaskClass, number> = { fast: 1024, chat: 2048, write: 4096, reason: 8192, embed: 0, image: 0 }
export const defaultMaxOutput = (task: TaskClass, m: Pick<ModelInfo, 'maxOutput'>): number | undefined => {
  const d = DEFAULT_MAX_OUTPUT[task]
  return d ? Math.min(d, m.maxOutput ?? d) : undefined
}

export interface AIClientDeps {
  registry: ProviderRegistry
  usage: UsageService
  budgets: BudgetService
  options?: Pick<AICoreOptions, 'routes' | 'routeOverrides' | 'mockProvider' | 'tenant'>
  /** ai-settings loader (createSettingsLoader().load) — supplies admin default routes. */
  settings?: (payload: Payload, tenant?: string | number) => Promise<LoadedSettings>
  /** Read ai-providers / ai-models / ai-routes from the DB. Default: true unless a mockProvider is set. */
  db?: boolean
  /** Reload DB routing data at most this often. Default 60s (also reloads after admin edits). */
  refreshMs?: number
  breaker?: CircuitBreaker | CircuitBreakerOptions
  /** Per-attempt timeout. Default 30s. */
  defaultTimeoutMs?: number
  /** Retries per model on retryable errors. Default 1. */
  defaultMaxRetries?: number
  /** Max values per embedding call. Default 100. */
  embedBatchSize?: number
  now?: () => number
}

export interface AIClientImpl extends AIClient {
  /** Reload DB providers/models/routes for this payload now. */
  refresh(payload: Payload): Promise<void>
  readonly breaker: CircuitBreaker
}

type Scope = Pick<AIContext, 'module' | 'tenant' | 'locale'>
type Attempt<T> = { value: T; usage: Usage; images?: number }
type Snapshot = { at: number; version: number; dbRoutes: RouteRow[]; settingsRoutes?: LoadedSettings['routes'] }

const ZERO: Usage = { inputTokens: 0, outputTokens: 0 }
const sumUsage = (a: Usage, b: Usage): Usage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cachedInputTokens: (a.cachedInputTokens ?? 0) + (b.cachedInputTokens ?? 0) || undefined,
  reportedCostMicros: a.reportedCostMicros == null && b.reportedCostMicros == null ? undefined : (a.reportedCostMicros ?? 0) + (b.reportedCostMicros ?? 0),
})

const relId = (v: unknown): string | number | undefined =>
  v == null ? undefined : typeof v === 'object' ? (v as { id?: string | number }).id : (v as string | number)

/** Run fn with a per-attempt timeout, linked to the caller's abort signal. */
export const withTimeout = async <T>(fn: (signal: AbortSignal) => Promise<T>, ms: number, parent?: AbortSignal): Promise<T> => {
  if (parent?.aborted) throw new AIError('timeout', 'Request was aborted', { cause: parent.reason })
  const ac = new AbortController()
  const onAbort = () => ac.abort(parent?.reason)
  parent?.addEventListener('abort', onAbort, { once: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new AIError('timeout', `Model call exceeded ${ms} ms`)
      ac.abort(err)
      reject(err)
    }, ms)
  })
  try {
    return await Promise.race([fn(ac.signal), timeout])
  } finally {
    clearTimeout(timer)
    parent?.removeEventListener('abort', onAbort)
  }
}

const messagesOf = (o: Pick<GenerateTextOptions, 'messages' | 'prompt'>): ChatMessage[] => {
  const m = [...(o.messages ?? [])]
  if (o.prompt) m.push({ role: 'user', content: o.prompt })
  if (!m.length) throw new AIError('bad_request', 'generateText needs messages or prompt')
  return m
}

/**
 * The AIClient: budget pre-check -> route resolution -> provider call with timeout / retry / fallback and a
 * per-model circuit breaker -> one usage row per attempt (ok / error / fallback / blocked).
 */
export const createAIClient = (deps: AIClientDeps): AIClientImpl => {
  const { registry } = deps
  const now = deps.now ?? Date.now
  const breaker = deps.breaker instanceof CircuitBreaker ? deps.breaker : new CircuitBreaker({ now, ...deps.breaker })
  const mock = deps.options?.mockProvider ?? registry.mock
  const useDb = deps.db ?? !mock
  const refreshMs = deps.refreshMs ?? 60_000
  const defaultTimeout = deps.defaultTimeoutMs ?? 30_000
  const defaultRetries = deps.defaultMaxRetries ?? 1
  const batchSize = Math.min(100, Math.max(1, deps.embedBatchSize ?? 100))
  const tenantField = deps.options?.tenant?.field
  const snapshots = new WeakMap<Payload, Snapshot>()
  const inflight = new WeakMap<Payload, Promise<void>>()
  let warnedNoRoute = new Set<string>()
  let lastSnapshot: Snapshot | undefined

  /* ---------- routing data ---------- */

  const load = async (payload: Payload) => {
    const snap: Snapshot = { at: now(), version: routingVersion(), dbRoutes: [] }
    if (useDb) {
      const p = loose(payload)
      await registry.loadFromPayload(payload).catch((e: unknown) => payload.logger?.warn?.(`[ai-suite] could not load ai-providers/ai-models: ${(e as Error)?.message ?? e}`))
      try {
        const rows = await p.find({ collection: SLUGS.routes, pagination: false, depth: 0, overrideAccess: true })
        snap.dbRoutes = rows.docs
          .filter((r) => r.enabled !== false)
          .map((r) => ({
            task: r.taskClass as TaskClass,
            scope: (r.scope as RouteRow['scope']) ?? 'global',
            scopeValue: (r.scopeValue as string) || undefined,
            tenant: tenantField ? relId(r[tenantField]) : undefined,
            models: ((r.models as unknown[]) ?? []).map((x) => (typeof x === 'string' ? x : (x as { ref?: string })?.ref)).filter((x): x is string => !!x),
            timeoutMs: (r.timeoutMs as number) || undefined,
            maxRetries: typeof r.maxRetries === 'number' ? r.maxRetries : undefined,
          }))
      } catch (e) {
        payload.logger?.warn?.(`[ai-suite] could not load ai-routes: ${(e as Error)?.message ?? e}`)
      }
      if (deps.settings) snap.settingsRoutes = (await deps.settings(payload).catch(() => undefined))?.routes
    }
    snapshots.set(payload, snap)
    lastSnapshot = snap
    warnedNoRoute = new Set()
  }

  const refresh = async (payload: Payload, force = false) => {
    const s = snapshots.get(payload)
    if (!force && s && now() - s.at < refreshMs && s.version === routingVersion()) return
    if (!useDb && s && !force) return
    let p = inflight.get(payload)
    if (!p) {
      p = load(payload).finally(() => inflight.delete(payload))
      inflight.set(payload, p)
    }
    await p
  }

  /** resolveRoute's ctx may omit payload (contract Pick); then the most recently loaded snapshot is used. */
  const sources = (payload?: Payload): RouteSources => {
    const s = (payload && snapshots.get(payload)) || lastSnapshot
    return { routes: deps.options?.routes, routeOverrides: deps.options?.routeOverrides, settingsRoutes: s?.settingsRoutes, dbRoutes: s?.dbRoutes }
  }

  const resolve = (task: TaskClass, ctx: Scope & { payload?: Payload }, needs: Capability[] = []): { models: ModelInfo[]; route?: RouteConfig } => {
    const caps = requiredCapabilities(task, needs)
    if (mock) return { models: MOCK_MODELS(mock.id).filter((m) => caps.every((c) => m.capabilities.includes(c))) }
    const route = resolveRouteConfig(task, ctx, sources(ctx.payload))
    let models: ModelInfo[]
    if (route) {
      const seen = new Set<string>()
      models = []
      for (const ref of route.models) {
        if (seen.has(ref)) continue
        seen.add(ref)
        let info: ModelInfo | undefined
        try {
          info = registry.model(ref)
        } catch {
          info = undefined
        }
        if (isUsable(info, caps, info && registry.config(info.providerId), ctx)) models.push(info)
      }
    } else {
      models = registry.models().filter((m) => isUsable(m, caps, registry.config(m.providerId), ctx))
      if (models.length && !warnedNoRoute.has(task)) {
        warnedNoRoute.add(task)
        ctx.payload?.logger?.warn?.(`[ai-suite] no route configured for task "${task}"; using any capable model (${models[0].ref}). Configure routes to control cost.`)
      }
    }
    return { models: preferLocale(models, ctx.locale), route }
  }

  /* ---------- accounting ---------- */

  const record = async (ctx: AIContext, task: TaskClass, model: string, usage: Usage, extra: Pick<UsageRecordInput, 'outcome' | 'errorCode' | 'latencyMs' | 'promptRef'> & { info?: ModelInfo; images?: number }) => {
    const input: UsageRecordInput = {
      module: ctx.module,
      task,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      costMicros: computeCostMicros(usage, extra.info, { images: extra.images }),
      latencyMs: extra.latencyMs,
      outcome: extra.outcome,
      errorCode: extra.errorCode,
      promptRef: extra.promptRef,
    }
    try {
      await deps.usage.record(input, ctx)
    } catch (e) {
      ctx.payload.logger?.error?.({ err: e }, '[ai-suite] usage record failed')
    }
    return input.costMicros
  }

  const prepare = async (ctx: AIContext, task: TaskClass, promptRef?: GenerateTextOptions['promptRef']) => {
    await refresh(ctx.payload)
    try {
      await deps.budgets.assert(ctx)
    } catch (e) {
      if (isAIError(e) && e.code === 'budget_exceeded') await record(ctx, task, 'none', ZERO, { outcome: 'blocked', errorCode: e.code, latencyMs: 0, promptRef })
      throw e
    }
  }

  const usageOf = (e: unknown): Usage | undefined => (e as { usage?: Usage })?.usage

  /** Try candidates in order with per-attempt timeout and retries; fall back on retryable / provider errors. */
  const run = async <T>(
    task: TaskClass,
    ctx: AIContext,
    candidates: ModelInfo[],
    route: RouteConfig | undefined,
    opts: { timeoutMs?: number; signal?: AbortSignal; promptRef?: GenerateTextOptions['promptRef']; retries?: number },
    call: (m: ModelInfo, p: AIProvider, signal: AbortSignal) => Promise<Attempt<T>>,
  ): Promise<T & CallMeta> => {
    if (!candidates.length) throw new AIError('unavailable', `No enabled model with the required capabilities is routed for task "${task}"`)
    const timeoutMs = opts.timeoutMs ?? route?.timeoutMs ?? defaultTimeout
    const retries = opts.retries ?? route?.maxRetries ?? defaultRetries
    let lastErr: AIError | undefined
    let failures = 0
    for (const m of candidates) {
      if (!breaker.allow(m.ref)) {
        lastErr ??= new AIError('unavailable', `Circuit open for ${m.ref}`)
        failures++
        continue
      }
      let provider: AIProvider
      try {
        provider = mock ?? registry.require(m.providerId)
      } catch (e) {
        lastErr = mapProviderError(e, m.providerId)
        failures++
        continue
      }
      for (let attempt = 0; attempt <= retries; attempt++) {
        const started = now()
        try {
          const r = await withTimeout((signal) => call(m, provider, signal), timeoutMs, opts.signal)
          breaker.success(m.ref)
          const latencyMs = now() - started
          const costMicros = await record(ctx, task, m.ref, r.usage, { outcome: failures ? 'fallback' : 'ok', latencyMs, promptRef: opts.promptRef, info: m, images: r.images })
          return { ...(r.value as T), model: m.ref, latencyMs, costMicros }
        } catch (e) {
          const err = mapProviderError(e, m.providerId)
          await record(ctx, task, m.ref, usageOf(e) ?? ZERO, { outcome: 'error', errorCode: err.code, latencyMs: now() - started, promptRef: opts.promptRef, info: m })
          if (countsForBreaker(err.code)) breaker.failure(m.ref)
          lastErr = err
          failures++
          if (opts.signal?.aborted) throw err
          if (err.retryable && attempt < retries && breaker.allow(m.ref)) continue
          if (!allowsFallback(err.code)) throw err
          break
        }
      }
    }
    throw lastErr ?? new AIError('unavailable', `All models failed for task "${task}"`)
  }

  const chatRequest = (o: GenerateTextOptions, m: ModelInfo, signal: AbortSignal): ChatRequest => ({
    model: m.modelId,
    system: o.system,
    messages: messagesOf(o),
    tools: o.tools,
    temperature: o.temperature,
    maxOutputTokens: o.maxOutputTokens ?? defaultMaxOutput(o.task, m),
    cacheSystem: !!o.system && m.capabilities.includes('promptCaching'),
    signal,
  })

  const needsOf = (o: { needs?: GenerateTextOptions['needs']; tools?: unknown[] }): Capability[] => [
    ...(o.needs ?? []),
    ...(o.tools?.length ? (['tools'] as Capability[]) : []),
  ]

  /* ---------- streaming ---------- */

  const chatAsStream = async function* (p: AIProvider, req: ChatRequest): AsyncIterable<StreamEvent> {
    const r = await p.chat(req)
    if (r.text) yield { type: 'text-delta', text: r.text }
    for (const tc of r.toolCalls) yield { type: 'tool-call', toolCall: tc }
    yield { type: 'finish', finishReason: r.finishReason, usage: r.usage }
  }

  const streamText: AIClient['streamText'] = (o, ctx) => {
    let resolveMeta!: (m: CallMeta) => void
    let rejectMeta!: (e: unknown) => void
    const meta = new Promise<CallMeta>((res, rej) => {
      resolveMeta = res
      rejectMeta = rej
    })
    meta.catch(() => undefined)

    async function* gen(): AsyncGenerator<StreamEvent> {
      await prepare(ctx, o.task, o.promptRef)
      const { models, route } = resolve(o.task, ctx, needsOf(o))
      if (!models.length) throw new AIError('unavailable', `No enabled model with the required capabilities is routed for task "${o.task}"`)
      const timeoutMs = o.timeoutMs ?? route?.timeoutMs ?? defaultTimeout
      const retries = route?.maxRetries ?? defaultRetries
      let lastErr: AIError | undefined
      let failures = 0
      for (const m of models) {
        if (!breaker.allow(m.ref)) {
          lastErr ??= new AIError('unavailable', `Circuit open for ${m.ref}`)
          failures++
          continue
        }
        let provider: AIProvider
        try {
          provider = mock ?? registry.require(m.providerId)
        } catch (e) {
          lastErr = mapProviderError(e, m.providerId)
          failures++
          continue
        }
        for (let attempt = 0; attempt <= retries; attempt++) {
          const started = now()
          const ac = new AbortController()
          const onAbort = () => ac.abort(o.signal?.reason)
          o.signal?.addEventListener('abort', onAbort, { once: true })
          const req = chatRequest(o, m, ac.signal)
          const it = (provider.stream ? provider.stream(req) : chatAsStream(provider, req))[Symbol.asyncIterator]()
          const next = () => withTimeout(() => it.next(), timeoutMs, o.signal).catch((e) => {
            ac.abort(e)
            throw e
          })
          let first: IteratorResult<StreamEvent>
          try {
            first = await next()
            if (!first.done && first.value.type === 'error') throw first.value.error
          } catch (e) {
            o.signal?.removeEventListener('abort', onAbort)
            const err = mapProviderError(e, m.providerId)
            await record(ctx, o.task, m.ref, ZERO, { outcome: 'error', errorCode: err.code, latencyMs: now() - started, promptRef: o.promptRef, info: m })
            if (countsForBreaker(err.code)) breaker.failure(m.ref)
            lastErr = err
            failures++
            if (o.signal?.aborted || !allowsFallback(err.code)) {
              rejectMeta(err)
              throw err
            }
            if (err.retryable && attempt < retries && breaker.allow(m.ref)) continue
            break
          }

          // Committed to this model: no fallback once output has started.
          let usage: Usage = ZERO
          let settled = false
          const finish = async (outcome: 'ok' | 'fallback' | 'error', errorCode?: string) => {
            settled = true
            o.signal?.removeEventListener('abort', onAbort)
            const latencyMs = now() - started
            const costMicros = await record(ctx, o.task, m.ref, usage, { outcome, errorCode, latencyMs, promptRef: o.promptRef, info: m })
            return { model: m.ref, latencyMs, costMicros }
          }
          try {
            let cur = first
            while (!cur.done) {
              const ev = cur.value
              if (ev.type === 'error') throw ev.error
              if (ev.type === 'finish') usage = ev.usage
              yield ev
              cur = await next()
            }
            breaker.success(m.ref)
            resolveMeta(await finish(failures ? 'fallback' : 'ok'))
            return
          } catch (e) {
            const err = mapProviderError(e, m.providerId)
            if (countsForBreaker(err.code)) breaker.failure(m.ref)
            await finish('error', err.code)
            rejectMeta(err)
            throw err
          } finally {
            if (!settled) {
              // Consumer stopped early.
              ac.abort()
              await it.return?.()
              resolveMeta(await finish(failures ? 'fallback' : 'ok'))
            }
          }
        }
      }
      const err = lastErr ?? new AIError('unavailable', `All models failed for task "${o.task}"`)
      rejectMeta(err)
      throw err
    }

    const wrapped = async function* () {
      try {
        yield* gen()
      } catch (e) {
        rejectMeta(e)
        throw e
      }
    }
    const it = wrapped()
    return Object.assign({ [Symbol.asyncIterator]: () => it }, { meta })
  }

  /* ---------- public API ---------- */

  const client: AIClientImpl = {
    breaker,
    refresh: (payload) => refresh(payload, true),

    async generateText(o, ctx) {
      await prepare(ctx, o.task, o.promptRef)
      const { models, route } = resolve(o.task, ctx, needsOf(o))
      return run<ChatResult>(o.task, ctx, models, route, o, async (m, p, signal) => {
        const r = await p.chat(chatRequest(o, m, signal))
        return { value: r, usage: r.usage }
      })
    },

    streamText,

    async generateObject(o, ctx) {
      await prepare(ctx, o.task, o.promptRef)
      let responseSchema: Record<string, unknown>
      try {
        responseSchema = z.toJSONSchema(o.schema as z.ZodType, { unrepresentable: 'any' }) as Record<string, unknown>
      } catch {
        responseSchema = { type: 'object' }
      }
      delete responseSchema.$schema
      const { models, route } = resolve(o.task, ctx, o.needs ?? [])
      return run(o.task, ctx, models, route, o, async (m, p, signal) => {
        const r = await p.chat({ ...chatRequest(o, m, signal), responseSchema, responseSchemaName: o.schemaName ?? 'output' })
        let raw = r.object
        if (raw === undefined) {
          try {
            raw = parseJsonLoose(r.text)
          } catch {
            raw = undefined
          }
        }
        const parsed = o.schema.safeParse(raw)
        if (!parsed.success) {
          throw Object.assign(new AIError('validation', 'Model output failed schema validation', { details: parsed.error.issues, providerId: m.providerId }), { usage: r.usage })
        }
        return { value: { object: parsed.data }, usage: r.usage }
      })
    },

    async embed(values, ctx) {
      await prepare(ctx, 'embed')
      const { models, route } = resolve('embed', ctx)
      const active = models[0]
      if (!active) throw new AIError('unavailable', 'No embedding model is routed')
      if (!values.length) return { embeddings: [], usage: ZERO, model: active.ref, latencyMs: 0, costMicros: 0 }
      const timeoutMs = route?.timeoutMs ?? defaultTimeout
      const retries = route?.maxRetries ?? defaultRetries
      // Never fall back to another embedding model: vectors from two models must not be mixed.
      return run('embed', ctx, [active], route, { retries: 0, timeoutMs: timeoutMs * (Math.ceil(values.length / batchSize) * (retries + 1)) }, async (m, p) => {
        if (!p.embed) throw new AIError('bad_request', `Provider ${p.id} does not support embeddings`)
        const embeddings: number[][] = []
        let usage = ZERO
        for (let i = 0; i < values.length; i += batchSize) {
          const batch = values.slice(i, i + batchSize)
          for (let attempt = 0; ; attempt++) {
            try {
              const r = await withTimeout((signal) => p.embed!({ model: m.modelId, values: batch, signal }), timeoutMs)
              embeddings.push(...r.embeddings)
              usage = sumUsage(usage, r.usage)
              break
            } catch (e) {
              const err = mapProviderError(e, m.providerId)
              if (!err.retryable || attempt >= retries) throw Object.assign(err, { usage })
            }
          }
        }
        return { value: { embeddings, usage }, usage }
      })
    },

    async generateImage(o, ctx) {
      await prepare(ctx, 'image')
      const { models, route } = resolve('image', ctx)
      return run('image', ctx, models, route, {}, async (m, p, signal) => {
        if (!p.image) throw new AIError('bad_request', `Provider ${p.id} does not support image generation`)
        const r = await p.image({ model: m.modelId, prompt: o.prompt, image: o.image, size: o.size, n: o.n, signal })
        return { value: r, usage: r.usage, images: r.images.length }
      })
    },

    resolveRoute(task, ctx) {
      return resolve(task, ctx).models
    },

    activeEmbedding(ctx) {
      const m = resolve('embed', ctx).models[0]
      if (!m) throw new AIError('unavailable', 'No embedding model is routed')
      if (!m.embedDims) throw new AIError('bad_request', `Embedding model ${m.ref} has no embedDims; set it in ProviderConfig.models or ai-models`)
      return { ref: m.ref, dims: m.embedDims }
    },

    async testProvider(providerId, ctx) {
      await refresh(ctx.payload)
      let provider: AIProvider
      try {
        provider = mock && providerId === mock.id ? mock : registry.require(providerId)
      } catch (e) {
        return { ok: false, chat: false, tools: false, error: (e as Error).message }
      }
      const model =
        registry.models().find((m) => m.providerId === providerId && m.enabled && m.capabilities.includes('chat')) ??
        (mock && providerId === mock.id ? MOCK_MODELS(mock.id)[0] : undefined)
      if (!model) return { ok: false, chat: false, tools: false, error: `No chat model registered for provider ${providerId}` }
      const call = async (req: Omit<ChatRequest, 'model' | 'signal'>) => {
        const started = now()
        try {
          const r = await withTimeout((signal) => provider.chat({ ...req, model: model.modelId, signal }), Math.min(defaultTimeout, 20_000))
          await record(ctx, 'fast', model.ref, r.usage, { outcome: 'ok', latencyMs: now() - started, info: model })
          return r
        } catch (e) {
          const err = mapProviderError(e, providerId)
          await record(ctx, 'fast', model.ref, ZERO, { outcome: 'error', errorCode: err.code, latencyMs: now() - started, info: model })
          throw err
        }
      }
      let chat = false
      let tools = false
      try {
        // Smallest output most vendors accept (OpenAI's Responses API rejects < 16).
        await call({ messages: [{ role: 'user', content: 'Reply with: OK' }], maxOutputTokens: 16 })
        chat = true
        if (model.capabilities.includes('tools')) {
          const r = await call({
            messages: [{ role: 'user', content: 'Call the report_status tool with ok=true.' }],
            tools: [{ name: 'report_status', description: 'Report connection status', inputSchema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] } }],
            toolChoice: { toolName: 'report_status' },
            maxOutputTokens: 64,
          })
          tools = r.toolCalls.length > 0
        }
        return { ok: chat, chat, tools, ...(tools || !model.capabilities.includes('tools') ? {} : { error: 'Model did not return a tool call' }) }
      } catch (e) {
        return { ok: chat, chat, tools, error: (e as Error).message }
      }
    },
  }
  return client
}
