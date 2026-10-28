import type { Payload } from 'payload'
import { api } from '../local'
import type { AutomationDefinition } from './types'

const TTL_MS = 30_000
let cache = new WeakMap<Payload, { at: number; list: Promise<AutomationDefinition[]> }>()

/** Enabled collection-triggered automations, cached per Payload instance (invalidated on ai-automations changes). */
export const enabledAutomations = (payload: Payload): Promise<AutomationDefinition[]> => {
  const hit = cache.get(payload)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.list
  const list = api(payload)
    .find({ collection: 'ai-automations', where: { enabled: { equals: true } }, limit: 500, depth: 0, overrideAccess: true, pagination: false })
    .then((r) => r.docs as AutomationDefinition[])
    .catch((e) => {
      cache.delete(payload)
      throw e
    })
  cache.set(payload, { at: Date.now(), list })
  return list
}

export const invalidateAutomationCache = (): void => {
  cache = new WeakMap()
}
