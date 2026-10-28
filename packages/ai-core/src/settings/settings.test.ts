import { describe, expect, it } from 'vitest'
import { createFakePayload } from '../usage/fake-payload'
import { createSettingsLoader, invalidateAllSettings, mergeSettings } from './index'

describe('settings loader', () => {
  it('merges the global over plugin options and defaults', () => {
    const s = mergeSettings(
      {
        enabledModules: ['search'],
        brandVoice: 'Warm, short',
        allowedDomains: ['shop.example'],
        limits: { visitorPerMinute: 5 },
        budgets: { monthlyMicros: 50_000_000, perModule: [{ module: 'assistant', share: 0.5 }, { module: 'search', limitMicros: 1_000_000 }] },
        routes: [{ task: 'chat', models: ['openai:gpt-4o-mini'], timeoutMs: 10_000 }, { task: 'bogus', models: ['x:y'] }],
      },
      { options: { allowedDomains: ['cdn.example'], budgets: { monthlyMicros: 1 }, retention: { usageDays: 30 } } },
    )
    expect(s.enabledModules).toEqual(['search'])
    expect(s.allowedDomains).toEqual(['cdn.example', 'shop.example'])
    expect(s.limits).toMatchObject({ visitorPerMinute: 5, visitorPerDay: 200 })
    expect(s.retention.usageDays).toBe(30)
    expect(s.budgets).toEqual({ monthlyMicros: 50_000_000, perModule: { assistant: 0.5, search: 1_000_000 } })
    expect(s.routes).toEqual({ chat: { models: ['openai:gpt-4o-mini'], timeoutMs: 10_000 } })
    expect(mergeSettings(null, { knownModules: ['content'] }).enabledModules).toEqual(['content'])
  })

  it('caches per payload and invalidates on global change', async () => {
    const payload = createFakePayload({ 'ai-settings': { enabledModules: ['content'] } })
    const loader = createSettingsLoader()
    expect(await loader.isModuleEnabled('content', payload)).toBe(true)
    expect(await loader.isModuleEnabled('search', payload)).toBe(false)
    expect(await loader.isModuleEnabled('core', payload)).toBe(true)
    payload.globals['ai-settings'] = { enabledModules: ['search'] }
    expect(await loader.isModuleEnabled('search', payload)).toBe(false)
    invalidateAllSettings()
    expect(await loader.isModuleEnabled('search', payload)).toBe(true)
    expect(await createSettingsLoader({ options: { disabled: true } }).isModuleEnabled('core', payload)).toBe(false)
  })
})
