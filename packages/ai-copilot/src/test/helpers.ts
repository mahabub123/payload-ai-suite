import { createFakeServices, createToolContext } from '@payload-ai-suite/ai-core/testing'
import type { Actor, Surface } from '@payload-ai-suite/ai-core'
import type { ResolvedCopilotOptions } from '../options'
import { createFakePayload } from './fakePayload'

export const testOptions = (o: Partial<ResolvedCopilotOptions> = {}): ResolvedCopilotOptions => ({
  automations: true,
  collections: ['posts', 'reviews'],
  maxBulkItems: 200,
  defaultApprovalRole: 'store-admin',
  adminPanel: true,
  ...o,
})

export const staffActor = (roles: Actor['roles'] = ['store-admin'], id = 'u1'): Actor => ({
  kind: 'staff',
  roles,
  user: { id, collection: 'users', email: `${id}@x.test` } as unknown as Actor['user'],
})

export const setup = (o: { drafts?: string[]; actor?: Actor; surface?: Surface } = {}) => {
  const fake = createFakePayload({ drafts: o.drafts, fields: { posts: ['title', 'category', 'body', 'tags', '_status'] } })
  const services = createFakeServices()
  const ctx = createToolContext(services, {
    payload: fake.payload,
    module: 'copilot',
    surface: o.surface ?? 'admin',
    actor: o.actor ?? staffActor(),
  })
  return { fake, services, ctx }
}
