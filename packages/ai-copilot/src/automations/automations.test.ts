import { describe, expect, it } from 'vitest'
import type { Config } from 'payload'
import { setAI, SUITE_KEY } from 'payload-ai-core'
import type { SuiteRole } from 'payload-ai-core'
import { aiCopilot, COPILOT_PROVIDER_PATH } from '../plugin'
import { setup, staffActor } from '../test/helpers'
import { invalidateAutomationCache } from './cache'
import { automationAfterChange } from './hooks'
import { decideRun, executeRun } from './runner'
import { reviewAlertAutomation } from './seed'
import type { AutomationDefinition } from './types'

const withApproval = (a: AutomationDefinition, role: SuiteRole): AutomationDefinition => ({
  ...a,
  approval: { required: true, role },
  action: { ...a.action, channel: 'email', emailTo: ['owner@x.test'] },
})

const trigger = async (s: ReturnType<typeof setup>, doc: Record<string, unknown>) => {
  setAI(s.fake.payload, s.services)
  invalidateAutomationCache()
  const hook = automationAfterChange('reviews')
  await hook({ doc, operation: 'create', req: { payload: s.fake.payload, context: {} } } as any)
}

describe('automations', () => {
  it('collection hook queues a run for matching enabled automations', async () => {
    const s = setup()
    s.fake.seed('ai-automations', [{ id: 'a1', ...reviewAlertAutomation('reviews') }, { id: 'a2', ...reviewAlertAutomation('orders') }])
    await trigger(s, { id: 'r1', rating: 1, body: 'awful' })
    expect(s.fake.calls.queue).toHaveLength(1)
    const run = [...s.fake.store.get('ai-automation-runs')!.values()][0]
    expect(run).toMatchObject({ automation: 'a1', status: 'queued', triggerDocId: 'r1' })
  })

  it('skips writes flagged as the copilot’s own', async () => {
    const s = setup()
    s.fake.seed('ai-automations', [{ id: 'a1', ...reviewAlertAutomation('reviews') }])
    setAI(s.fake.payload, s.services)
    invalidateAutomationCache()
    await automationAfterChange('reviews')({ doc: { id: 'r1' }, operation: 'create', req: { payload: s.fake.payload, context: { aiCopilotWrite: true } } } as any)
    expect(s.fake.calls.queue).toHaveLength(0)
  })

  it('pauses for approval; action only after an approver with the right role approves', async () => {
    const s = setup()
    s.fake.seed('ai-automations', [{ id: 'a1', ...withApproval(reviewAlertAutomation('reviews'), 'support') }])
    await trigger(s, { id: 'r1', rating: 1, body: 'broken on arrival' })
    const runId = [...s.fake.store.get('ai-automation-runs')!.keys()][0]
    s.services.provider.enqueue('Item arrived broken.', 'Negative.')

    const paused = await executeRun(s.fake.payload, runId, { services: s.services })
    expect(paused.status).toBe('awaiting-approval')
    expect(paused.outputs).toEqual({ summary: 'Item arrived broken.', sentiment: 'negative' })
    expect(s.fake.calls.email).toHaveLength(0)

    // Re-running the job does not redo steps or act.
    await executeRun(s.fake.payload, runId, { services: s.services })
    expect(s.fake.calls.email).toHaveLength(0)

    const contentCtx = { ...s.ctx, actor: staffActor(['content'], 'u2') }
    await expect(decideRun(s.services, contentCtx, runId, 'approve')).rejects.toMatchObject({ code: 'forbidden' })
    expect(s.fake.calls.email).toHaveLength(0)

    const supportCtx = { ...s.ctx, actor: staffActor(['support'], 'u3') }
    const done = await decideRun(s.services, supportCtx, runId, 'approve')
    expect(done.status).toBe('done')
    expect(s.fake.calls.email).toHaveLength(1)
    expect(s.fake.calls.email[0]).toMatchObject({ to: 'owner@x.test', subject: 'Negative review received' })

    await decideRun(s.services, supportCtx, runId, 'approve')
    expect(s.fake.calls.email).toHaveLength(1)
  })

  it('rejected runs never act', async () => {
    const s = setup()
    s.fake.seed('ai-automations', [{ id: 'a1', ...withApproval(reviewAlertAutomation('reviews'), 'support') }])
    await trigger(s, { id: 'r1' })
    const runId = [...s.fake.store.get('ai-automation-runs')!.keys()][0]
    s.services.provider.enqueue('ok', 'negative')
    await executeRun(s.fake.payload, runId, { services: s.services })
    const r = await decideRun(s.services, { ...s.ctx, actor: staffActor(['store-admin']) }, runId, 'reject')
    expect(r.status).toBe('rejected')
    await expect(decideRun(s.services, { ...s.ctx, actor: staffActor(['store-admin']) }, runId, 'approve')).rejects.toMatchObject({ code: 'conflict' })
    expect(s.fake.calls.email).toHaveLength(0)
  })

  it('seed automation skips the alert for positive reviews', async () => {
    const s = setup()
    s.fake.seed('ai-automations', [{ id: 'a1', ...reviewAlertAutomation('reviews', ['owner@x.test']) }])
    await trigger(s, { id: 'r1' })
    const runId = [...s.fake.store.get('ai-automation-runs')!.keys()][0]
    s.services.provider.enqueue('Loved it.', 'positive')
    const run: any = await executeRun(s.fake.payload, runId, { services: s.services })
    expect(run.status).toBe('done')
    expect(run.actionResult).toMatchObject({ skipped: true })
    expect(s.fake.calls.email).toHaveLength(0)
  })
})

