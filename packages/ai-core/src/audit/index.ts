import type { AuditService } from '../contracts'
import { SLUGS } from '../collections/slugs'
import { loose, tenantKey } from '../usage/db'

export interface AuditServiceDeps {
  tenantField?: string
}

const json = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))

/** Append-only audit log (ai-audit has no update/delete access; writes go through here). */
export const createAuditService = (deps: AuditServiceDeps = {}): AuditService => ({
  async log(entry, ctx) {
    const user = ctx.actor?.user as { id?: string | number; email?: string } | null | undefined
    try {
      await loose(ctx.payload).create({
        collection: SLUGS.audit,
        data: {
          action: entry.action,
          targetCollection: entry.target?.collection,
          targetId: entry.target?.id != null ? String(entry.target.id) : undefined,
          before: json(entry.before),
          after: json(entry.after),
          meta: json(entry.meta),
          requestId: ctx.requestId,
          actorKind: ctx.actor?.kind,
          actorId: user?.id != null ? String(user.id) : (ctx.actor?.customerId ?? ctx.actor?.visitorId),
          actorRoles: (ctx.actor?.roles ?? []).join(','),
          tenantKey: tenantKey(ctx.tenant),
          ...(deps.tenantField && ctx.tenant != null ? { [deps.tenantField]: ctx.tenant } : {}),
        },
        overrideAccess: true,
        context: { aiAuditInternal: true },
      })
    } catch (e) {
      ctx.payload.logger?.error({ err: e, requestId: ctx.requestId }, `[ai-suite] failed to write audit entry ${entry.action}`)
    }
  },
})
