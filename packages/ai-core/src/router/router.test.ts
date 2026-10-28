import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { AIProvider, BudgetService, ChatRequest, ChatResult, ModelInfoInput, ProviderConfig, UsageRecordInput, UsageService } from '../contracts'
import { AIError } from '../contracts'
import { collect, createMockProvider, createTestContext } from '../testing'
import { createProviderRegistry } from '../providers/registry'
import { createFakePayload } from '../usage/fake-payload'
import { createAIClient } from './client'
import type { AIClientDeps } from './client'
import { CircuitBreaker } from './circuit'
import { invalidateRouting } from './state'

type Behaviour = (req: ChatRequest, n: number) => Promise<Partial<ChatResult>> | Partial<ChatResult>

const fakeProvider = (id: string, behave: Behaviour = () => ({ text: `from ${id}` })) => {
  const calls: ChatRequest[] = []
  const embedCalls: string[][] = []
  const p: AIProvider & { calls: ChatRequest[]; embedCalls: string[][] } = {
    id,
    type: 'custom',
    calls,
    embedCalls,
    async chat(req) {
      calls.push(req)
      const r = await behave(req, calls.length)
      return { text: r.text ?? '', toolCalls: r.toolCalls ?? [], finishReason: r.finishReason ?? 'stop', usage: r.usage ?? { inputTokens: 100, outputTokens: 10 }, object: r.object }
    },
    async embed(req) {
      embedCalls.push(req.values)
      return { embeddings: req.values.map(() => [1, 0, 0]), usage: { inputTokens: req.values.length, outputTokens: 0 } }
    },
  }
  return p
}

const hang: Behaviour = (req) =>
  new Promise((_, reject) => req.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))

const chat = (modelId: string, extra: Partial<ModelInfoInput> = {}): ModelInfoInput => ({
  modelId,
  capabilities: ['chat', 'streaming', 'tools', 'structuredOutput'],
  inputPriceMicrosPerM: 1_000_000,
  outputPriceMicrosPerM: 2_000_000,
  ...extra,
})

const setup = (o: { providers: ProviderConfig[]; deps?: Partial<AIClientDeps>; routes?: AIClientDeps['options']; dbRoutes?: Record<string, unknown>[]; blocked?: boolean }) => {
  const usageRows: UsageRecordInput[] = []
  const usage: UsageService = { record: async (i) => void usageRows.push(i), monthToDate: async () => 0, summary: async () => [] }
  let budgetChecks = 0
  const budgets: BudgetService = {
    assert: async () => {
      budgetChecks++
      if (o.blocked) throw new AIError('budget_exceeded', 'spent')
    },
    status: async () => ({ limitMicros: null, spentMicros: 0, ratio: 0 }),
  }
  const payload = createFakePayload()
  for (const r of o.dbRoutes ?? []) void payload.create({ collection: 'ai-routes', data: r })
  const registry = createProviderRegistry({ providers: o.providers })
  const client = createAIClient({ registry, usage, budgets, options: o.routes, db: true, ...o.deps })
  invalidateRouting()
  const ctx = (extra: Parameters<typeof createTestContext>[0] = {}) => createTestContext({ payload, module: 'assistant', ...extra })
  return { client, usageRows, ctx, payload, budgetChecks: () => budgetChecks }
}

