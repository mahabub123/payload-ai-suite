import type { CollectionConfig } from 'payload'
import { access } from '../access'

export const TICKETS_SLUG = 'ai-tickets'

/**
 * Minimal shared ticket schema (DESIGN §8 note): owned by core because the assistant hand-off precedes
 * ai-support, which adds triage, views and hooks on top. `userCollection` = config.admin.user.
 */
export const aiTicketsCollection = (userCollection = 'users'): CollectionConfig => ({
  slug: TICKETS_SLUG,
  labels: { singular: 'Ticket', plural: 'Tickets' },
  admin: {
    group: 'AI Suite',
    useAsTitle: 'subject',
    defaultColumns: ['subject', 'status', 'priority', 'topic', 'source', 'createdAt'],
  },
  access: {
    read: access.roles('support'),
    create: access.roles('support'),
    update: access.roles('support'),
    delete: access.admin,
  },
  timestamps: true,
  fields: [
    { name: 'subject', type: 'text', required: true },
    {
      name: 'source',
      type: 'select',
      required: true,
      defaultValue: 'form',
      options: ['form', 'email', 'channel', 'handoff', 'assistant'],
      index: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'open',
      options: ['open', 'pending', 'solved', 'closed'],
      index: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'priority',
      type: 'select',
      defaultValue: 'normal',
      options: ['low', 'normal', 'high', 'urgent'],
      index: true,
      admin: { position: 'sidebar' },
    },
    { name: 'assignee', type: 'relationship', relationTo: userCollection as any, admin: { position: 'sidebar' } },
    { name: 'customerId', type: 'text', index: true },
    { name: 'customerEmail', type: 'email' },
    { name: 'conversation', type: 'relationship', relationTo: 'ai-conversations' as any },
    { name: 'transcript', type: 'json' },
    { name: 'summary', type: 'textarea' },
    { name: 'topic', type: 'text', index: true },
    { name: 'sentiment', type: 'select', options: ['negative', 'neutral', 'positive'] },
    { name: 'language', type: 'text' },
    { name: 'linkedOrderId', type: 'text' },
    { name: 'suggestedReply', type: 'textarea' },
    { name: 'tags', type: 'text', hasMany: true },
  ],
})
