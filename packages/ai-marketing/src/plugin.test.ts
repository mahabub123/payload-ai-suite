import { describe, expect, it } from 'vitest'
import type { Config } from 'payload'
import { SUITE_KEY } from 'payload-ai-core'
import { aiMarketing } from './index'

const base = (): Config =>
  ({
    collections: [{ slug: 'users', fields: [] }],
    custom: { [SUITE_KEY]: { coreInstalled: true, modules: [], options: {} } },
  }) as unknown as Config

describe('aiMarketing plugin', () => {
  it('requires ai-core', () => {
    expect(() => aiMarketing()({ collections: [] } as unknown as Config)).toThrow(/aiCore/)
  })

  it('adds its own collections, endpoints and tasks only', async () => {
    const cfg = (await aiMarketing({ approvalRole: 'manager' })(base())) as Config
    expect(cfg.collections!.map((c) => c.slug)).toEqual(['users', 'ai-segments', 'ai-campaigns', 'ai-email-drafts', 'ai-unsubscribes'])
    expect(cfg.jobs!.tasks!.map((t) => t.slug)).toEqual(['ai-marketing-send', 'ai-marketing-segment-refresh', 'ai-marketing-sequences'])
    const paths = cfg.endpoints!.map((e) => `${e.method} ${e.path}`)
    expect(paths).toContain('post /ai/marketing/campaigns/:id/approve')
    expect(paths).toContain('get /ai/marketing/unsubscribe')
    const campaigns = cfg.collections!.find((c) => c.slug === 'ai-campaigns')!
    expect(campaigns.admin!.components!.edit!.beforeDocumentControls).toEqual(['payload-ai-marketing/client#CampaignApproval'])
    const drafts = cfg.collections!.find((c) => c.slug === 'ai-email-drafts')!
    expect(drafts.fields.find((f) => 'name' in f && f.name === 'idempotencyKey')).toMatchObject({ unique: true })
    const mod = (cfg.custom as Record<string, any>)[SUITE_KEY].modules[0]
    expect(mod.endpoints.find((e: { path: string }) => e.path.endsWith('/approve')).access).toEqual(['manager', 'store-admin'])
  })
})