describe('route resolution', () => {
  const a = fakeProvider('a')
  const b = fakeProvider('b')
  const providers: ProviderConfig[] = [
    { id: 'a', type: 'custom', adapter: a, models: [chat('fast'), chat('t1'), { modelId: 'emb', capabilities: ['embeddings'], embedDims: 3 }, chat('nov', { capabilities: ['chat'] })] },
    { id: 'b', type: 'custom', adapter: b, models: [chat('smart', { capabilities: ['chat', 'tools', 'vision'] }), chat('bn', { languagesVerified: ['bn'] })] },
    { id: 'byok', type: 'custom', adapter: b, tenant: 't9', models: [chat('own')] },
  ]

  it('applies global < locale < module < tenant precedence', async () => {
    const { client, ctx } = setup({
      providers,
      routes: {
        routes: { chat: ['a:fast', 'b:smart'] },
        routeOverrides: { locale: { bn: { chat: ['b:bn'] } }, module: { content: { chat: ['b:smart'] } } },
      },
      dbRoutes: [{ taskClass: 'chat', scope: 'tenant', scopeValue: 't1', models: ['a:t1'], enabled: true }],
    })
    await client.refresh(ctx().payload)
    const refs = (c: Parameters<typeof client.resolveRoute>[1]) => client.resolveRoute('chat', c).map((m) => m.ref)
    expect(refs({ module: 'assistant', locale: 'en' })).toEqual(['a:fast', 'b:smart'])
    expect(refs({ module: 'assistant', locale: 'bn-BD' })).toEqual(['b:bn'])
    expect(refs({ module: 'content', locale: 'bn' })).toEqual(['b:smart'])
    expect(refs({ module: 'content', locale: 'bn', tenant: 't1' })).toEqual(['a:t1'])
  })

  it('filters by capabilities, needs, enabled and tenant-owned providers; prefers verified languages', async () => {
    const { client, ctx } = setup({ providers, routes: { routes: { chat: ['a:nov', 'a:emb', 'byok:own', 'a:fast', 'b:bn'] } } })
    await client.refresh(ctx().payload)
    expect(client.resolveRoute('chat', { module: 'x', locale: 'en' }).map((m) => m.ref)).toEqual(['a:nov', 'a:fast', 'b:bn'])
    expect(client.resolveRoute('chat', { module: 'x', locale: 'bn' }).map((m) => m.ref)).toEqual(['b:bn', 'a:nov', 'a:fast'])
    expect(client.resolveRoute('chat', { module: 'x', locale: 'en', tenant: 't9' }).map((m) => m.ref)).toContain('byok:own')
    // tools needed -> a:nov (chat only) drops out
    const r = await client.generateText({ task: 'chat', prompt: 'hi', tools: [{ name: 't', description: 'd', inputSchema: {} }] }, ctx())
    expect(r.model).toBe('a:fast')
  })

  it('mockProvider short-circuits every route', async () => {
    const mock = createMockProvider()
    const registry = createProviderRegistry({ providers, mockProvider: mock })
    const usageRows: UsageRecordInput[] = []
    const client = createAIClient({
      registry,
      usage: { record: async (i) => void usageRows.push(i), monthToDate: async () => 0, summary: async () => [] },
      budgets: { assert: async () => undefined, status: async () => ({ limitMicros: null, spentMicros: 0, ratio: 0 }) },
      options: { routes: { chat: ['a:fast'] }, mockProvider: mock },
    })
    const ctx = createTestContext()
    const before = a.calls.length
    expect(client.resolveRoute('chat', ctx)[0].ref).toBe('mock:mock-chat')
    expect(client.activeEmbedding(ctx)).toEqual({ ref: 'mock:mock-embed', dims: 1536 })
    expect((await client.generateText({ task: 'fast', prompt: 'x' }, ctx)).text).toBe('ok')
    expect(a.calls).toHaveLength(before)
    expect((await client.embed(['a', 'b'], ctx)).embeddings).toHaveLength(2)
  })
})

describe('budget pre-check', () => {
  it('throws budget_exceeded before any provider call and records a blocked row', async () => {
    const a = fakeProvider('a')
    const { client, ctx, usageRows } = setup({ providers: [{ id: 'a', type: 'custom', adapter: a, models: [chat('m')] }], routes: { routes: { chat: ['a:m'] } }, blocked: true })
    await expect(client.generateText({ task: 'chat', prompt: 'x' }, ctx())).rejects.toMatchObject({ code: 'budget_exceeded' })
    const s = client.streamText({ task: 'chat', prompt: 'x' }, ctx())
    await expect(collect(s)).rejects.toMatchObject({ code: 'budget_exceeded' })
    await expect(s.meta).rejects.toMatchObject({ code: 'budget_exceeded' })
    expect(a.calls).toHaveLength(0)
    expect(usageRows.map((r) => r.outcome)).toEqual(['blocked', 'blocked'])
  })
})

