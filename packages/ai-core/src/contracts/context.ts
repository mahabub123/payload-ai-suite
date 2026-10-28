/**
 * Request identity and context (design doc §6 guard pipeline, §12 access matrix).
 */
import type { Payload, PayloadRequest, TypedUser } from 'payload'
import type { AdapterContext, AdapterSet } from './adapters'

export type ActorKind = 'staff' | 'customer' | 'visitor' | 'channel' | 'system'

/** Roles used by the access matrix (§12). Sites map their own user roles onto these via options.roles. */
export type SuiteRole =
  | 'super-admin'
  | 'store-admin'
  | 'content'
  | 'marketing-approver'
  | 'support'
  | 'manager'
  | 'customer'

export type Surface = 'storefront' | 'admin' | 'channel' | 'job'

export interface Actor {
  kind: ActorKind
  /** Payload user (staff or logged-in customer). */
  user?: TypedUser | null
  /** Suite roles derived from the user. */
  roles: SuiteRole[]
  /** Customer id when the actor is a logged-in customer or a verified channel identity. */
  customerId?: string
  /** Hashed anonymous visitor id (cookie / header). */
  visitorId?: string
  /** For channel actors: channel name and hashed external id. */
  channel?: { name: string; externalIdHash: string; verified: boolean }
}

export interface AIContext {
  payload: Payload
  req?: PayloadRequest
  requestId: string
  module: string
  surface: Surface
  actor: Actor
  tenant?: string | number
  locale: string
  /** Adapter context derived from this request (caller's access). */
  adapterCtx: AdapterContext
  adapters: AdapterSet
}
