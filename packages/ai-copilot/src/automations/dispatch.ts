import type { Payload } from 'payload'
import type { CoreServices } from '@payload-ai-suite/ai-core'
import { AUTOMATIONS } from '../collections'
import { api } from '../local'
import { COPILOT_CONTEXT_FLAG } from '../options'
import { cronDueBetween } from './cron'
import { enqueueRun } from './runner'
import type { AutomationDefinition } from './types'

/** Queue runs for schedule-triggered automations whose cron fired since their last dispatch. */
export const dispatchScheduled = async (
  payload: Payload,
  opts: { now?: Date; tenantField?: string; services?: CoreServices } = {},
): Promise<{ queued: number }> => {
  const now = opts.now ?? new Date()
  const { docs } = await api(payload).find({
    collection: AUTOMATIONS,
    where: { and: [{ enabled: { equals: true } }, { 'trigger.type': { equals: 'schedule' } }] },
    limit: 500,
    depth: 0,
    overrideAccess: true,
    pagination: false,
  })
  let queued = 0
  for (const a of docs as AutomationDefinition[]) {
    const cron = a.trigger?.cron
    if (!cron) continue
    let due = false
    try {
      due = cronDueBetween(cron, a.lastScheduledAt ? new Date(a.lastScheduledAt) : undefined, now)
    } catch (e) {
      payload.logger.error({ msg: `[ai-copilot] invalid cron on automation ${a.id}`, err: e })
      continue
    }
    if (!due) continue
    await api(payload).update({
      collection: AUTOMATIONS,
      id: a.id,
      data: { lastScheduledAt: now.toISOString() },
      overrideAccess: true,
      context: { [COPILOT_CONTEXT_FLAG]: true },
    })
    const tenant = opts.tenantField ? ((a as unknown as Record<string, unknown>)[opts.tenantField] as string | number | undefined) : undefined
    await enqueueRun(payload, a, { scheduledFor: now.toISOString(), tenant: typeof tenant === 'object' ? (tenant as { id: string }).id : tenant }, opts)
    queued++
  }
  return { queued }
}
