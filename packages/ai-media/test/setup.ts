import { createFakeServices, createToolContext, type FakeServices } from 'payload-ai-core/testing'
import type { AIContext, Category } from 'payload-ai-core'
import { mediaModule } from '../src'
import type { AiMediaOptions } from '../src/types'
import { createFakePayload, seed, type FakePayload } from './fakePayload'

export const CATEGORIES: Category[] = [
  { id: 'c1', title: 'Sarees' },
  { id: 'c2', title: 'Kurtis' },
]

export interface MediaHarness {
  payload: FakePayload
  services: FakeServices
  ctx: AIContext
  def: ReturnType<typeof mediaModule>
  call: (op: string, input: unknown) => Promise<any>
}

export const createMediaHarness = (opts: { options?: AiMediaOptions; localizedAlt?: boolean } = {}): MediaHarness => {
  const payload = createFakePayload([
    {
      slug: 'media',
      upload: { staticDir: '/nonexistent-ai-media-test' },
      fields: [
        { name: 'alt', type: 'text', localized: opts.localizedAlt },
        { name: 'aiTags', type: 'text', hasMany: true },
        { name: 'aiGenerated', type: 'checkbox' },
        { name: 'aiSource', type: 'relationship' },
        { name: 'aiModel', type: 'text' },
      ],
    },
  ])
  seed(payload, 'media', { id: 'm1', filename: 'saree.jpg', mimeType: 'image/jpeg', url: '/api/media/file/saree.jpg' })
  seed(payload, 'media', { id: 'm2', filename: 'kurti.jpg', mimeType: 'image/jpeg', url: '/api/media/file/kurti.jpg', alt: 'Staff-written alt' })
  seed(payload, 'media', { id: 'm3', filename: 'secret.jpg', mimeType: 'image/jpeg', url: '/api/media/file/secret.jpg', aiExclude: true })
  seed(payload, 'media', { id: 'pdf', filename: 'spec.pdf', mimeType: 'application/pdf', url: '/api/media/file/spec.pdf' })

  const services = createFakeServices({
    adapters: { category: { collection: 'categories', fields: {}, list: async () => CATEGORIES, get: async () => null } },
  })
  const def = mediaModule(opts.options)
  for (const p of def.prompts ?? []) services.prompts.registerDefault(p, 'media')
  def.extendConfig?.({ collections: [{ slug: 'media', upload: true, fields: [] }], custom: payload.config.custom } as never)

  const ctx = createToolContext(services, {
    payload,
    module: 'media',
    surface: 'admin',
    actor: { kind: 'staff', roles: ['content'], user: { id: 'u1', collection: 'users' } as never },
  })
  const call = async (op: string, input: unknown) => {
    const e = def.endpoints?.find((x) => x.path === `/ai/media/${op}`)
    if (!e) throw new Error(`no endpoint ${op}`)
    return e.handler({ ctx, services, input: e.input ? e.input.parse(input) : input, req: {} as never })
  }
  return { payload, services, ctx, def, call }
}
