import { describe, expect, it } from 'vitest'
import type { Config } from 'payload'
import { aiInsights, INSIGHTS_PANEL_PATH, INSIGHTS_VIEW_PATH } from './plugin'
import { REPORTS } from './collections'
import { ANOMALY_TASK } from './jobs/anomalies'
import { BRIEFING_TASK } from './jobs/briefing'

const base = (): Config =>
  ({
    collections: [{ slug: 'orders', fields: [] }],
    admin: { user: 'staff', components: { afterDashboard: ['./Existing#Panel'], views: { other: { Component: './X#Y', path: '/x' } } } },
    jobs: { tasks: [{ slug: 'existing', handler: async () => ({ output: {} }) }] },
    custom: { aiSuite: { coreInstalled: true, modules: [], options: {} } },
  }) as unknown as Config

describe('aiInsights plugin', () => {
  it('adds its collection, endpoint, tasks with schedules and admin UI while preserving existing config', () => {
    const c = aiInsights({ briefings: { daily: '0 0 8 * * *', weekly: false, emailTo: ['a@b.c'] } })(base()) as Config
    expect(c.collections!.map((x) => x.slug)).toEqual(['orders', REPORTS])
    const reports = c.collections!.find((x) => x.slug === REPORTS)!
    expect(reports.fields.find((f: any) => f.name === 'createdBy')).toMatchObject({ relationTo: 'staff' })
    expect(c.endpoints!.map((e) => e.path)).toContain('/ai/insights/ask')
    const tasks = c.jobs!.tasks!
    expect(tasks.map((t) => t.slug)).toEqual(['existing', BRIEFING_TASK, ANOMALY_TASK])
    expect(tasks[1].schedule!.map((s) => s.cron)).toEqual(['0 0 8 * * *'])
    expect(tasks[1].retries).toBeGreaterThan(0)
    expect(tasks[2].schedule!.map((s) => s.cron)).toEqual(['0 0 6 * * *'])
    expect(c.admin!.components!.afterDashboard).toEqual(['./Existing#Panel', INSIGHTS_PANEL_PATH])
    expect(c.admin!.components!.views!.other).toBeDefined()
    expect(c.admin!.components!.views!.aiInsights).toMatchObject({ Component: INSIGHTS_VIEW_PATH, path: '/ai-insights' })
  })

  it('passes the briefing kind through the schedule hook', async () => {
    const c = aiInsights({ briefings: { daily: '0 0 7 * * *', weekly: '0 0 7 * * 1' } })(base()) as Config
    const sched = c.jobs!.tasks!.find((t) => t.slug === BRIEFING_TASK)!.schedule!
    const inputs = await Promise.all(sched.map((s) => s.hooks!.beforeSchedule!({} as any)))
    expect(inputs.map((i) => (i.input as any).kind)).toEqual(['daily', 'weekly'])
  })

  it('can skip admin UI and rejects unknown anomaly metrics', () => {
    const c = aiInsights({ adminUI: false })(base()) as Config
    expect(c.admin!.components!.views!.aiInsights).toBeUndefined()
    expect(() => aiInsights({ anomalies: { metrics: ['bogus'] } })(base())).toThrow(/Unknown anomaly metrics/)
  })

  it('requires ai-core first', () => {
    expect(() => aiInsights()({ collections: [] } as unknown as Config)).toThrow(/aiCore/)
  })
})
