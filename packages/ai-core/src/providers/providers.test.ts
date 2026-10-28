import { APICallError } from 'ai'
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test'
import { describe, expect, it } from 'vitest'
import { AIError } from '../contracts'
import { collect } from '../testing'
import { lookupCatalog } from './catalog'
import { mapProviderError } from './errors'
import { buildProvider, openRouterCost } from './factories'
import { createProviderRegistry } from './registry'
import { createSdkProvider } from './sdk'

const usage = (input: number, output: number, cacheRead?: number) => ({
  inputTokens: { total: input, noCache: input - (cacheRead ?? 0), cacheRead, cacheWrite: undefined },
  outputTokens: { total: output, text: output, reasoning: undefined },
})

const apiError = (statusCode: number, body = '') =>
  new APICallError({ message: `HTTP ${statusCode}`, url: 'https://x', requestBodyValues: {}, statusCode, responseBody: body })

describe('error mapping', () => {
  it.each([
    [429, '', 'rate_limit'],
    [401, '', 'auth'],
    [403, '', 'auth'],
    [400, 'bad param', 'bad_request'],
    [400, 'Your request was rejected by the content_filter', 'content_filtered'],
    [529, 'overloaded_error', 'overloaded'],
    [503, '', 'overloaded'],
    [500, '', 'unavailable'],
    [504, '', 'timeout'],
    [402, 'requires more credits', 'unavailable'],
  ])('status %i %s -> %s', (status, body, code) => {
    expect(mapProviderError(apiError(status, body), 'p').code).toBe(code)
  })

  it('maps aborts, retry wrappers, network errors and passes AIErrors through', () => {
    expect(mapProviderError(Object.assign(new Error('aborted'), { name: 'AbortError' })).code).toBe('timeout')
    expect(mapProviderError(Object.assign(new Error('retry'), { name: 'AI_RetryError', lastError: apiError(429) })).code).toBe('rate_limit')
    expect(mapProviderError(new TypeError('fetch failed')).code).toBe('unavailable')
    const e = new AIError('budget_exceeded', 'x')
    expect(mapProviderError(e)).toBe(e)
    expect(mapProviderError(apiError(429)).retryable).toBe(true)
    expect(mapProviderError(apiError(401)).retryable).toBe(false)
  })
})

describe('SDK provider normalization', () => {
  it('normalizes text, tool calls, usage (cached) and passes tools as JSON schema', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: {
        content: [
          { type: 'text', text: 'Looking it up' },
          { type: 'tool-call', toolCallId: 'c1', toolName: 'getOffering', input: '{"id":"42"}' },
        ],
        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        usage: usage(1000, 20, 400),
        warnings: [],
      },
    })
    const p = createSdkProvider({ id: 'x', type: 'openai', load: () => ({ languageModel: () => model }) })
    const r = await p.chat({
      model: 'm',
      system: 'sys',
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'c0', toolName: 'search', input: { q: 'a' } }] },
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c0', toolName: 'search', output: { items: [] } }] },
      ],
      tools: [{ name: 'getOffering', description: 'Get', inputSchema: { type: 'object', properties: { id: { type: 'string' } } } }],
    })
    expect(r.text).toBe('Looking it up')
    expect(r.toolCalls).toEqual([{ toolCallId: 'c1', toolName: 'getOffering', input: { id: '42' } }])
    expect(r.finishReason).toBe('tool-calls')
    expect(r.usage).toEqual({ inputTokens: 1000, outputTokens: 20, cachedInputTokens: 400 })
    const call = model.doGenerateCalls[0]
    expect(call.tools?.[0]).toMatchObject({ name: 'getOffering' })
    expect(call.prompt[0]).toMatchObject({ role: 'system', content: 'sys' })
  })

  it('returns parsed objects for responseSchema and captures gateway cost', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: {
        content: [{ type: 'text', text: '{"title":"Red dress"}' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: usage(10, 5),
        warnings: [],
        providerMetadata: { openrouter: { usage: { cost: 0.00042 } } },
      },
    })
    const p = createSdkProvider({ id: 'or', type: 'openrouter', load: () => ({ languageModel: () => model }), reportedCost: openRouterCost })
    const r = await p.chat({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'x' }], responseSchema: { type: 'object', properties: { title: { type: 'string' } } } })
    expect(r.object).toEqual({ title: 'Red dress' })
    expect(r.usage.reportedCostMicros).toBe(420)
  })

  it('maps streams to normalized events and vendor errors to AIError', async () => {
    const model = new MockLanguageModelV4({
      doStream: {
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 't' },
          { type: 'text-delta', id: 't', delta: 'Hel' },
          { type: 'text-delta', id: 't', delta: 'lo' },
          { type: 'text-end', id: 't' },
          { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: usage(5, 2) },
        ]),
      },
    })
    const p = createSdkProvider({ id: 'x', type: 'anthropic', load: () => ({ languageModel: () => model }) })
    const events = await collect(p.stream!({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }))
    expect(events.filter((e) => e.type === 'text-delta').map((e) => (e as { text: string }).text).join('')).toBe('Hello')
    expect(events.at(-1)).toEqual({ type: 'finish', finishReason: 'stop', usage: { inputTokens: 5, outputTokens: 2 } })

    const failing = new MockLanguageModelV4({ doGenerate: async () => { throw apiError(429) } })
    const p2 = createSdkProvider({ id: 'y', type: 'openai', load: () => ({ languageModel: () => failing }) })
    await expect(p2.chat({ model: 'm', messages: [{ role: 'user', content: 'x' }] })).rejects.toMatchObject({ code: 'rate_limit', providerId: 'y' })
  })
})

