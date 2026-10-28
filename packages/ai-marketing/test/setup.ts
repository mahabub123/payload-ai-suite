import { createHmac } from 'node:crypto'
import { setAI } from 'payload-ai-core'
import type { AIContext } from 'payload-ai-core'
import { createFakeServices, createTestContext, type FakeServices } from 'payload-ai-core/testing'
import { marketingCollections } from '../src/collections'
import { resolveOptions, type AiMarketingOptions } from '../src/options'
import { marketingPrompts } from '../src/prompts'
import { createFakeAdapters, sampleData, type FakeData } from './fakeAdapters'
import { createFakePayload, type FakePayload } from './fakePayload'

export const setup = (opts: AiMarketingOptions = {}, data: FakeData = sampleData()) => {
  const adapters = createFakeAdapters(data)
  const services: FakeServices = createFakeServices({ adapters })
  // The fake hashId only looks at the first bytes; use a real HMAC so keys and signatures are distinct.
  services.crypto = { ...services.crypto, hashId: (s) => createHmac('sha256', 'test-secret').update(s).digest('hex') }
  for (const p of marketingPrompts) services.prompts.registerDefault(p, 'marketing')
  const options = resolveOptions(opts)
  const payload: FakePayload = createFakePayload(marketingCollections(options), ['ai-recs'])
  setAI(payload, services)
  const staff = (id: string, roles: AIContext['actor']['roles'] = ['marketing-approver']): AIContext =>
    createTestContext({
      payload,
      module: 'marketing',
      surface: 'admin',
      adapters,
      actor: { kind: 'staff', roles, user: { id, collection: 'users' } as never },
    })
  const req = (userId: string, routeParams: Record<string, unknown> = {}) =>
    ({ payload, user: { id: userId, collection: 'users' }, routeParams, searchParams: new URLSearchParams() }) as never
  return { data, adapters, services, options, payload, staff, req }
}
