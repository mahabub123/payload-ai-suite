import type { CollectionConfig } from 'payload'
import { access } from 'payload-ai-core'
import { IDENTITIES, MESSAGES } from './constants'
import { CHANNEL_NAMES } from './options'

const channelField = {
  name: 'channel',
  type: 'select',
  required: true,
  index: true,
  options: CHANNEL_NAMES.map((c) => ({ label: c, value: c })),
} as const

const hidden = { hidden: true } as const

/** Linked channel identities: one row per (channel, external user). Written only by the module (overrideAccess). */
export const identitiesCollection: CollectionConfig = {
  slug: IDENTITIES,
  admin: { group: 'AI Suite', useAsTitle: 'externalIdHash', defaultColumns: ['channel', 'customerId', 'verifiedAt', 'lastInboundAt'] },
  access: {
    read: access.roles('support'),
    create: access.nobody,
    update: access.admin,
    delete: access.admin,
  },
  indexes: [{ fields: ['channel', 'externalIdHash'], unique: true }],
  fields: [
    channelField,
    { name: 'externalIdHash', type: 'text', required: true, index: true, admin: { readOnly: true } },
    { name: 'externalIdEnc', type: 'text', required: true, admin: hidden },
    { name: 'customerId', type: 'text', index: true, admin: { readOnly: true } },
    { name: 'verifiedAt', type: 'date', admin: { readOnly: true } },
    { name: 'pendingCodeHash', type: 'text', admin: hidden },
    { name: 'pendingCodeExpiresAt', type: 'date', admin: hidden },
    { name: 'pendingCodeAttempts', type: 'number', admin: hidden },
    { name: 'pendingCustomerId', type: 'text', admin: hidden },
    { name: 'lastLinkRequestAt', type: 'date', admin: hidden },
    { name: 'pendingActions', type: 'json', admin: hidden },
    { name: 'lastInboundAt', type: 'date', admin: { readOnly: true } },
    { name: 'conversationId', type: 'text', admin: { readOnly: true } },
    { name: 'tenantRef', type: 'text', admin: hidden },
  ],
}

/** Every inbound and outbound channel message; unique (channel, externalMessageId) dedupes webhook retries. */
export const messagesCollection: CollectionConfig = {
  slug: MESSAGES,
  admin: { group: 'AI Suite', useAsTitle: 'externalMessageId', defaultColumns: ['channel', 'direction', 'status', 'createdAt'] },
  access: {
    read: access.roles('support'),
    create: access.nobody,
    update: access.nobody,
    delete: access.admin,
  },
  indexes: [{ fields: ['channel', 'externalMessageId'], unique: true }],
  fields: [
    channelField,
    { name: 'externalMessageId', type: 'text', required: true, index: true },
    { name: 'direction', type: 'select', required: true, options: ['in', 'out'] },
    {
      name: 'status',
      type: 'select',
      required: true,
      index: true,
      options: ['received', 'processing', 'processed', 'ignored', 'queued', 'sending', 'sent', 'skipped', 'retrying', 'failed'],
    },
    { name: 'identity', type: 'text', index: true },
    { name: 'senderEnc', type: 'text', admin: hidden },
    { name: 'conversationId', type: 'text', index: true },
    { name: 'threadKey', type: 'text', index: true },
    { name: 'replyTo', type: 'text' },
    { name: 'text', type: 'textarea' },
    { name: 'meta', type: 'json' },
    { name: 'partsSent', type: 'number' },
    { name: 'attempts', type: 'number' },
    { name: 'reason', type: 'text' },
    { name: 'error', type: 'text' },
    { name: 'providerMessageIds', type: 'json' },
    { name: 'sentAt', type: 'date' },
    { name: 'tenantRef', type: 'text', admin: hidden },
  ],
}