describe('plugin config', () => {
  const existing = () => undefined
  const base = (): Config =>
    ({
      secret: 'x',
      db: {} as never,
      collections: [
        { slug: 'posts', fields: [{ name: 'title', type: 'text' }], hooks: { afterChange: [existing], afterDelete: [existing] } },
        { slug: 'users', auth: true, fields: [] },
      ],
      admin: { components: { providers: ['./MyProvider#MyProvider'] } },
      custom: { [SUITE_KEY]: { coreInstalled: true, modules: [], options: {} } },
    }) as unknown as Config

  it('preserves existing hooks and providers and only hooks allow-listed collections', () => {
    const cfg = aiCopilot()(base()) as Config
    const posts = cfg.collections!.find((c) => c.slug === 'posts')!
    expect(posts.hooks!.afterChange).toHaveLength(2)
    expect(posts.hooks!.afterChange![0]).toBe(existing)
    expect(posts.hooks!.afterDelete![0]).toBe(existing)
    expect(cfg.collections!.find((c) => c.slug === 'users')!.hooks).toBeUndefined()
    expect(cfg.admin!.components!.providers).toEqual(['./MyProvider#MyProvider', COPILOT_PROVIDER_PATH])
    expect(cfg.collections!.map((c) => c.slug)).toEqual(expect.arrayContaining(['ai-automations', 'ai-automation-runs', 'ai-copilot-changesets']))
    const tasks = cfg.jobs!.tasks!.map((t) => t.slug)
    expect(tasks).toEqual(['ai-copilot-automation-run', 'ai-copilot-automation-dispatch'])
    const paths = cfg.endpoints!.map((e) => e.path)
    expect(paths).toEqual(
      expect.arrayContaining(['/ai/copilot/chat', '/ai/copilot/changesets/:id/apply', '/ai/copilot/changesets/:id/discard', '/ai/automations/runs/:id/approve'])
    )
  })

  it('automations: false adds no hooks, run collections or jobs', () => {
    const cfg = aiCopilot({ automations: false })(base()) as Config
    expect(cfg.collections!.find((c) => c.slug === 'posts')!.hooks!.afterChange).toHaveLength(1)
    expect(cfg.collections!.some((c) => c.slug === 'ai-automations')).toBe(false)
    expect(cfg.jobs!.tasks).toEqual([])
  })
})
