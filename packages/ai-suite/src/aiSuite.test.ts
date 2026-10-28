import type { Config } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Every dependency is mocked: each fake plugin appends its key to config.custom.trace
// and records the options it was created with.
const h = vi.hoisted(() => {
  const created: { key: string; options: unknown }[] = []
  const fakePlugin =
    (key: string) =>
    (options?: unknown) => {
      created.push({ key, options })
      return (config: any) => ({
        ...config,
        collections: [...(config.collections ?? []), { slug: `ai-${key}-thing`, fields: [] }],
        custom: { ...config.custom, trace: [...(config.custom?.trace ?? []), key] },
      })
    }
  const adapterProvider = { preset: 'mocked', mappedCollections: () => ({}), build: () => ({}), validate: () => [] }
  return { created, fakePlugin, adapterProvider, createAdapters: vi.fn(() => adapterProvider) }
})

vi.mock('@payload-ai-suite/ai-core', () => ({ aiCore: h.fakePlugin('core') }))
vi.mock('@payload-ai-suite/ai-adapters', () => ({ createAdapters: h.createAdapters }))
vi.mock('@payload-ai-suite/ai-content', () => ({ aiContent: h.fakePlugin('content') }))
vi.mock('@payload-ai-suite/ai-search', () => ({ aiSearch: h.fakePlugin('search') }))
vi.mock('@payload-ai-suite/ai-assistant', () => ({ aiAssistant: h.fakePlugin('assistant') }))
vi.mock('@payload-ai-suite/ai-marketing', () => ({ aiMarketing: h.fakePlugin('marketing') }))
vi.mock('@payload-ai-suite/ai-support', () => ({ aiSupport: h.fakePlugin('support') }))
vi.mock('@payload-ai-suite/ai-channels', () => ({ aiChannels: h.fakePlugin('channels') }))
vi.mock('@payload-ai-suite/ai-insights', () => ({ aiInsights: h.fakePlugin('insights') }))
vi.mock('@payload-ai-suite/ai-media', () => ({ aiMedia: h.fakePlugin('media') }))
vi.mock('@payload-ai-suite/ai-copilot', () => ({ aiCopilot: h.fakePlugin('copilot') }))

import { aiSuite } from './aiSuite'
import type { AISuiteOptions } from './options'
import { AISuiteConfigError } from './validate'

const providers = [{ id: 'openai', type: 'openai' as const, apiKeyEnv: 'OPENAI_API_KEY' }]
const base = (o: Partial<AISuiteOptions> = {}): AISuiteOptions => ({
  preset: 'ecommerce',
  providers,
  routes: { chat: ['openai:gpt-4.1-mini'] },
  ...o,
})
const baseConfig = (): Config =>
  ({ collections: [{ slug: 'products', fields: [] }], custom: { mine: 1 } }) as unknown as Config

const run = async (o: AISuiteOptions) => (await aiSuite(o)(baseConfig())) as Config & { custom: any }

beforeEach(() => {
  h.created.length = 0
  h.createAdapters.mockClear()
})

describe('aiSuite composition', () => {
  it('runs core first, then every enabled module in phase order', async () => {
    const all = { content: true, search: true, assistant: true, marketing: true, support: true, channels: { whatsapp: {} }, insights: true, media: true, copilot: true }
    // Declare keys in a scrambled order to prove ordering does not depend on object key order.
    const scrambled = Object.fromEntries(Object.entries(all).reverse()) as AISuiteOptions['modules']
    const config = await run(base({ modules: scrambled }))
    expect(config.custom.trace).toEqual(['core', 'content', 'search', 'assistant', 'marketing', 'support', 'channels', 'insights', 'media', 'copilot'])
    expect(config.custom.mine).toBe(1)
    expect(config.collections?.[0]?.slug).toBe('products')
  })

  it('installs only core when no module is enabled', async () => {
    const config = await run(base())
    expect(config.custom.trace).toEqual(['core'])
    expect(config.collections).toHaveLength(2)
  })

  it('a disabled module adds nothing and its factory is never called', async () => {
    const config = await run(base({ modules: { content: true, search: false, assistant: true } }))
    expect(config.custom.trace).toEqual(['core', 'content', 'assistant'])
    expect(h.created.map((c) => c.key)).not.toContain('search')
    expect(config.collections?.map((c) => c.slug)).not.toContain('ai-search-thing')
  })

  it('returns a single plugin with a slug', () => {
    const p = aiSuite(base({ modules: { content: true } }))
    expect(typeof p).toBe('function')
    expect(p.slug).toBe('ai-suite')
  })
})

