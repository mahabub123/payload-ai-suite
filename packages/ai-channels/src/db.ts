import type { Payload } from 'payload'
import { IDENTITIES, MESSAGES } from './constants'
import type { ChannelName } from './options'

/** Minimal, loosely typed view of the Local API used by this module (works with or without generated types). */
export interface Db {
  find(args: { collection: string; where?: Record<string, unknown>; limit?: number; sort?: string; depth?: number; overrideAccess?: boolean }): Promise<{ docs: any[] }>
  findByID(args: { collection: string; id: string | number; depth?: number; overrideAccess?: boolean; disableErrors?: boolean }): Promise<any>
  create(args: { collection: string; data: Record<string, unknown>; overrideAccess?: boolean; depth?: number }): Promise<any>
  update(args: { collection: string; id: string | number; data: Record<string, unknown>; overrideAccess?: boolean; depth?: number }): Promise<any>
}

export const dbOf = (payload: Payload): Db => payload as unknown as Db

export interface PendingAction {
  code: string
  actionId: string
  tool: string
  expiresAt: string
}

export interface IdentityDoc {
  id: string | number
  channel: ChannelName
  externalIdHash: string
  /** Encrypted external id (needed to reply; the hash alone cannot be messaged). */
  externalIdEnc: string
  customerId?: string | null
  verifiedAt?: string | null
  pendingCodeHash?: string | null
  pendingCodeExpiresAt?: string | null
  pendingCodeAttempts?: number | null
  pendingCustomerId?: string | null
  lastLinkRequestAt?: string | null
  pendingActions?: PendingAction[] | null
  lastInboundAt?: string | null
  conversationId?: string | null
  tenantRef?: string | null
}

export type MessageStatus =
  | 'received'
  | 'processing'
  | 'processed'
  | 'ignored'
  | 'queued'
  | 'sending'
  | 'sent'
  | 'skipped'
  | 'retrying'
  | 'failed'

export interface MessageDoc {
  id: string | number
  channel: ChannelName
  externalMessageId: string
  direction: 'in' | 'out'
  status: MessageStatus
  identity?: string | null
  /** Encrypted sender id (inbound rows) until the identity is resolved. */
  senderEnc?: string | null
  conversationId?: string | null
  text?: string | null
  /** Normalized extras: media, email subject/threading. */
  meta?: Record<string, any> | null
  threadKey?: string | null
  replyTo?: string | null
  partsSent?: number | null
  attempts?: number | null
  reason?: string | null
  error?: string | null
  providerMessageIds?: string[] | null
  sentAt?: string | null
  tenantRef?: string | null
  createdAt?: string
}

export const getIdentity = async (db: Db, id: string | number): Promise<IdentityDoc | null> =>
  db.findByID({ collection: IDENTITIES, id, overrideAccess: true, depth: 0, disableErrors: true }).catch(() => null)

export const updateIdentity = (db: Db, id: string | number, data: Partial<IdentityDoc>): Promise<IdentityDoc> =>
  db.update({ collection: IDENTITIES, id, data: data as Record<string, unknown>, overrideAccess: true, depth: 0 })

export const getMessage = async (db: Db, id: string | number): Promise<MessageDoc | null> =>
  db.findByID({ collection: MESSAGES, id, overrideAccess: true, depth: 0, disableErrors: true }).catch(() => null)

export const updateMessage = (db: Db, id: string | number, data: Partial<MessageDoc>): Promise<MessageDoc> =>
  db.update({ collection: MESSAGES, id, data: data as Record<string, unknown>, overrideAccess: true, depth: 0 })

export const findMessage = async (db: Db, channel: string, externalMessageId: string): Promise<MessageDoc | null> => {
  const r = await db.find({
    collection: MESSAGES,
    where: { channel: { equals: channel }, externalMessageId: { equals: externalMessageId } },
    limit: 1,
    overrideAccess: true,
    depth: 0,
  })
  return r.docs[0] ?? null
}

/** Payload/Postgres unique-constraint violations surface with different shapes; detect them loosely. */
export const isUniqueViolation = (e: unknown): boolean => {
  const err = e as { code?: string; cause?: { code?: string }; message?: string; data?: { errors?: { message?: string }[] } }
  if (err?.code === '23505' || err?.cause?.code === '23505') return true
  const msg = `${err?.message ?? ''} ${(err?.data?.errors ?? []).map((x) => x.message).join(' ')}`
  return /unique|duplicate|already exists|must be unique/i.test(msg)
}
