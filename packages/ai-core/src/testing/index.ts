/**
 * Test kit: scripted mock provider and in-memory CoreServices. No network, no paid APIs.
 * The real ai-core implementation also accepts `mockProvider` in options for integration tests.
 */
import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import type {
  AIClient,
  AIContext,
  AIProvider,
  AITool,
  AdapterSet,
  AgentEvent,
  ChatRequest,
  ChatResult,
  CoreServices,
  PromptTemplate,
  RunAgentOptions,
  Settings,
  StreamEvent,
  ToolContext,
  VectorRow,
} from '../contracts'
import { AIError } from '../contracts'

export type ScriptedReply =
  | string
  | Partial<ChatResult>
  | ((req: ChatRequest) => string | Partial<ChatResult>)

const toResult = (r: string | Partial<ChatResult>): ChatResult =>
  typeof r === 'string'
    ? { text: r, toolCalls: [], finishReason: 'stop', usage: { inputTokens: 10, outputTokens: 5 } }
    : {
        text: r.text ?? '',
        toolCalls: r.toolCalls ?? [],
        finishReason: r.finishReason ?? (r.toolCalls?.length ? 'tool-calls' : 'stop'),
        usage: r.usage ?? { inputTokens: 10, outputTokens: 5 },
        object: r.object,
      }

/** Deterministic pseudo-embedding: bag of hashed character trigrams, L2-normalised. */
export const fakeEmbedding = (text: string, dims = 64): number[] => {
  const v = new Array<number>(dims).fill(0)
  const t = ` ${text.toLowerCase()} `
  for (let i = 0; i < t.length - 2; i++) {
    let h = 2166136261
    for (let j = i; j < i + 3; j++) h = Math.imul(h ^ t.charCodeAt(j), 16777619)
    v[Math.abs(h) % dims] += 1
  }
  const n = Math.hypot(...v) || 1
  return v.map((x) => x / n)
}

export interface MockProvider extends AIProvider {
  calls: ChatRequest[]
  /** Queue replies consumed in order; when empty, `fallback` is used. */
  enqueue(...replies: ScriptedReply[]): void
}

const isJsonText = (text: string): boolean => {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

type JsonSchema = Record<string, any>

/** Minimal value that satisfies a JSON schema (as produced by zod's toJSONSchema). */
export const sampleFromSchema = (schema: JsonSchema, root: JsonSchema = schema, depth = 0): unknown => {
  if (!schema || depth > 8) return null
  if (schema.$ref) {
    const target = String(schema.$ref)
      .replace(/^#\//, '')
      .split('/')
      .reduce<JsonSchema | undefined>((o, k) => o?.[k], root)
    return sampleFromSchema(target ?? {}, root, depth + 1)
  }
  if ('const' in schema) return schema.const
  if ('default' in schema) return schema.default
  if (Array.isArray(schema.enum)) return schema.enum[0]
  const alt = schema.anyOf ?? schema.oneOf
  if (Array.isArray(alt)) {
    const pick = alt.find((s: JsonSchema) => s.type !== 'null') ?? alt[0]
    return sampleFromSchema(pick, root, depth + 1)
  }
  if (Array.isArray(schema.allOf)) {
    return Object.assign({}, ...schema.allOf.map((s: JsonSchema) => sampleFromSchema(s, root, depth + 1)))
  }
  const type = Array.isArray(schema.type) ? schema.type.find((t: string) => t !== 'null') : schema.type
  switch (type) {
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const [k, s] of Object.entries((schema.properties ?? {}) as Record<string, JsonSchema>)) {
        out[k] = sampleFromSchema(s, root, depth + 1)
      }
      return out
    }
    case 'array':
      return Array.from({ length: schema.minItems ?? 0 }, () => sampleFromSchema(schema.items ?? {}, root, depth + 1))
    case 'string': {
      const s = schema.format === 'date-time' ? new Date(0).toISOString() : 'sample'
      return s.padEnd(schema.minLength ?? 0, 'x').slice(0, schema.maxLength ?? s.length)
    }
    case 'integer':
    case 'number':
      return schema.minimum ?? (schema.exclusiveMinimum !== undefined ? schema.exclusiveMinimum + 1 : 0)
    case 'boolean':
      return false
    case 'null':
      return null
    default:
      return null
  }
}