describe('retry, fallback, timeout, circuit breaker', () => {
  it('retries a retryable error once, then falls back; usage rows track each attempt', async () => {
    const a = fakeProvider('a', () => {
      throw new AIError('overloaded', 'busy')
    })
    const b = fakeProvider('b')
    const { client, ctx, usageRows } = setup({
      providers: [
        { id: 'a', type: 'custom', adapter: a, models: [chat('m')] },
        { id: 'b', type: 'custom', adapter: b, models: [chat('m')] },
      ],
      routes: { routes: { chat: ['a:m', 'b:m'] } },
    })
    const r = await client.generateText({ task: 'chat', prompt: 'x' }, ctx())
    expect(r.text).toBe('from b')
    expect(r.model).toBe('b:m')
    expect(a.calls).toHaveLength(2)
    expect(usageRows.map((u) => [u.model, u.outcome, u.errorCode])).toEqual([
      ['a:m', 'error', 'overloaded'],
      ['a:m', 'error', 'overloaded'],
      ['b:m', 'fallback', undefined],
    ])
    // 100 in * $1/M + 10 out * $2/M = 120 micros
    expect(r.costMicros).toBe(120)
    expect(usageRows[2].costMicros).toBe(120)
  })

  it('does not retry or fall back on bad_request', async () => {
    const a = fakeProvider('a', () => {
      throw new AIError('bad_request', 'nope')
    })
    const b = fakeProvider('b')
    const { client, ctx } = setup({
      providers: [
        { id: 'a', type: 'custom', adapter: a, models: [chat('m')] },
        { id: 'b', type: 'custom', adapter: b, models: [chat('m')] },
      ],
      routes: { routes: { chat: ['a:m', 'b:m'] } },
    })
    await expect(client.generateText({ task: 'chat', prompt: 'x' }, ctx())).rejects.toMatchObject({ code: 'bad_request' })
    expect(a.calls).toHaveLength(1)
    expect(b.calls).toHaveLength(0)
  })

  it('times out a hanging model, retries once, then falls back', async () => {
    const a = fakeProvider('a', hang)
    const b = fakeProvider('b')
    const { client, ctx, usageRows } = setup({
      providers: [
        { id: 'a', type: 'custom', adapter: a, models: [chat('m')] },
        { id: 'b', type: 'custom', adapter: b, models: [chat('m')] },
      ],
      routes: { routes: { chat: { models: ['a:m', 'b:m'], timeoutMs: 20 } } },
    })
    const r = await client.generateText({ task: 'chat', prompt: 'x' }, ctx())
    expect(r.model).toBe('b:m')
    expect(a.calls).toHaveLength(2)
    expect(a.calls[0].signal?.aborted).toBe(true)
    expect(usageRows.filter((u) => u.errorCode === 'timeout')).toHaveLength(2)
  })

  it('opens the breaker after 5 failures in 60s, skips the model, then half-opens after cooldown', async () => {
    let t = 1_000_000
    let failing = true
    const a = fakeProvider('a', () => {
      if (failing) throw new AIError('unavailable', 'down')
      return { text: 'a back' }
    })
    const b = fakeProvider('b')
    const { client, ctx } = setup({
      providers: [
        { id: 'a', type: 'custom', adapter: a, models: [chat('m')] },
        { id: 'b', type: 'custom', adapter: b, models: [chat('m')] },
      ],
      routes: { routes: { chat: { models: ['a:m', 'b:m'], maxRetries: 0 } } },
      deps: { now: () => t, breaker: new CircuitBreaker({ now: () => t, cooldownMs: 30_000 }) },
    })
    for (let i = 0; i < 5; i++) await client.generateText({ task: 'chat', prompt: 'x' }, ctx())
    expect(a.calls).toHaveLength(5)
    expect(client.breaker.state('a:m')).toBe('open')

    const r = await client.generateText({ task: 'chat', prompt: 'x' }, ctx())
    expect(r.model).toBe('b:m')
    expect(a.calls).toHaveLength(5) // skipped while open

    t += 31_000
    expect(client.breaker.state('a:m')).toBe('half-open')
    failing = false
    const probe = await client.generateText({ task: 'chat', prompt: 'x' }, ctx())
    expect(probe.model).toBe('a:m')
    expect(client.breaker.state('a:m')).toBe('closed')
  })

  it('breaker: failures outside the window do not accumulate', () => {
    let t = 0
    const br = new CircuitBreaker({ now: () => t })
    for (let i = 0; i < 4; i++) br.failure('x')
    t = 61_000
    br.failure('x')
    expect(br.state('x')).toBe('closed')
  })
})

