import type { CollectionConfig, PayloadRequest } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createCrypto } from '../crypto'
import { coreAdminCollections } from './index'
import { aiSettingsGlobal } from './settings'

const SECRET = 'test-secret-'.repeat(4)
let prev: string | undefined
beforeAll(() => {
  prev = process.env.PAYLOAD_SECRET
  process.env.PAYLOAD_SECRET = SECRET
})
afterAll(() => {
  process.env.PAYLOAD_SECRET = prev
})

const req = (context: Record<string, unknown> = {}) => ({ context, payload: { config: { custom: {} }, logger: console } }) as unknown as PayloadRequest
const hook = (c: CollectionConfig, name: 'beforeChange' | 'afterRead') => c.hooks![name]![0] as (args: Record<string, unknown>) => Record<string, unknown>

describe('core-A admin collections', () => {
  const cols = coreAdminCollections({ providers: [], routes: {}, allowTenantKeys: true, tenant: { field: 'tenant' } })
  const bySlug = Object.fromEntries(cols.map((c) => [c.slug, c]))

  it('registers the expected collections in the AI Suite group with tenant fields', () => {
    expect(Object.keys(bySlug).sort()).toEqual(['ai-audit', 'ai-models', 'ai-providers', 'ai-routes', 'ai-usage', 'ai-usage-daily'])
    for (const c of cols) expect(c.admin?.group).toBe('AI Suite')
    expect(bySlug['ai-providers'].fields.some((f) => 'name' in f && f.name === 'tenant')).toBe(true)
    expect(bySlug['ai-models'].fields.some((f) => 'name' in f && f.name === 'tenant')).toBe(false)
  })

  it('encrypts the write-only key and never returns it', () => {
    const c = bySlug['ai-providers']
    const data = hook(c, 'beforeChange')({ data: { name: 'x', apiKey: ' sk-123 ', encryptedKey: 'forged' }, req: req(), operation: 'create' })
    expect(data.apiKey).toBeUndefined()
    expect(data.keySet).toBe(true)
    expect(data.encryptedKey).not.toBe('forged')
    expect(createCrypto({ secret: SECRET }).decrypt(data.encryptedKey as string)).toBe('sk-123')

    const out = hook(c, 'afterRead')({ doc: { ...data, id: 1 }, req: req() })
    expect(out.encryptedKey).toBeUndefined()
    const internal = hook(c, 'afterRead')({ doc: { ...data, id: 1 }, req: req({ aiInternal: true }) })
    expect(internal.encryptedKey).toBe(data.encryptedKey)
  })

  it('refuses DB keys when allowTenantKeys is off', () => {
    const c = coreAdminCollections({ providers: [], routes: {} }).find((x) => x.slug === 'ai-providers')!
    expect(() => hook(c, 'beforeChange')({ data: { apiKey: 'sk' }, req: req(), operation: 'create' })).toThrow(/allowTenantKeys/)
  })

  it('makes usage and audit append-only through access', async () => {
    for (const slug of ['ai-usage', 'ai-usage-daily', 'ai-audit']) {
      const a = bySlug[slug].access!
      for (const op of ['create', 'update', 'delete'] as const) expect(await (a[op] as () => boolean)()).toBe(false)
    }
    expect(() => hook(bySlug['ai-audit'], 'beforeChange')({ operation: 'update', originalDoc: { id: 1 }, data: {} })).toThrow(/append-only/)
  })

  it('builds the ai-settings global with the usage dashboard tab', () => {
    const g = aiSettingsGlobal({ knownModules: ['content'] })
    expect(g.slug).toBe('ai-settings')
    expect(JSON.stringify(g.fields)).toContain('@payload-ai-suite/ai-core/client#UsageDashboard')
  })
})