export const createMockProvider = (
  opts: { id?: string; fallback?: ScriptedReply; dims?: number; failWith?: AIError } = {},
): MockProvider => {
  const queue: ScriptedReply[] = []
  const calls: ChatRequest[] = []
  const next = (req: ChatRequest): ChatResult => {
    if (opts.failWith) throw opts.failWith
    const r = queue.shift() ?? opts.fallback ?? 'ok'
    const result = toResult(typeof r === 'function' ? r(req) : r)
    // Structured-output calls get a minimal schema-valid object unless the script supplied one.
    if (req.responseSchema && result.object === undefined && !isJsonText(result.text)) {
      result.object = sampleFromSchema(req.responseSchema)
    }
    return result
  }
  return {
    id: opts.id ?? 'mock',
    type: 'custom',
    calls,
    enqueue: (...r) => queue.push(...r),
    async chat(req) {
      calls.push(req)
      return next(req)
    },
    async *stream(req): AsyncIterable<StreamEvent> {
      calls.push(req)
      const r = next(req)
      for (const word of r.text.split(/(?<=\s)/)) if (word) yield { type: 'text-delta', text: word }
      for (const tc of r.toolCalls) yield { type: 'tool-call', toolCall: tc }
      yield { type: 'finish', finishReason: r.finishReason, usage: r.usage }
    },
    async embed(req) {
      return {
        embeddings: req.values.map((v) => fakeEmbedding(v, opts.dims ?? 64)),
        usage: { inputTokens: req.values.join(' ').length, outputTokens: 0 },
      }
    },
    async image() {
      // 1x1 transparent PNG
      const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
      return { images: [{ base64: png, mediaType: 'image/png' }], usage: { inputTokens: 0, outputTokens: 0 } }
    },
    async listModels() {
      return ['mock-chat', 'mock-embed', 'mock-image']
    },
  }
}

const defaultSettings: Settings = {
  enabledModules: ['content', 'search', 'assistant', 'marketing', 'support', 'channels', 'insights', 'media', 'copilot'],
  allowedDomains: ['localhost'],
  limits: { visitorPerMinute: 20, visitorPerDay: 200, maxInputChars: 2000, maxOutputTokensShopper: 400 },
  retention: { shopperChatsDays: 90, staffChatsDays: 365, usageDays: 730, auditDays: 1095 },
  budgets: {},
}

const cosine = (a: number[], b: number[]) => {
  let s = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i] * b[i]
  return s
}

const render = (tpl: string, vars: Record<string, unknown>) =>
  tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => {
    const v = k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown> | undefined)?.[p], vars)
    return v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v)
  })

export interface FakeServices extends CoreServices {
  provider: MockProvider
  /** Records written by fake usage/audit/actions for assertions. */
  log: { usage: unknown[]; audit: unknown[]; actions: Map<string, any>; messages: Map<string, any[]> }
  vectorTables: Map<string, Map<string, VectorRow & { tenant?: string | number; locale?: string }>>
}

/**
 * In-memory CoreServices. Behaviour is simplified but honours the contracts that matter in module tests:
 * tier filtering, confirm-tier proposals + idempotent confirm, budget throw, tenant-scoped vectors.
 */
