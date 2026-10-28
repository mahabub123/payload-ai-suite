import type { Payload } from 'payload'
import type { AIContext, AuditService, BudgetService, Settings, UsageService } from '../contracts'
import { AIError } from '../contracts'
import type { UsageListener } from '../usage'

export interface BudgetServiceDeps {
  usage: UsageService & { onRecord?: (l: UsageListener) => () => void }
  audit?: AuditService
  /** Settings resolver (createSettingsLoader().load). */
  settings: (payload: Payload, tenant?: string | number) => Promise<Settings>
  /** How long a spend total is trusted before re-reading ai-usage-daily. Default 60s. */
  cacheTtlMs?: number
  now?: () => Date
}

export const BUDGET_WARN_RATIO = 0.8

type Ctx = Pick<AIContext, 'payload' | 'tenant' | 'module'>

interface Check {
  scope: 'tenant' | 'module'
  limitMicros: number
  spentMicros: number
  ratio: number
}

/**
 * perModule values in (0, 1] are shares of the monthly budget; values > 1 are absolute micro-USD limits.
 */
export const moduleLimit = (monthly: number | undefined, perModule: number | undefined): number | undefined => {
  if (perModule == null || perModule <= 0) return undefined
  if (perModule <= 1) return monthly ? Math.round(monthly * perModule) : undefined
  return Math.round(perModule)
}

/** Monthly budgets per tenant and per module: warn once at 80% (audit + logger), block at 100%. */
export const createBudgetService = (deps: BudgetServiceDeps): BudgetService & { invalidate(): void } => {
  const ttl = deps.cacheTtlMs ?? 60_000
  const now = deps.now ?? (() => new Date())
  const cache = new Map<string, { spent: number; at: number }>()
  const alerted = new Set<string>()
  const month = () => now().toISOString().slice(0, 7)
  const key = (tenant: string | number | undefined, module?: string) => `${month()}|${tenant ?? ''}|${module ?? '*'}`

  deps.usage.onRecord?.((input, scope) => {
    if (!input.costMicros) return
    for (const k of [key(scope.tenant), key(scope.tenant, input.module)]) {
      const hit = cache.get(k)
      if (hit) hit.spent += input.costMicros
    }
  })

  const spent = async (payload: Payload, tenant: string | number | undefined, module?: string) => {
    const k = key(tenant, module)
    const hit = cache.get(k)
    const t = now().getTime()
    if (hit && t - hit.at < ttl) return hit.spent
    const value = await deps.usage.monthToDate({ tenant, module }, payload)
    cache.set(k, { spent: value, at: t })
    return value
  }

  const checks = async (ctx: Ctx): Promise<Check[]> => {
    const settings = await deps.settings(ctx.payload, ctx.tenant)
    const monthly = settings.budgets?.monthlyMicros
    const out: Check[] = []
    if (monthly && monthly > 0) {
      const s = await spent(ctx.payload, ctx.tenant)
      out.push({ scope: 'tenant', limitMicros: monthly, spentMicros: s, ratio: s / monthly })
    }
    const mod = moduleLimit(monthly, settings.budgets?.perModule?.[ctx.module])
    if (mod) {
      const s = await spent(ctx.payload, ctx.tenant, ctx.module)
      out.push({ scope: 'module', limitMicros: mod, spentMicros: s, ratio: s / mod })
    }
    return out
  }

  const alertOnce = async (ctx: Ctx, c: Check, level: 80 | 100) => {
    const k = `${month()}|${ctx.tenant ?? ''}|${c.scope}|${c.scope === 'module' ? ctx.module : '*'}|${level}`
    if (alerted.has(k)) return
    alerted.add(k)
    const msg = `[ai-suite] AI budget ${level === 100 ? 'exhausted' : 'at 80%'} (${c.scope}${c.scope === 'module' ? ` ${ctx.module}` : ''}, tenant ${ctx.tenant ?? 'global'}): ${c.spentMicros}/${c.limitMicros} micro-USD`
    ctx.payload.logger?.warn(msg)
    try {
      await deps.audit?.log(
        {
          action: level === 100 ? 'budget.exceeded' : 'budget.warning',
          meta: { scope: c.scope, module: ctx.module, limitMicros: c.limitMicros, spentMicros: c.spentMicros, ratio: c.ratio },
        },
        { payload: ctx.payload, tenant: ctx.tenant, requestId: `budget-${month()}`, actor: { kind: 'system', roles: [] } },
      )
    } catch {
      /* alerting never blocks a call */
    }
  }

  return {
    async assert(ctx) {
      for (const c of await checks(ctx)) {
        if (c.ratio >= 1) {
          await alertOnce(ctx, c, 100)
          throw new AIError('budget_exceeded', c.scope === 'module' ? `AI budget for module "${ctx.module}" is used up for this month` : 'AI budget is used up for this month', {
            details: { scope: c.scope, limitMicros: c.limitMicros, spentMicros: c.spentMicros },
          })
        }
        if (c.ratio >= BUDGET_WARN_RATIO) await alertOnce(ctx, c, 80)
      }
    },
    async status(ctx) {
      const all = await checks(ctx)
      if (!all.length) return { limitMicros: null, spentMicros: await spent(ctx.payload, ctx.tenant), ratio: 0 }
      const worst = all.reduce((a, b) => (b.ratio > a.ratio ? b : a))
      return { limitMicros: worst.limitMicros, spentMicros: worst.spentMicros, ratio: worst.ratio }
    },
    invalidate: () => cache.clear(),
  }
}
