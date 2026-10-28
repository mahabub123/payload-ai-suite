import type { AIContext, AITool, ConceptName, CoreServices, ToolContext, ToolRegistry, ToolTier } from '../contracts'
import { TIER_ORDER } from '../contracts'
import { isStaffRoles } from '../access/roles'

const isStaffActor = (ctx: Pick<AIContext, 'actor'>) =>
  ctx.actor.kind === 'system' || (ctx.actor.kind === 'staff' && isStaffRoles(ctx.actor.roles))

/**
 * Highest tier the actor may see on this surface (tiers are enforced in code, never by prompt):
 * staff on admin/job surfaces -> 'staff'; everyone else (shoppers, visitors, channel users, and staff
 * browsing the storefront) -> 'confirm'.
 */
export const maxTierFor = (ctx: Pick<AIContext, 'actor' | 'surface'>): ToolTier =>
  isStaffActor(ctx) && ctx.surface !== 'storefront' && ctx.surface !== 'channel' ? 'staff' : 'confirm'

export const tierAllowed = (tier: ToolTier, ctx: Pick<AIContext, 'actor' | 'surface'>): boolean =>
  TIER_ORDER[tier] <= TIER_ORDER[maxTierFor(ctx)]

export const missingConcepts = (tool: AITool, isAvailable: (c: ConceptName) => boolean): ConceptName[] =>
  (tool.requires ?? []).filter((c) => !isAvailable(c))

export interface ToolRegistryImpl extends ToolRegistry {
  /** Startup validation: which tools are usable with the mapped concepts. */
  validate(): { available: string[]; disabled: Record<string, string> }
  /** Is this tool usable in ctx (tier, concepts, available())? */
  allowed(tool: AITool, ctx: ToolContext): boolean
}

export const createToolRegistry = (
  svc: () => Pick<CoreServices, 'isConceptAvailable'>,
  opts: { logger?: () => { warn?: (m: string) => void } | undefined } = {},
): ToolRegistryImpl => {
  const tools = new Map<string, AITool & { module: string }>()
  const isAvailable = (c: ConceptName) => {
    try {
      return svc().isConceptAvailable(c)
    } catch {
      return false
    }
  }
  const allowed = (tool: AITool, ctx: ToolContext): boolean => {
    if (!tierAllowed(tool.tier, ctx)) return false
    if (missingConcepts(tool, isAvailable).length) return false
    if (tool.available) {
      try {
        return tool.available(ctx)
      } catch {
        return false
      }
    }
    return true
  }
  const disabled = (): Record<string, string> => {
    const out: Record<string, string> = {}
    for (const t of tools.values()) {
      const miss = missingConcepts(t, isAvailable)
      if (miss.length) out[t.name] = `requires unmapped concept(s): ${miss.join(', ')}`
    }
    return out
  }
  return {
    register(tool, module) {
      if (!/^[a-zA-Z][\w-]{0,63}$/.test(tool.name)) throw new Error(`[ai-suite] Invalid tool name "${tool.name}"`)
      const existing = tools.get(tool.name)
      if (existing) {
        opts.logger?.()?.warn?.(`[ai-suite] Tool "${tool.name}" from module "${module}" ignored: already registered by "${existing.module}".`)
        return
      }
      tools.set(tool.name, { ...tool, module })
    },
    get: (name) => tools.get(name),
    list: () => [...tools.values()],
    availableFor: (ctx, names) =>
      [...tools.values()].filter((t) => (!names || names.includes(t.name)) && allowed(t, ctx)),
    disabled,
    allowed,
    validate() {
      const d = disabled()
      return { available: [...tools.keys()].filter((n) => !d[n]), disabled: d }
    },
  }
}