describe('options pass-through', () => {
  it('builds adapters from preset/overrides/custom and hands them to core with the core options', async () => {
    const overrides = { offering: { collection: 'products', fields: { title: 'name' } } }
    await run(
      base({
        overrides: overrides as AISuiteOptions['overrides'],
        allowTenantKeys: true,
        tenant: { field: 'tenant' },
        locales: ['en', 'bn'],
        defaultLocale: 'bn',
        budgets: { monthlyMicros: 50_000_000, perModule: { assistant: 0.6 } },
        modules: { assistant: true },
      }),
    )
    expect(h.createAdapters).toHaveBeenCalledWith({ preset: 'ecommerce', overrides, custom: undefined })
    const core = h.created.find((c) => c.key === 'core')!.options as Record<string, unknown>
    expect(core).toMatchObject({
      providers,
      routes: { chat: ['openai:gpt-4.1-mini'] },
      allowTenantKeys: true,
      tenant: { field: 'tenant' },
      locales: ['en', 'bn'],
      defaultLocale: 'bn',
      budgets: { monthlyMicros: 50_000_000, perModule: { assistant: 0.6 } },
      adapters: h.adapterProvider,
    })
    for (const k of ['preset', 'overrides', 'custom', 'modules']) expect(core).not.toHaveProperty(k)
  })

  it('uses a pre-built adapters provider without calling createAdapters', async () => {
    const adapters = { ...h.adapterProvider, preset: 'mine' }
    await run(base({ adapters }))
    expect(h.createAdapters).not.toHaveBeenCalled()
    expect((h.created[0].options as any).adapters).toBe(adapters)
  })

  it('passes module options through untouched; `true` means defaults', async () => {
    const search = { hybrid: true, recommendations: true }
    const marketing = { approvalRole: 'marketing-approver' }
    await run(base({ modules: { search, marketing, content: true, assistant: true, channels: true } } as AISuiteOptions))
    const opts = Object.fromEntries(h.created.map((c) => [c.key, c.options]))
    expect(opts.search).toBe(search)
    expect(opts.marketing).toBe(marketing)
    expect(opts.content).toBeUndefined()
    expect(opts.channels).toEqual({})
  })

  it('accepts mockProvider without providers/routes', async () => {
    const mockProvider = { id: 'mock', type: 'custom' as const, chat: async () => ({}) as any }
    await run({ preset: 'ecommerce', mockProvider })
    const core = h.created[0].options as any
    expect(core.mockProvider).toBe(mockProvider)
    expect(core.providers).toEqual([])
    expect(core.routes).toEqual({})
  })
})

describe('option validation', () => {
  const fails = (o: AISuiteOptions, msg: RegExp) => {
    let err: unknown
    try {
      aiSuite(o)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(AISuiteConfigError)
    expect((err as Error).message).toMatch(msg)
  }

  it('channels without assistant', () => fails(base({ modules: { channels: { whatsapp: {} } as any } }), /channels needs modules\.assistant/))
  it('no providers and no mock', () => fails(base({ providers: [] }), /providers" is empty/))
  it('unknown module with suggestion', () => fails(base({ modules: { serch: true } as any }), /Unknown module "serch".*Did you mean "search"/))
  it('allowTenantKeys without tenant', () => fails(base({ allowTenantKeys: true }), /allowTenantKeys needs "tenant"/))
  it('budget shares over 1', () =>
    fails(base({ modules: { content: true, search: true }, budgets: { perModule: { content: 0.7, search: 0.5 } } }), /add up to 1\.20/))
  it('defaultLocale outside locales', () => fails(base({ locales: ['en'], defaultLocale: 'bn' }), /defaultLocale "bn"/))
  it('raw api key in config', () => fails(base({ providers: [{ id: 'x', type: 'openai', apiKey: 'sk-1' } as any] }), /never put keys in config/))
  it('openai-compatible needs baseURL', () => fails(base({ providers: [{ id: 'ollama', type: 'openai-compatible' }] }), /needs "baseURL"/))
  it('malformed route ref', () => fails(base({ routes: { chat: ['gpt-4o'] } }), /must be "providerId:modelId"/))
  it('missing preset', () => fails({ providers } as unknown as AISuiteOptions, /"preset" is required/))

  it('collects all problems at once', () => {
    try {
      aiSuite(base({ providers: [], allowTenantKeys: true, modules: { channels: true } }))
    } catch (e) {
      expect((e as AISuiteConfigError).problems.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('route to a provider not in config is only a warning', () => {
    expect(() => aiSuite(base({ routes: { chat: ['byok:model'] } }))).not.toThrow()
  })
})
