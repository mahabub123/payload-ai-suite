import { sanitizeConfig, type SanitizedConfig } from 'payload'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { createFakeServices, createMockProvider, createToolContext, type FakeServices } from 'payload-ai-core/testing'
import type { AdapterSet, AIContext, AIEndpointDefinition, Category } from 'payload-ai-core'
import { contentModule } from '../src'
import { createFakePayload, seed, type FakePayload } from './fakePayload'
import type { AiContentOptions } from '../src/types'

let sanitized: SanitizedConfig | undefined
export const sanitizedConfig = async (): Promise<SanitizedConfig> =>
  (sanitized ??= await sanitizeConfig({ collections: [], secret: 'test-secret', db: {} as never } as never))

/** A rich text field with a real (sanitized) Lexical adapter, like payload.collections[x].config.flattenedFields holds. */
export const richTextField = async (name: string) => {
  const config = await sanitizedConfig()
  const editor = await lexicalEditor()({ config, isRoot: false, parentIsLocalized: false })
  return { name, type: 'richText', editor }
}

export const CATEGORIES: Category[] = [
  { id: 'c1', title: 'Sarees', slug: 'sarees' },
  { id: 'c2', title: 'Kurtis', slug: 'kurtis' },
]

export const adapters = (): AdapterSet => ({
  category: {
    collection: 'categories',
    fields: {},
    list: async () => CATEGORIES,
    get: async (id) => CATEGORIES.find((c) => c.id === id) ?? null,
  },
})

export interface Harness {
  payload: FakePayload
  services: FakeServices
  ctx: AIContext
  endpoint: (path: string, method?: string) => AIEndpointDefinition<any>
  call: (path: string, input: unknown, method?: string) => Promise<any>
  def: ReturnType<typeof contentModule>
}

export const createHarness = async (opts: { options?: AiContentOptions; drafts?: boolean } = {}): Promise<Harness> => {
  const description = await richTextField('description')
  const payload = createFakePayload([
    {
      slug: 'products',
      versions: opts.drafts === false ? undefined : { drafts: true },
      fields: [
        { name: 'title', type: 'text', maxLength: 80 },
        { name: 'summary', type: 'textarea' },
        description,
        { name: 'price', type: 'number' },
        { name: 'meta', type: 'group', flattenedFields: [{ name: 'title', type: 'text' }, { name: 'description', type: 'textarea' }] },
        { name: 'aiTags', type: 'text', hasMany: true },
      ],
    },
    { slug: 'ai-generations', fields: [] },
    { slug: 'ai-bulk-runs', fields: [] },
  ])
  ;(payload as any).config = { ...(await sanitizedConfig()), ...payload.config }

  seed(payload, 'products', { id: 'p1', title: 'Jamdani saree', summary: 'Handwoven cotton jamdani saree in red.', price: 450000, _status: 'published' })
  seed(payload, 'products', { id: 'p2', title: 'Cotton kurti', summary: 'Block-printed cotton kurti.', price: 120000, _status: 'published' })

  const provider = createMockProvider()
  const services = createFakeServices({ provider, adapters: adapters() })
  const def = contentModule(opts.options ?? { fields: { products: ['title', 'summary', 'description', 'meta.title', 'meta.description', 'aiTags'] } })
  for (const p of def.prompts ?? []) services.prompts.registerDefault(p, 'content')
  // Run extendConfig so the endpoints know which collections are enabled.
  def.extendConfig?.({ collections: [{ slug: 'products', fields: [] }], custom: payload.config.custom } as never)

  const ctx = createToolContext(services, {
    payload,
    module: 'content',
    surface: 'admin',
    actor: { kind: 'staff', roles: ['store-admin'], user: { id: 'u1', collection: 'users' } as never },
  })
  const endpoint = (path: string, method = 'post') => {
    const e = def.endpoints?.find((x) => x.path === path && x.method === method)
    if (!e) throw new Error(`no endpoint ${method} ${path}`)
    return e
  }
  const call = async (path: string, input: unknown, method = 'post') => {
    const e = endpoint(path, method)
    const parsed = e.input ? e.input.parse(input) : input
    return e.handler({ ctx, services, input: parsed, req: { routeParams: (input as any)?.params ?? {} } as never })
  }
  return { payload, services, ctx, endpoint, call, def }
}
