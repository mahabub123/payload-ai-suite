import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
import type { AIContext, Actor, CoreServices } from '@payload-ai-suite/ai-core'
import { getAI } from '@payload-ai-suite/ai-core'
import { defaultRunTurn, type RunTurn } from './assistant'
import { MODULE } from './constants'
import type { IdentityDoc } from './db'
import { dbOf, type Db } from './db'
import { createDrivers, type ChannelDriver } from './drivers'
import type { AiChannelsOptions, ChannelName } from './options'

export interface ChannelRuntime {
  payload: Payload
  db: Db
  services: CoreServices
  options: AiChannelsOptions
  drivers: Map<ChannelName, ChannelDriver>
  runTurn: RunTurn
  fetch: typeof fetch
  now: () => Date
  sleep: (ms: number) => Promise<void>
}

export type RuntimeOverrides = Partial<Omit<ChannelRuntime, 'payload' | 'db'>>

export const createRuntime = (payload: Payload, options: AiChannelsOptions, o: RuntimeOverrides = {}): ChannelRuntime => ({
  payload,
  db: dbOf(payload),
  services: o.services ?? getAI(payload),
  options,
  drivers: o.drivers ?? createDrivers(options),
  runTurn: o.runTurn ?? defaultRunTurn,
  fetch: o.fetch ?? ((...a) => globalThis.fetch(...a)),
  now: o.now ?? (() => new Date()),
  sleep: o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
})

export const isVerified = (identity: Pick<IdentityDoc, 'verifiedAt' | 'customerId'>): boolean =>
  Boolean(identity.verifiedAt && identity.customerId)

/**
 * AIContext for a channel user: actor kind 'channel', no suite roles (never staff), customerId only
 * when the identity is verified, adapters run with caller (non-system) access.
 */
export const buildChannelContext = (
  rt: Pick<ChannelRuntime, 'payload' | 'services'>,
  identity: Pick<IdentityDoc, 'externalIdHash' | 'verifiedAt' | 'customerId'>,
  channel: ChannelName,
  tenant?: string | number,
): AIContext => {
  const verified = isVerified(identity)
  const customerId = verified ? String(identity.customerId) : undefined
  const actor: Actor = {
    kind: 'channel',
    roles: [],
    user: null,
    ...(customerId ? { customerId } : {}),
    channel: { name: channel, externalIdHash: identity.externalIdHash, verified },
  }
  const base = rt.services.systemContext(rt.payload, { module: MODULE, tenant })
  return {
    payload: rt.payload,
    requestId: randomUUID(),
    module: MODULE,
    surface: 'channel',
    actor,
    tenant,
    locale: base.locale,
    adapters: rt.services.adapters,
    adapterCtx: { payload: rt.payload, user: null, customerId, locale: base.locale, tenant, system: false },
  }
}

/** System adapter context (identity lookups by email). */
export const systemAdapterCtx = (rt: Pick<ChannelRuntime, 'payload' | 'services'>, tenant?: string | number) =>
  rt.services.systemContext(rt.payload, { module: MODULE, tenant }).adapterCtx

export const queueTask = async (payload: Payload, task: string, input: Record<string, unknown>): Promise<void> => {
  await (payload.jobs.queue as unknown as (a: { task: string; input: Record<string, unknown> }) => Promise<unknown>)({ task, input })
}

export const tenantOf = (ref: string | null | undefined): string | number | undefined =>
  ref == null || ref === '' ? undefined : /^\d+$/.test(ref) ? Number(ref) : ref
