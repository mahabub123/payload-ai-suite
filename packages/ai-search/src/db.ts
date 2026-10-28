import type { Payload, Where } from 'payload'
import type { AICoreOptions, AIContext, CoreServices } from '@payload-ai-suite/ai-core'
import { getSuiteState } from '@payload-ai-suite/ai-core'

/** Loose Local API access for this module's own collections (no generated types in a plugin). */
type Doc = Record<string, any>
interface LooseLocalAPI {
  find(args: Record<string, unknown>): Promise<{ docs: Doc[]; totalDocs: number; hasNextPage?: boolean }>
  create(args: Record<string, unknown>): Promise<Doc>
  update(args: Record<string, unknown>): Promise<Doc>
}
export const local = (payload: Payload): LooseLocalAPI => payload as unknown as LooseLocalAPI

export const coreOptions = (payload: Payload): AICoreOptions | undefined =>
  getSuiteState(payload.config ?? {})?.options as AICoreOptions | undefined

export const tenantField = (payload: Payload): string | undefined => coreOptions(payload)?.tenant?.field

/** Data patch adding the tenant when multi-tenancy is on. */
export const tenantData = (payload: Payload, tenant: string | number | undefined): Doc => {
  const f = tenantField(payload)
  return f && tenant != null ? { [f]: tenant } : {}
}

/** AND a tenant constraint onto a where clause when multi-tenancy is on. */
export const tenantWhere = (payload: Payload, tenant: string | number | undefined, where: Where): Where => {
  const f = tenantField(payload)
  if (!f || tenant == null) return where
  return { and: [where, { [f]: { equals: tenant } }] }
}

/** Stable hashed session key: explicit session id > visitor > customer. Never stores raw ids. */
export const sessionHash = (services: CoreServices, ctx: Pick<AIContext, 'actor'>, raw?: string): string | undefined => {
  if (raw) return services.crypto.hashId(`s:${raw}`)
  if (ctx.actor.visitorId) return services.crypto.hashId(`v:${ctx.actor.visitorId}`)
  if (ctx.actor.customerId) return services.crypto.hashId(`c:${ctx.actor.customerId}`)
  return undefined
}

export const errMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e))