describe('structured output, streaming, embeddings, images', () => {
  const schema = z.object({ title: z.string(), price: z.number().int() })

  it('generateObject validates with zod, sends JSON schema, falls back on invalid output', async () => {
    const a = fakeProvider('a', () => ({ text: '{"title": 5}' }))
    const b = fakeProvider('b', () => ({ text: '```json\n{"title":"Dress","price":3000}\n```' }))
    const { client, ctx, usageRows } = setup({
      providers: [
        { id: 'a', type: 'custom', adapter: a, models: [chat('m')] },
        { id: 'b', type: 'custom', adapter: b, models: [chat('m')] },
      ],
      routes: { routes: { write: ['a:m', 'b:m'] } },
    })
    const r = await client.generateObject({ task: 'write', prompt: 'x', schema }, ctx())
    expect(r.object).toEqual({ title: 'Dress', price: 3000 })
    expect(a.calls[0].responseSchema).toMatchObject({ type: 'object', properties: { title: { type: 'string' } } })
    expect(usageRows[0]).toMatchObject({ outcome: 'error', errorCode: 'validation', inputTokens: 100 })

    const bad = setup({ providers: [{ id: 'a', type: 'custom', adapter: a, models: [chat('m')] }], routes: { routes: { write: ['a:m'] } } })
    await expect(bad.client.generateObject({ task: 'write', prompt: 'x', schema }, bad.ctx())).rejects.toMatchObject({ code: 'validation' })
  })

  it('streamText falls back before the first chunk and resolves meta', async () => {
    const a = fakeProvider('a')
    a.stream = async function* () {
      throw new AIError('rate_limit', 'slow down')
    }
    const b = createMockProvider({ id: 'b', fallback: 'hello there world' })
    const { client, ctx, usageRows } = setup({
      providers: [
        { id: 'a', type: 'custom', adapter: a, models: [chat('m')] },
        { id: 'b', type: 'custom', adapter: b, models: [chat('m')] },
      ],
      routes: { routes: { chat: { models: ['a:m', 'b:m'], maxRetries: 0 } } },
    })
    const s = client.streamText({ task: 'chat', prompt: 'x' }, ctx())
    const events = await collect(s)
    expect(events.filter((e) => e.type === 'text-delta').map((e) => (e as { text: string }).text).join('')).toBe('hello there world')
    const meta = await s.meta
    expect(meta.model).toBe('b:m')
    expect(usageRows.map((u) => u.outcome)).toEqual(['error', 'fallback'])
  })

  it('embed batches at most 100 values per call and never switches models', async () => {
    const a = fakeProvider('a')
    const { client, ctx, usageRows } = setup({
      providers: [{ id: 'a', type: 'custom', adapter: a, models: [{ modelId: 'e', capabilities: ['embeddings'], embedDims: 3, inputPriceMicrosPerM: 20_000 }] }],
      routes: { routes: { embed: ['a:e'] } },
    })
    const values = Array.from({ length: 250 }, (_, i) => `v${i}`)
    const r = await client.embed(values, ctx())
    expect(a.embedCalls.map((c) => c.length)).toEqual([100, 100, 50])
    expect(r.embeddings).toHaveLength(250)
    expect(r.model).toBe('a:e')
    expect(usageRows).toHaveLength(1)
    expect(usageRows[0].inputTokens).toBe(250)
    expect(client.activeEmbedding({ module: 'x', locale: 'en' })).toEqual({ ref: 'a:e', dims: 3 })
  })

  it('generateImage prices per image', async () => {
    const mock = createMockProvider({ id: 'img' })
    const { client, ctx } = setup({
      providers: [{ id: 'img', type: 'custom', adapter: mock, models: [{ modelId: 'gen', capabilities: ['imageGeneration'], imagePriceMicros: 40_000 }] }],
      routes: { routes: { image: ['img:gen'] } },
    })
    const r = await client.generateImage({ prompt: 'a shoe' }, ctx())
    expect(r.images).toHaveLength(1)
    expect(r.costMicros).toBe(40_000)
  })

  it('testProvider runs a tiny chat call and a tool-call check', async () => {
    const p = fakeProvider('p', (req) => (req.tools?.length ? { toolCalls: [{ toolCallId: '1', toolName: 'report_status', input: { ok: true } }] } : { text: 'OK' }))
    const { client, ctx } = setup({ providers: [{ id: 'p', type: 'custom', adapter: p, models: [chat('m')] }] })
    expect(await client.testProvider('p', ctx())).toEqual({ ok: true, chat: true, tools: true })
    expect(p.calls[0].maxOutputTokens).toBeLessThanOrEqual(16)
    expect((await client.testProvider('missing', ctx())).ok).toBe(false)
  })
})

describe('default output cap', () => {
  it('caps output per task class when the caller sets none, bounded by the model maximum', async () => {
    const { defaultMaxOutput } = await import('./client')
    expect(defaultMaxOutput('write', {})).toBe(4096)
    expect(defaultMaxOutput('fast', { maxOutput: 512 })).toBe(512)
    expect(defaultMaxOutput('reason', { maxOutput: 64_000 })).toBe(8192)
    expect(defaultMaxOutput('embed', {})).toBeUndefined()
  })
})
