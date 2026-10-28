import { describe, expect, it } from 'vitest'
import type { PayloadRequest } from 'payload'
import { createFakePayload, createFakeServices } from '../testing'
import { setAI } from '../module/runtime'
import { aiPromptsCollection, createPromptLibrary, localeChain, onPromptActivated, renderTemplate } from './index'

describe('renderTemplate', () => {
  it('renders vars, dotted paths, raw and missing', () => {
    expect(renderTemplate('Hi {{ name }} from {{shop.city}}, {{{raw}}} [{{missing}}] {{obj}}', { name: 'Rina', shop: { city: 'Dhaka' }, raw: '<b>', obj: { a: 1 } })).toBe(
      'Hi Rina from Dhaka, <b> [] {"a":1}',
    )
  })
  it('locale chain', () => {
    expect(localeChain('bn-BD')).toEqual(['bn-BD', 'bn', '*', 'en'])
  })
})

describe('PromptLibrary', () => {
  const setup = (brandVoice?: string) => {
    const services = createFakeServices({ settings: { brandVoice } })
    const payload = createFakePayload()
    const lib = createPromptLibrary(() => services)
    lib.registerDefault({ slug: 'greet', task: 'chat', system: 'Hello {{name}} (default)' }, 'assistant')
    lib.registerDefault({ slug: 'greet', task: 'chat', locale: 'bn', system: 'নমস্কার {{name}}' }, 'assistant')
    return { services, payload, lib }
  }

  it('falls back by locale to code defaults and appends brand voice', async () => {
    const { payload, lib } = setup('Warm and brief.')
    const bn = await lib.render('greet', { name: 'A' }, { payload, locale: 'bn-BD' })
    expect(bn.system).toContain('নমস্কার A')
    expect(bn.system).toContain('Brand voice')
    expect(bn.version).toBe(0)
    const fr = await lib.render('greet', { name: 'B' }, { payload, locale: 'fr' })
    expect(fr.system.startsWith('Hello B (default)')).toBe(true)
  })

  it('active DB row wins over the default', async () => {
    const { payload, lib } = setup()
    await payload.create({ collection: 'ai-prompts' as never, data: { slug: 'greet', task: 'write', locale: '*', system: 'DB {{name}}', version: 3, status: 'active' } as never })
    await payload.create({ collection: 'ai-prompts' as never, data: { slug: 'greet', task: 'write', locale: '*', system: 'Draft', version: 4, status: 'draft' } as never })
    const r = await lib.render('greet', { name: 'C' }, { payload, locale: 'fr' })
    expect(r).toMatchObject({ system: 'DB C', version: 3, task: 'write' })
  })

  it('unknown slug throws not_found', async () => {
    const { payload, lib } = setup()
    await expect(lib.render('nope', {}, { payload, locale: 'en' })).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('ai-prompts activation', () => {
  it('archives the previous active version and audits', async () => {
    const services = createFakeServices()
    const payload = createFakePayload()
    setAI(payload, services)
    const old = await payload.create({ collection: 'ai-prompts' as never, data: { slug: 's', locale: 'en', system: 'v1', version: 1, status: 'active' } as never })
    const other = await payload.create({ collection: 'ai-prompts' as never, data: { slug: 's', locale: 'bn', system: 'bn', version: 1, status: 'active' } as never })
    const next = await payload.create({ collection: 'ai-prompts' as never, data: { slug: 's', locale: 'en', system: 'v2', version: 2, status: 'active' } as never })
    const req = { payload, context: {}, user: null, headers: new Headers() } as unknown as PayloadRequest
    await onPromptActivated({ doc: next, previousDoc: { ...next, status: 'draft' }, req, context: {}, collection: aiPromptsCollection, operation: 'update', data: next } as never)
    expect((await payload.findByID({ collection: 'ai-prompts' as never, id: (old as any).id })).status).toBe('archived')
    expect((await payload.findByID({ collection: 'ai-prompts' as never, id: (other as any).id })).status).toBe('active')
    expect(services.log.audit).toEqual([expect.objectContaining({ action: 'prompt.activate' })])
  })

  it('auto-increments version on create', async () => {
    const payload = createFakePayload()
    await payload.create({ collection: 'ai-prompts' as never, data: { slug: 's', locale: '*', version: 2 } as never })
    const hook = aiPromptsCollection.hooks!.beforeChange![0]
    const req = { payload } as unknown as PayloadRequest
    const data = await hook({ data: { slug: 's' }, operation: 'create', req, context: {}, collection: aiPromptsCollection } as never)
    expect(data).toMatchObject({ version: 3, locale: '*' })
  })
})
