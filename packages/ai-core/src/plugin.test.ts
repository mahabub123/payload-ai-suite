import { beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { CollectionConfig, Config, Payload } from 'payload'
import type { AICoreOptions, AdapterProvider } from './contracts'
import { aiCore } from './plugin'
import { createAIModulePlugin } from './module/createModulePlugin'
import { getAI } from './module/runtime'
import { createFakePayload, createMockProvider } from './testing'

beforeAll(() => {
  process.env.PAYLOAD_SECRET ??= 'test-secret-test-secret-test-secret'
})

const existingHook = vi.fn()
const base = (): Config =>
  ({
    admin: { user: 'staff' },
    collections: [
      { slug: 'staff', auth: true, fields: [] },
      { slug: 'pages', fields: [{ name: 'title', type: 'text' }], hooks: { afterChange: [existingHook] } },
    ],
    endpoints: [{ path: '/hello', method: 'get', handler: async () => new Response('hi') }],
    jobs: { tasks: [{ slug: 'site-task', handler: async () => ({ output: {} }) }] },
    custom: { site: true },
    onInit: vi.fn(),
  }) as unknown as Config

const adapters: AdapterProvider = {
  preset: 'test',
  mappedCollections: () => ({ knowledge: ['pages'] }),
  build: () => ({}),
  validate: () => [],
}

const options = (o: Partial<AICoreOptions> = {}): AICoreOptions => ({
  providers: [],
  routes: {},
  adapters,
  mockProvider: createMockProvider(),
  ...o,
})

const slugs = (c: Config) => (c.collections ?? []).map((x) => x.slug)

describe('aiCore plugin config', () => {
  it('adds only its own config and preserves existing collections, hooks, endpoints, tasks and custom', () => {
    const incoming = base()
    const out = aiCore(options())(incoming)
    expect(slugs(out).slice(0, 2)).toEqual(['staff', 'pages'])
    const added = slugs(out).slice(2)
    for (const s of ['ai-actions', 'ai-prompts', 'ai-conversations', 'ai-messages', 'ai-customer-memory', 'ai-tickets']) expect(added).toContain(s)
    expect(added.every((s) => s.startsWith('ai-'))).toBe(true)
    expect((out.globals ?? []).map((g) => g.slug)).toContain('ai-settings')

    const pages = out.collections!.find((c) => c.slug === 'pages')!
    expect(pages.hooks?.afterChange?.[0]).toBe(existingHook)
    expect(pages.hooks?.afterChange?.length).toBe(2)
    expect(pages.hooks?.afterDelete?.length).toBe(1)
    expect(pages.fields).toEqual(incoming.collections![1].fields)

    expect(out.endpoints![0].path).toBe('/hello')
    const paths = out.endpoints!.map((e) => `${e.method} ${e.path}`)
    expect(paths).toContain('post /ai/actions/:id/confirm')
    expect(paths).toContain('post /ai/actions/:id/reject')
    expect(out.endpoints!.slice(1).every((e) => e.path.startsWith('/ai/'))).toBe(true)

    const tasks = out.jobs!.tasks!.map((t) => t.slug)
    expect(tasks[0]).toBe('site-task')
    expect(tasks).toEqual(expect.arrayContaining(['ai-core-index-knowledge', 'ai-core-knowledge-drift', 'ai-core-retention']))

    expect((out.custom as any).site).toBe(true)
    expect((out.custom as any).aiSuite).toMatchObject({ coreInstalled: true, modules: [] })
    const tickets = out.collections!.find((c) => c.slug === 'ai-tickets')!
    expect(tickets.fields.find((f) => 'name' in f && f.name === 'assignee')).toMatchObject({ relationTo: 'staff' })
    expect(out.collections!.filter((c) => c.slug.startsWith('ai-')).every((c) => c.admin?.group === 'AI Suite')).toBe(true)
  })

  it('adds the tenant field to core collections when multi-tenant is configured', () => {
    const out = aiCore(options({ tenant: { field: 'tenant' } }))(base())
    const actions = out.collections!.find((c) => c.slug === 'ai-actions') as CollectionConfig
    expect(actions.fields.some((f) => 'name' in f && f.name === 'tenant')).toBe(true)
    expect(out.collections!.find((c) => c.slug === 'pages')!.fields.some((f) => 'name' in f && f.name === 'tenant')).toBe(false)
  })

  it('disabled: returns the config unchanged except the custom flag, and modules add nothing', () => {
    const incoming = base()
    const out = aiCore(options({ disabled: true }))(incoming)
    expect({ ...out, custom: undefined }).toEqual({ ...incoming, custom: undefined })
    expect((out.custom as any).aiSuite).toMatchObject({ coreInstalled: true, disabled: true })
    const mod = createAIModulePlugin({ slug: 'search', collections: [{ slug: 'ai-search-events', fields: [] }] })(out)
    expect(mod).toBe(out)
  })

  it('wires module schedules into task schedule config', () => {
    const out = createAIModulePlugin({
      slug: 'insights',
      tasks: [{ slug: 'ai-insights-briefing', handler: async () => ({ output: {} }) }],
      schedules: [{ task: 'ai-insights-briefing', cron: '0 0 7 * * *', queue: 'ai-nightly' }],
    })(aiCore(options())(base()))
    expect(out.jobs!.tasks!.find((t) => t.slug === 'ai-insights-briefing')!.schedule).toEqual([{ cron: '0 0 7 * * *', queue: 'ai-nightly' }])
  })
})

describe('aiCore onInit', () => {
  it('creates services, registers module tools/prompts, runs module onInit in order, then the existing onInit', async () => {
    const order: string[] = []
    const incoming = base()
    const siteOnInit = incoming.onInit as ReturnType<typeof vi.fn>
    siteOnInit.mockImplementation(() => void order.push('site'))
    let config = aiCore(options())(incoming)
    const tool = (name: string) => ({ name, description: name, tier: 'read' as const, input: z.object({}), run: async () => ({ data: {} }) })
    config = createAIModulePlugin({
      slug: 'assistant',
      tools: [tool('getPolicy')],
      onInit: (_p, s) => {
        order.push(`assistant:${Boolean(s.tools.get('searchOfferings'))}`)
      },
    })(config)
    config = createAIModulePlugin({
      slug: 'search',
      tools: [tool('searchOfferings')],
      prompts: [{ slug: 'search.parse', task: 'fast', system: 'Parse {{q}}' }],
      onInit: () => void order.push('search'),
    })(config)

    const payload = createFakePayload({ custom: config.custom as Record<string, unknown>, collections: config.collections as CollectionConfig[] }) as unknown as Payload
    await config.onInit!(payload)
    const services = getAI(payload)
    expect(services.tools.list().map((t) => t.name)).toEqual(['getPolicy', 'searchOfferings'])
    expect(services.prompts.list().map((p) => p.slug)).toEqual(['search.parse'])
    expect(order).toEqual(['assistant:true', 'search', 'site'])
  })
})
