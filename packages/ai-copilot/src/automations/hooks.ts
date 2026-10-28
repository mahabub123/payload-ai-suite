import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionConfig, PayloadRequest } from 'payload'
import { getAI, hasAI } from '@payload-ai-suite/ai-core'
import { matchFilter } from '../filter'
import { idOf } from '../local'
import { COPILOT_CONTEXT_FLAG } from '../options'
import { enabledAutomations } from './cache'
import { enqueueRun } from './runner'

type Op = 'create' | 'update' | 'delete'

const trigger = async (req: PayloadRequest, collection: string, operation: Op, doc: Record<string, unknown>, tenantField?: string) => {
  const payload = req.payload
  if (req.context?.[COPILOT_CONTEXT_FLAG] || !hasAI(payload)) return
  try {
    const services = getAI(payload)
    const tenantRaw = tenantField ? doc[tenantField] : undefined
    const tenant = tenantRaw === undefined ? undefined : (idOf(tenantRaw) as string | number | undefined)
    if (!(await services.isModuleEnabled('copilot', payload, tenant))) return
    const list = await enabledAutomations(payload)
    for (const a of list) {
      if (a.trigger?.type !== 'collection' || a.trigger.collection !== collection || a.trigger.operation !== operation) continue
      if (tenantField && a.tenant != null && tenant !== undefined && idOf(a.tenant) !== String(tenant)) continue
      if (!matchFilter(a.trigger.condition ?? undefined, doc)) continue
      await enqueueRun(payload, a, { collection, docId: String(doc.id), operation, doc, tenant }, { req, tenantField, services })
    }
  } catch (e) {
    // Automations must never break a business write.
    payload.logger.error({ msg: `[ai-copilot] automation trigger failed on ${collection}`, err: e })
  }
}

export const automationAfterChange =
  (slug: string, tenantField?: string): CollectionAfterChangeHook =>
  async ({ doc, operation, req }) => {
    await trigger(req, slug, operation as Op, doc, tenantField)
    return doc
  }

export const automationAfterDelete =
  (slug: string, tenantField?: string): CollectionAfterDeleteHook =>
  async ({ doc, req }) => {
    await trigger(req, slug, 'delete', doc, tenantField)
  }

/** Append the automation hooks to allow-listed collections, keeping every existing hook. */
export const attachAutomationHooks = (collections: CollectionConfig[], allow: string[], tenantField?: string): CollectionConfig[] =>
  collections.map((c) =>
    allow.includes(c.slug)
      ? {
          ...c,
          hooks: {
            ...c.hooks,
            afterChange: [...(c.hooks?.afterChange ?? []), automationAfterChange(c.slug, tenantField)],
            afterDelete: [...(c.hooks?.afterDelete ?? []), automationAfterDelete(c.slug, tenantField)],
          },
        }
      : c,
  )
