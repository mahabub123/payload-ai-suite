import { getAI } from 'payload-ai-core'
import type { CoreServices } from 'payload-ai-core'
import type { Payload, TaskConfig } from 'payload'
import { getAssistantOptions } from './options'
import { MODULE } from './state'

export const OUTCOMES_TASK = 'ai-assistant-outcomes'
const DAY = 86_400_000

interface ConversationDoc {
  id: string | number
  createdAt: string
  updatedAt: string
  outcome?: string | null
  handedOff?: boolean | null
  tenant?: unknown
  customer?: unknown
  customerId?: unknown
  /** ai-core stores hashId(customerId) here. */
  customerHash?: string | null
}

const refId = (v: unknown): string | undefined =>
  v == null ? undefined : typeof v === 'object' ? (((v as { id?: unknown }).id as string | undefined) ?? undefined) : String(v)

/**
 * Tags conversations from the last 48 h:
 * - ordered_within_24h: the conversation's customer placed an order within 24 h after it started
 * - abandoned: idle conversations that never reached an outcome
 * Idempotent: already-tagged conversations are skipped.
 */
export const tagConversationOutcomes = async (
  payload: Payload,
  services: CoreServices,
  opts: { now?: Date; idleMinutes?: number } = {},
): Promise<{ scanned: number; ordered: number; abandoned: number }> => {
  const now = opts.now?.getTime() ?? Date.now()
  const idleBefore = now - (opts.idleMinutes ?? getAssistantOptions(payload).idleMinutes) * 60_000
  const sys = services.systemContext(payload, { module: MODULE })

  // customer id (raw and hashed, since conversations may store a join hash) -> order times
  const orderTimes = new Map<string, number[]>()
  if (services.adapters.order) {
    for await (const o of services.adapters.order.iterate({ from: new Date(now - 2 * DAY), to: new Date(now), batchSize: 200 }, sys.adapterCtx)) {
      if (!o.customerId) continue
      const t = new Date(o.createdAt).getTime()
      for (const k of [o.customerId, services.crypto.hashId(o.customerId)]) orderTimes.set(k, [...(orderTimes.get(k) ?? []), t])
    }
  }

  let scanned = 0
  let ordered = 0
  let abandoned = 0
  for (let page = 1; ; page++) {
    const res = await payload.find({
      collection: 'ai-conversations' as never,
      where: { and: [{ module: { equals: MODULE } }, { createdAt: { greater_than: new Date(now - 2 * DAY).toISOString() } }] } as never,
      limit: 200,
      page,
      depth: 0,
      overrideAccess: true,
      sort: 'createdAt',
    })
    for (const raw of res.docs) {
      const c = raw as unknown as ConversationDoc
      scanned++
      if (c.outcome === 'ordered_within_24h' || c.outcome === 'abandoned') continue
      const id = String(c.id)
      const customer = c.customerHash ?? refId(c.customer) ?? refId(c.customerId)
      const start = new Date(c.createdAt).getTime()
      const times = customer ? orderTimes.get(customer) : undefined
      const tenantCtx = c.tenant != null ? services.systemContext(payload, { module: MODULE, tenant: refId(c.tenant) }) : sys
      if (times?.some((t) => t >= start && t <= start + DAY)) {
        await services.memory.update(id, { outcome: 'ordered_within_24h' }, tenantCtx)
        ordered++
      } else if (!c.outcome && !c.handedOff && new Date(c.updatedAt).getTime() < idleBefore) {
        await services.memory.update(id, { outcome: 'abandoned' }, tenantCtx)
        abandoned++
      }
    }
    if (!res.hasNextPage) break
  }
  return { scanned, ordered, abandoned }
}

export const outcomesTask: TaskConfig<{ input: object; output: { scanned: number; ordered: number; abandoned: number } }> = {
  slug: OUTCOMES_TASK,
  label: 'AI assistant: tag conversation outcomes',
  retries: 2,
  outputSchema: [
    { name: 'scanned', type: 'number' },
    { name: 'ordered', type: 'number' },
    { name: 'abandoned', type: 'number' },
  ],
  handler: async ({ req }) => ({ output: await tagConversationOutcomes(req.payload, getAI(req.payload)) }),
}