export const createFakeServices = (
  opts: { provider?: MockProvider; adapters?: AdapterSet; settings?: Partial<Settings>; budgetExceeded?: boolean } = {},
): FakeServices => {
  const provider = opts.provider ?? createMockProvider()
  const adapters = opts.adapters ?? {}
  const settings = { ...defaultSettings, ...opts.settings }
  const log = { usage: [] as unknown[], audit: [] as unknown[], actions: new Map<string, any>(), messages: new Map<string, any[]>() }
  const vectorTables = new Map<string, Map<string, VectorRow & { tenant?: string | number; locale?: string }>>()
  const tools = new Map<string, AITool & { module: string }>()
  const prompts = new Map<string, PromptTemplate & { module: string }>()
  let seq = 0
  const id = () => `id_${++seq}`
  const meta = { model: 'mock:mock-chat', latencyMs: 1, costMicros: 1 }

  const ai: AIClient = {
    async generateText(o, ctx) {
      if (opts.budgetExceeded) throw new AIError('budget_exceeded', 'Budget exhausted')
      const r = await provider.chat({ model: 'mock-chat', system: o.system, messages: o.messages ?? [{ role: 'user', content: o.prompt ?? '' }], tools: o.tools })
      log.usage.push({ module: ctx.module, task: o.task })
      return { ...r, ...meta }
    },
    streamText(o, ctx) {
      if (opts.budgetExceeded) throw new AIError('budget_exceeded', 'Budget exhausted')
      log.usage.push({ module: ctx.module, task: o.task })
      const it = provider.stream!({ model: 'mock-chat', system: o.system, messages: o.messages ?? [{ role: 'user', content: o.prompt ?? '' }], tools: o.tools })
      return Object.assign(it, { meta: Promise.resolve(meta) })
    },
    async generateObject(o, ctx) {
      if (opts.budgetExceeded) throw new AIError('budget_exceeded', 'Budget exhausted')
      const r = await provider.chat({ model: 'mock-chat', system: o.system, messages: o.messages ?? [{ role: 'user', content: o.prompt ?? '' }], responseSchema: {} })
      log.usage.push({ module: ctx.module, task: o.task })
      const raw = r.object ?? JSON.parse(r.text || '{}')
      const parsed = o.schema.safeParse(raw)
      if (!parsed.success) throw new AIError('bad_request', 'Model output failed schema validation', { details: parsed.error.issues })
      return { object: parsed.data, ...meta }
    },
    async embed(values) {
      if (opts.budgetExceeded) throw new AIError('budget_exceeded', 'Budget exhausted')
      const r = await provider.embed!({ model: 'mock-embed', values })
      return { ...r, ...meta, model: 'mock:mock-embed' }
    },
    async generateImage(o) {
      const r = await provider.image!({ model: 'mock-image', prompt: o.prompt })
      return { ...r, ...meta, model: 'mock:mock-image' }
    },
    resolveRoute: () => [{ ref: 'mock:mock-chat', providerId: 'mock', modelId: 'mock-chat', capabilities: ['chat', 'tools', 'streaming', 'structuredOutput', 'embeddings', 'vision'], enabled: true }],
    activeEmbedding: () => ({ ref: 'mock:mock-embed', dims: 64 }),
    testProvider: async () => ({ ok: true, chat: true, tools: true }),
  }

  const isStaff = (ctx: AIContext) => ctx.actor.kind === 'staff' || ctx.actor.kind === 'system'
  const tierAllowed = (t: AITool, ctx: AIContext) =>
    t.tier === 'staff' ? isStaff(ctx) && ctx.surface !== 'storefront' && ctx.surface !== 'channel' : true

  const services: FakeServices = {
    provider,
    log,
    vectorTables,
    ai,
    adapters,
    adapterStatus: [],
    isConceptAvailable: (c) => Boolean((adapters as Record<string, unknown>)[c]),
    tools: {
      register: (t, module) => void tools.set(t.name, { ...t, module }),
      get: (n) => tools.get(n),
      list: () => [...tools.values()],
      availableFor: (ctx, names) =>
        [...tools.values()].filter(
          (t) =>
            (!names || names.includes(t.name)) &&
            tierAllowed(t, ctx) &&
            (t.requires ?? []).every((c) => (adapters as Record<string, unknown>)[c]) &&
            (t.available ? t.available(ctx) : true),
        ),
      disabled: () => ({}),
    },
    agent: {
      async *run(o: RunAgentOptions): AsyncIterable<AgentEvent> {
        const ctx = { ...o.ctx, services } as ToolContext
        const resolved = o.tools
          .map((t) => (typeof t === 'string' ? tools.get(t) : t))
          .filter((t): t is AITool => Boolean(t) && tierAllowed(t!, ctx))
        const messages = [...o.messages]
        const toolResults: { toolName: string; data: unknown }[] = []
        let text = ''
        for (let step = 1; step <= (o.maxSteps ?? 5); step++) {
          const r = await provider.chat({ model: 'mock-chat', system: o.system, messages, tools: resolved.map((t) => ({ name: t.name, description: t.description, inputSchema: {} })) })
          if (r.text) {
            text += r.text
            yield { type: 'text-delta', text: r.text }
          }
          if (!r.toolCalls.length) {
            yield { type: 'finish', text, steps: step, toolResults }
            return
          }
          for (const tc of r.toolCalls) {
            const tool = resolved.find((t) => t.name === tc.toolName)
            yield { type: 'tool-start', toolName: tc.toolName, toolCallId: tc.toolCallId, input: tc.input }
            if (!tool) {
              yield { type: 'tool-end', toolName: tc.toolName, toolCallId: tc.toolCallId, ok: false }
              continue
            }
            const input = tool.input.parse(tc.input)
            if (tool.tier === 'confirm') {
              const { card } = await services.actions.propose(tool, input, ctx)
              yield { type: 'card', card }
              toolResults.push({ toolName: tool.name, data: { status: 'awaiting_confirmation' } })
              yield { type: 'tool-end', toolName: tc.toolName, toolCallId: tc.toolCallId, ok: true, data: { status: 'awaiting_confirmation' } }
              continue
            }
            const res = await tool.run(input, ctx)
            for (const card of res.cards ?? []) yield { type: 'card', card }
            if (res.citations?.length) yield { type: 'citations', citations: res.citations }
            toolResults.push({ toolName: tool.name, data: res.data })
            messages.push({ role: 'assistant', content: [{ type: 'tool-call', toolCallId: tc.toolCallId, toolName: tc.toolName, input: tc.input }] })
            messages.push({ role: 'tool', content: [{ type: 'tool-result', toolCallId: tc.toolCallId, toolName: tc.toolName, output: res.data }] })
            yield { type: 'tool-end', toolName: tc.toolName, toolCallId: tc.toolCallId, ok: true, data: res.data }
          }
        }
        yield { type: 'finish', text, steps: o.maxSteps ?? 5, toolResults }
      },
    },
    actions: {
      async propose(tool, input, ctx, o) {
        const d = tool.describeAction ? await tool.describeAction(input, ctx) : { title: tool.name, summary: JSON.stringify(input) }
        const action = { id: id(), tool: tool.name, input, status: 'proposed' as const, ...d, conversationId: o?.conversationId, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), idempotency: new Map<string, unknown>() }
        log.actions.set(action.id, action)
        return { action, card: { type: 'confirmation', actionId: action.id, tool: tool.name, title: d.title, summary: d.summary, expiresAt: action.expiresAt } }
      },
      async confirm(actionId, key, ctx) {
        const a = log.actions.get(actionId)
        if (!a) throw new AIError('not_found', 'Action not found')
        if (a.idempotency.has(key)) return a
        if (a.status !== 'proposed') throw new AIError('conflict', `Action is ${a.status}`)
        const tool = tools.get(a.tool)
        if (!tool) throw new AIError('not_found', 'Tool not found')
        a.status = 'confirmed'
        try {
          const r = await tool.run(a.input, { ...ctx, services, actionId } as ToolContext)
          a.result = r.data
          a.status = 'done'
        } catch (e) {
          a.status = 'failed'
          a.result = { error: (e as Error).message }
        }
        a.idempotency.set(key, true)
        return a
      },
      async reject(actionId) {
        const a = log.actions.get(actionId)
        if (!a) throw new AIError('not_found', 'Action not found')
        a.status = 'rejected'
        return a
      },
    },
    prompts: {
      registerDefault: (t, module) => void prompts.set(t.slug, { ...t, module }),
      async render(slug, vars) {
        const t = prompts.get(slug)
        if (!t) throw new AIError('not_found', `Prompt ${slug} not registered`)
        return { slug, version: 0, task: t.task, system: render(t.system, vars), user: t.user ? render(t.user, vars) : undefined }
      },
      list: () => [...prompts.values()],
    },
    vectors: {
      ensureTable: async (spec) => void (vectorTables.has(spec.name) || vectorTables.set(spec.name, new Map())),
      async upsert(table, rows, m) {
        const t = vectorTables.get(table) ?? new Map()
        vectorTables.set(table, t)
        for (const r of rows) t.set(`${m.tenant ?? ''}:${r.id}`, { ...r, tenant: m.tenant, locale: m.locale })
      },
      async delete(table, ids, tenant) {
        for (const i of ids) vectorTables.get(table)?.delete(`${tenant ?? ''}:${i}`)
      },
      async query(table, q, scope) {
        // Same locale rule as the SQL store: (locale = $l OR locale IS NULL).
        const rows = [...(vectorTables.get(table)?.values() ?? [])].filter(
          (r) => (r.tenant ?? undefined) === scope.tenant && (!scope.locale || !r.locale || r.locale === scope.locale),
        )
        const matchesWhere = (r: VectorRow) =>
          Object.entries(q.where ?? {}).every(([k, v]) => {
            const f = r.fields[k]
            if (Array.isArray(v)) return v.includes(f as never)
            if (v && typeof v === 'object') {
              const o = v as { gte?: number; lte?: number; contains?: unknown }
              if (o.contains !== undefined) return Array.isArray(f) && f.includes(o.contains)
              return (o.gte === undefined || (f as number) >= o.gte) && (o.lte === undefined || (f as number) <= o.lte)
            }
            return f === v
          })
        const terms = (q.text ?? '').toLowerCase().split(/\s+/).filter(Boolean)
        return rows
          .filter(matchesWhere)
          .map((r) => {
            const vec = q.embedding ? cosine(q.embedding, r.embedding) : 0
            const kw = terms.length ? terms.filter((t) => r.content.toLowerCase().includes(t)).length / terms.length : 0
            return { id: r.id, content: r.content, fields: r.fields, score: vec + kw }
          })
          .filter((r) => (q.text && !q.embedding ? r.score > 0 : true))
          .sort((a, b) => b.score - a.score)
          .slice(0, q.k)
      },
      migrationSQL: (spec, dims) => `-- ${spec.name} vector(${dims})`,
    },
    knowledge: {
      async search(query) {
        const rows = await services.vectors.query('ai_knowledge', { text: query, embedding: fakeEmbedding(query), k: 5 }, {})
        const hits = rows.map((r) => ({ id: r.id, sourceCollection: String(r.fields.sourceCollection ?? ''), sourceId: String(r.fields.sourceId ?? ''), title: String(r.fields.title ?? ''), content: r.content, url: r.fields.url as string | undefined, score: r.score }))
        return { hits, citations: hits.map((h) => ({ title: h.title, url: h.url, sourceCollection: h.sourceCollection, sourceId: h.sourceId })) }
      },
      indexDoc: async () => ({ chunks: 0, embedded: 0 }),
      removeDoc: async () => undefined,
      reindexAll: async () => ({ docs: 0, chunks: 0 }),
    },
    guardrails: {
      checkInput: (text) => ({ ok: text.length <= settings.limits.maxInputChars, issues: [] }),
      checkOutput: (text) => ({ ok: true, issues: [], text }),
      moderate: async () => ({ ok: true, issues: [] }),
      sanitizeHtml: (h) => h.replace(/<script[\s\S]*?<\/script>/gi, ''),
      renderMarkdown: (md) => md,
      systemPolicy: () => 'POLICY',
      quote: (label, text) => `<${label}>\n${text}\n</${label}>`,
      redact: (_c, d) => d,
    },
    memory: {
      async thread(_ctx, o) {
        const cid = o.conversationId ?? id()
        if (!log.messages.has(cid)) log.messages.set(cid, [])
        return { id: cid, channel: o.channel, module: _ctx.module }
      },
      async append(cid, msg) {
        const m = { ...msg, id: id(), createdAt: new Date().toISOString() }
        log.messages.get(cid)?.push(m) ?? log.messages.set(cid, [m])
        return m
      },
      async context(cid) {
        return { messages: (log.messages.get(cid) ?? []).filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, content: m.text })) }
      },
      maybeSummarize: async () => undefined,
      update: async () => undefined,
      customerMemory: { get: async () => null, set: async () => undefined, clear: async () => undefined },
    },
    usage: {
      record: async (i) => void log.usage.push(i),
      monthToDate: async () => 0,
      summary: async () => [],
    },
    budgets: {
      assert: async () => {
        if (opts.budgetExceeded) throw new AIError('budget_exceeded', 'Budget exhausted')
      },
      status: async () => ({ limitMicros: null, spentMicros: 0, ratio: opts.budgetExceeded ? 1 : 0 }),
    },
    audit: { log: async (e) => void log.audit.push(e) },
    rateLimit: { hit: async () => ({ ok: true, remaining: 99, resetSec: 60 }) },
    crypto: {
      encrypt: (s) => `enc:${Buffer.from(s).toString('base64')}`,
      decrypt: (s) => Buffer.from(s.replace(/^enc:/, ''), 'base64').toString(),
      hashId: (s) => `h_${createHash('sha256').update(s).digest('hex').slice(0, 32)}`,
    },
    settings: async () => settings,
    isModuleEnabled: async (m) => settings.enabledModules.includes(m),
    systemContext: (payload, o) => createTestContext({ payload, module: o.module, tenant: o.tenant, locale: o.locale, actor: { kind: 'system', roles: ['super-admin'] }, surface: 'job', adapters }),
  }
  return services
}

