import { describe, expect, it } from 'vitest'
import { createFakeServices, createTestContext, createToolContext } from '@payload-ai-suite/ai-core/testing'
import type { AdapterContext, Order } from '@payload-ai-suite/ai-core'
import { adapters, fakePayload, order } from '../test/helpers'
import { REPORTS } from '../collections'
import { resolveInsightsOptions } from '../options'
import { buildMetricTools } from '../metrics/tools'
import { aiImpactMetric } from '../metrics/compute'
import { resolvePeriod } from '../period'
import { runBriefing } from './briefing'
import { runAnomalies } from './anomalies'

const now = new Date('2026-10-29T08:00:00Z')
const opts = resolveInsightsOptions({ briefings: { emailTo: ['boss@shop.test'] }, anomalies: { metrics: ['revenue', 'orders'], sensitivity: 3 } })

const tenantOrder = (id: string, at: string, amount: number, tenant: string): Order => ({ ...order(id, at, amount), tenant } as Order)

describe('tenant scoping', () => {
  it('metric tools pass the caller adapter context (with tenant) to adapters', async () => {
    const seen: AdapterContext[] = []
    const services = createFakeServices({ adapters: adapters([tenantOrder('1', '2026-10-02T00:00:00Z', 500, 't1'), tenantOrder('2', '2026-10-02T00:00:00Z', 9_999, 't2')], [], seen) })
    const ctx = createToolContext(services, { actor: { kind: 'staff', roles: ['manager'] }, surface: 'admin', tenant: 't1' })
    const revenue = buildMetricTools(opts).find((t) => t.name === 'revenue')!
    const r = await revenue.run({ period: { from: '2026-10-01', to: '2026-10-07' }, groupBy: 'day' }, ctx)
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((c) => c.tenant === 't1' && !c.system)).toBe(true)
    expect((r.data as any).byCurrency[0].totalMinor).toBe(500)
  })

  it('suite collection reads are filtered by the tenant field', async () => {
    const fp = fakePayload({
      tenantField: 'tenant',
      data: {
        'ai-usage': [
          { id: 'a', module: 'assistant', costMicros: 1_000, tenant: 't1', createdAt: '2026-10-02T00:00:00Z' },
          { id: 'b', module: 'assistant', costMicros: 5_000, tenant: 't2', createdAt: '2026-10-02T00:00:00Z' },
        ],
      },
    })
    const ctx = createTestContext({ payload: fp.payload, tenant: 't1' })
    const r = await aiImpactMetric(ctx, resolvePeriod({ from: '2026-10-01', to: '2026-10-07' }))
    expect((r.data as any).cost.totalMicros).toBe(1_000)
    expect(JSON.stringify(fp.finds[0].where)).toContain('"tenant":{"equals":"t1"}')
    expect((r.data as any).assistant).toEqual({ unavailable: true })
  })

  it('jobs run once per tenant with a tenant-scoped system context', async () => {
    const seen: AdapterContext[] = []
    const fp = fakePayload({ tenantField: 'tenant', collections: [REPORTS], data: { tenants: [{ id: 't1' }, { id: 't2' }] } })
    const services = createFakeServices({ adapters: adapters([tenantOrder('1', '2026-10-28T10:00:00Z', 700, 't1')], [], seen) })
    const r = await runBriefing(fp.payload, services, 'daily', opts, now)
    expect(r.map((x) => x.tenant)).toEqual(['t1', 't2'])
    expect(new Set(seen.map((c) => c.tenant))).toEqual(new Set(['t1', 't2']))
    expect(fp.store[REPORTS].map((d) => d.tenant)).toEqual(['t1', 't2'])
  })
})

describe('briefing job', () => {
  it('writes a computed report vs the previous period, emails recipients, and is idempotent', async () => {
    const fp = fakePayload({ collections: [REPORTS] })
    const services = createFakeServices({
      adapters: adapters([order('1', '2026-10-27T10:00:00Z', 10_000), order('2', '2026-10-28T10:00:00Z', 15_000), order('3', '2026-10-28T12:00:00Z', 5_000)]),
    })
    const first = await runBriefing(fp.payload, services, 'daily', opts, now)
    expect(first[0]).toMatchObject({ skipped: false, emailed: true })
    const report = fp.store[REPORTS][0]
    expect(report).toMatchObject({ kind: 'briefing', verification: 'computed' })
    expect(report.answer).toContain('2 orders (previous 1)')
    expect(report.answer).toContain('+100%')
    expect(fp.emails).toHaveLength(1)
    expect(fp.emails[0].to).toBe('boss@shop.test')
    const again = await runBriefing(fp.payload, services, 'daily', opts, now)
    expect(again[0].skipped).toBe(true)
    expect(fp.store[REPORTS]).toHaveLength(1)
    expect(fp.emails).toHaveLength(1)
  })
})

describe('anomaly job', () => {
  const steady = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 9, 28) - (28 - i) * 86_400_000).toISOString().slice(0, 10)
    return [order(`a${i}`, `${d}T10:00:00Z`, 10_000 + (i % 3) * 100), order(`b${i}`, `${d}T15:00:00Z`, 10_000)]
  }).flat()

  it('flags a value outside the normal band and creates an anomaly report + email', async () => {
    const spike = Array.from({ length: 12 }, (_, i) => order(`s${i}`, '2026-10-28T11:00:00Z', 10_000))
    const fp = fakePayload({ collections: [REPORTS] })
    const services = createFakeServices({ adapters: adapters([...steady, ...spike]) })
    const r = await runAnomalies(fp.payload, services, opts, now)
    expect(r[0].flagged).toBeGreaterThan(0)
    const report = fp.store[REPORTS][0]
    expect(report.kind).toBe('anomaly')
    expect(report.flagged.map((f: any) => f.metric)).toEqual(expect.arrayContaining(['revenue', 'orders']))
    expect(report.answer).toMatch(/unusually high/)
    expect(fp.emails).toHaveLength(1)
  })

  it('stays quiet when yesterday is within the band', async () => {
    const normal = [order('y1', '2026-10-28T10:00:00Z', 10_100), order('y2', '2026-10-28T15:00:00Z', 10_000)]
    const fp = fakePayload({ collections: [REPORTS] })
    const services = createFakeServices({ adapters: adapters([...steady, ...normal]) })
    const r = await runAnomalies(fp.payload, services, opts, now)
    expect(r[0].flagged).toBe(0)
    expect(fp.store[REPORTS]).toHaveLength(0)
    expect(fp.emails).toHaveLength(0)
  })
})
