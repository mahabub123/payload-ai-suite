import { describe, expect, it } from 'vitest'
import { AIError } from '../contracts'
import type { Settings } from '../contracts'
import { createAuditService } from '../audit'
import { mergeSettings } from '../settings'
import { createUsageService } from '../usage'
import { createFakePayload } from '../usage/fake-payload'
import { createBudgetService, moduleLimit } from './index'

const actor = { kind: 'system' as const, roles: [] }

const setup = (budgets: Settings['budgets']) => {
  const payload = createFakePayload()
  const usage = createUsageService()
  const audit = createAuditService()
  const settings = async () => ({ ...mergeSettings({}), budgets })
  const budgetsSvc = createBudgetService({ usage, audit, settings })
  const spend = (module: string, costMicros: number, tenant?: string) =>
    usage.record({ module, task: 'chat', model: 'p:m', inputTokens: 1, outputTokens: 1, costMicros, latencyMs: 1, outcome: 'ok' }, { payload, tenant, requestId: 'r', actor })
  return { payload, usage, budgets: budgetsSvc, spend }
}

describe('budgets', () => {
  it('no budget -> never blocks', async () => {
    const { payload, budgets, spend } = setup({})
    await spend('assistant', 10_000_000)
    await expect(budgets.assert({ payload, module: 'assistant' })).resolves.toBeUndefined()
    expect((await budgets.status({ payload, module: 'assistant' })).limitMicros).toBeNull()
  })

  it('warns once at 80% (audit + logger) and blocks at 100%', async () => {
    const { payload, budgets, spend } = setup({ monthlyMicros: 1_000_000 })
    await spend('assistant', 790_000)
    await budgets.assert({ payload, module: 'assistant' })
    expect(payload.store.get('ai-audit') ?? []).toHaveLength(0)

    await spend('assistant', 20_000) // 81%
    await budgets.assert({ payload, module: 'assistant' })
    await budgets.assert({ payload, module: 'search' })
    const audits = payload.store.get('ai-audit')!
    expect(audits.filter((a) => a.action === 'budget.warning')).toHaveLength(1)
    expect(payload.logs.some((l) => l.level === 'warn' && String(l.args[0]).includes('80%'))).toBe(true)

    await spend('search', 190_000) // 100%
    const err = await budgets.assert({ payload, module: 'assistant' }).catch((e) => e)
    expect(err).toBeInstanceOf(AIError)
    expect(err.code).toBe('budget_exceeded')
    expect((await budgets.status({ payload, module: 'assistant' })).ratio).toBeGreaterThanOrEqual(1)
  })

  it('applies per-module shares and isolates tenants', async () => {
    const { payload, budgets, spend } = setup({ monthlyMicros: 1_000_000, perModule: { search: 0.1 } })
    await spend('search', 100_000, 't1')
    await expect(budgets.assert({ payload, module: 'search', tenant: 't1' })).rejects.toMatchObject({ code: 'budget_exceeded' })
    await expect(budgets.assert({ payload, module: 'assistant', tenant: 't1' })).resolves.toBeUndefined()
    await expect(budgets.assert({ payload, module: 'search', tenant: 't2' })).resolves.toBeUndefined()
  })

  it('perModule > 1 is an absolute limit', () => {
    expect(moduleLimit(1_000_000, 0.25)).toBe(250_000)
    expect(moduleLimit(undefined, 0.25)).toBeUndefined()
    expect(moduleLimit(undefined, 5_000_000)).toBe(5_000_000)
  })

  it('usage service keeps daily rollups and summaries', async () => {
    const { payload, usage, spend } = setup({})
    await spend('content', 100)
    await spend('content', 50)
    await spend('search', 7)
    const daily = payload.store.get('ai-usage-daily')!
    expect(daily).toHaveLength(2)
    expect(await usage.monthToDate({}, payload)).toBe(157)
    expect(await usage.monthToDate({ module: 'content' }, payload)).toBe(150)
    const s = await usage.summary({ from: new Date(Date.now() - 86_400_000), to: new Date() }, payload)
    expect(s[0]).toMatchObject({ module: 'content', calls: 2, costMicros: 150 })
    expect(payload.store.get('ai-usage')).toHaveLength(3)
  })
})