/** Build an AIContext for tests. `payload` defaults to a stub object. */
export const createTestContext = (o: Partial<AIContext> & { module?: string } = {}): AIContext => {
  const payload = o.payload ?? ({ config: { custom: {} }, logger: console } as unknown as Payload)
  const actor = o.actor ?? { kind: 'visitor', roles: [], visitorId: 'v_test' }
  return {
    payload,
    requestId: o.requestId ?? 'req_test',
    module: o.module ?? 'test',
    surface: o.surface ?? 'storefront',
    actor,
    tenant: o.tenant,
    locale: o.locale ?? 'en',
    adapters: o.adapters ?? {},
    adapterCtx: o.adapterCtx ?? { payload, user: actor.user, customerId: actor.customerId, locale: o.locale ?? 'en', tenant: o.tenant, system: actor.kind === 'system' },
    req: o.req,
  }
}

/** Build a ToolContext with fake services attached. */
export const createToolContext = (services: CoreServices, o: Partial<AIContext> & { module?: string } = {}): ToolContext => ({
  ...createTestContext({ adapters: services.adapters, ...o }),
  services,
})

/** Collect an async iterable into an array. */
export const collect = async <T>(it: AsyncIterable<T>): Promise<T[]> => {
  const out: T[] = []
  for await (const x of it) out.push(x)
  return out
}

export { createFakePayload, matchesWhere } from './fakePayload'
export type { FakePayload } from './fakePayload'