describe('provider registry + catalog', () => {
  it('fills catalog defaults and lets config/DB overrides win', () => {
    expect(lookupCatalog('openai', 'gpt-4o-mini-2024-07-18')?.inputPriceMicrosPerM).toBe(150_000)
    expect(lookupCatalog('openrouter', 'openai/gpt-4o-mini')?.capabilities).toContain('tools')
    // Gateways write versions with dots; the catalog uses the vendor's dashes.
    expect(lookupCatalog('openrouter', 'anthropic/claude-haiku-5.5')).toMatchObject({ modelId: 'anthropic/claude-haiku-5.5', inputPriceMicrosPerM: 100_000 })
    expect(lookupCatalog('openrouter', 'anthropic/claude-haiku-5.5')?.capabilities).toContain('vision')
    expect(lookupCatalog('anthropic', 'claude-opus-5-5')?.inputPriceMicrosPerM).toBe(4_000_000)
    expect(lookupCatalog('openrouter', 'openai/gpt-5.4-mini')?.inputPriceMicrosPerM).toBe(750_000)
    expect(lookupCatalog('openai', 'gpt-5-mini')?.inputPriceMicrosPerM).toBe(250_000)
    const reg = createProviderRegistry({ providers: [{ id: 'oa', type: 'openai', models: [{ modelId: 'gpt-4o-mini', capabilities: ['chat'], languagesVerified: ['bn'] }] }] })
    expect(reg.model('oa:gpt-4o-mini')).toMatchObject({ capabilities: ['chat'], languagesVerified: ['bn'], inputPriceMicrosPerM: 150_000 })
    expect(reg.model('oa:text-embedding-3-small')?.embedDims).toBe(1536)
    expect(reg.model('oa:some-new-model')?.capabilities).toContain('chat')
    reg.setModelOverrides([{ providerId: 'oa', modelId: 'gpt-4o-mini', enabled: false }])
    expect(reg.model('oa:gpt-4o-mini')?.enabled).toBe(false)
    expect(reg.model('nope:x')).toBeUndefined()
  })

  it('reports missing keys and missing optional packages as clear errors at call time', async () => {
    const p = buildProvider({ id: 'oa', type: 'openai', apiKeyEnv: 'NOPE_KEY' }, { env: {} })
    await expect(p.chat({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'x' }] })).rejects.toMatchObject({ code: 'auth' })
    const b = buildProvider({ id: 'br', type: 'bedrock' }, { env: {} })
    await expect(b.chat({ model: 'x', messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(/amazon-bedrock/)
    expect(() => buildProvider({ id: 'c', type: 'custom' })).toThrow(/adapter/)
  })

  it('decrypts BYOK keys lazily via crypto', () => {
    const decrypted: string[] = []
    const crypto = { encrypt: (s: string) => s, decrypt: (s: string) => (decrypted.push(s), 'plain'), hashId: (s: string) => s }
    const reg = createProviderRegistry({ crypto })
    reg.register({ id: 't1', type: 'openai', tenant: 't1' }, { encryptedKey: 'v1:enc', source: 'db' })
    expect(decrypted).toHaveLength(0)
    expect(reg.get('t1')).toBeDefined()
    expect(decrypted).toEqual(['v1:enc'])
  })
})
