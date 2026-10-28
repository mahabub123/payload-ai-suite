import type { CollectionConfig } from 'payload'
import { access } from 'payload-ai-core'
import { invalidateAutomationCache } from './automations/cache'

export const CHANGESETS = 'ai-copilot-changesets'
export const AUTOMATIONS = 'ai-automations'
export const RUNS = 'ai-automation-runs'

const ROLE_OPTIONS = ['store-admin', 'content', 'marketing-approver', 'support', 'manager', 'super-admin']

export const changesetsCollection: CollectionConfig = {
  slug: CHANGESETS,
  labels: { singular: 'Copilot changeset', plural: 'Copilot changesets' },
  admin: { group: 'AI Suite', useAsTitle: 'summary', defaultColumns: ['summary', 'targetCollection', 'status', 'createdAt'] },
  // Writes happen only through the copilot endpoints (system writes); staff may read.
  access: { read: access.staff, create: access.nobody, update: access.nobody, delete: access.admin },
  fields: [
    { name: 'summary', type: 'text' },
    { name: 'targetCollection', type: 'text', required: true, index: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'proposed',
      index: true,
      options: ['proposed', 'applying', 'applied', 'discarded', 'failed'],
    },
    { name: 'fields', type: 'json', admin: { description: 'Fields changed by this changeset.' } },
    { name: 'items', type: 'json', admin: { description: '[{ id, before, after }]' } },
    { name: 'results', type: 'json' },
    { name: 'instructions', type: 'textarea' },
    { name: 'createdBy', type: 'text', admin: { readOnly: true } },
    { name: 'appliedBy', type: 'text', admin: { readOnly: true } },
    { name: 'appliedAt', type: 'date', admin: { readOnly: true } },
    { name: 'idempotencyKey', type: 'text', index: true, admin: { readOnly: true } },
  ],
  timestamps: true,
}

export const automationsCollection: CollectionConfig = {
  slug: AUTOMATIONS,
  labels: { singular: 'Automation', plural: 'Automations' },
  admin: { group: 'AI Suite', useAsTitle: 'name', defaultColumns: ['name', 'enabled', 'updatedAt'] },
  access: { read: access.staff, create: access.admin, update: access.admin, delete: access.admin },
  hooks: { afterChange: [() => invalidateAutomationCache()], afterDelete: [() => invalidateAutomationCache()] },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'enabled', type: 'checkbox', defaultValue: true, index: true },
    {
      name: 'trigger',
      type: 'group',
      fields: [
        { name: 'type', type: 'select', required: true, defaultValue: 'collection', options: ['collection', 'schedule'] },
        { name: 'collection', type: 'text', admin: { condition: (_, s) => s?.type === 'collection' } },
        {
          name: 'operation',
          type: 'select',
          defaultValue: 'create',
          options: ['create', 'update', 'delete'],
          admin: { condition: (_, s) => s?.type === 'collection' },
        },
        {
          name: 'condition',
          type: 'json',
          admin: { description: 'Structured filter: { field, op, value } | { and: [...] } | { or: [...] }', condition: (_, s) => s?.type === 'collection' },
        },
        { name: 'cron', type: 'text', admin: { description: '5-field cron, UTC (e.g. "0 8 * * 1")', condition: (_, s) => s?.type === 'schedule' } },
      ],
    },
    {
      name: 'steps',
      type: 'array',
      minRows: 1,
      fields: [
        { name: 'type', type: 'select', required: true, options: ['classify', 'summarize', 'draft', 'extract'] },
        { name: 'promptSlug', type: 'text' },
        { name: 'instructions', type: 'textarea' },
        { name: 'outputKey', type: 'text', required: true },
      ],
    },
    {
      name: 'approval',
      type: 'group',
      fields: [
        { name: 'required', type: 'checkbox', defaultValue: false },
        { name: 'role', type: 'select', options: ROLE_OPTIONS },
      ],
    },
    {
      name: 'action',
      type: 'group',
      fields: [
        { name: 'type', type: 'select', required: true, defaultValue: 'notify', options: ['notify', 'create-draft', 'tag'] },
        { name: 'when', type: 'json', admin: { description: 'Optional structured filter over { outputs, doc }; action is skipped when false.' } },
        { name: 'channel', type: 'select', defaultValue: 'admin', options: ['admin', 'email'] },
        { name: 'emailTo', type: 'text', hasMany: true },
        { name: 'subject', type: 'text' },
        { name: 'collection', type: 'text', admin: { description: 'create-draft: target collection' } },
        { name: 'fieldMapping', type: 'json', admin: { description: 'create-draft: { targetField: "outputs.key" | "doc.path" | literal }' } },
        { name: 'field', type: 'text', admin: { description: 'tag: field on the trigger doc' } },
        { name: 'valueFrom', type: 'text', admin: { description: 'tag: output key holding the value' } },
      ],
    },
    { name: 'lastScheduledAt', type: 'date', admin: { readOnly: true, position: 'sidebar' } },
  ],
  timestamps: true,
}

export const runsCollection: CollectionConfig = {
  slug: RUNS,
  labels: { singular: 'Automation run', plural: 'Automation runs' },
  admin: { group: 'AI Suite', defaultColumns: ['automation', 'status', 'triggerCollection', 'createdAt'] },
  access: { read: access.staff, create: access.nobody, update: access.nobody, delete: access.admin },
  fields: [
    // Cast: sites without copilot in their generated types don't know this slug.
    { name: 'automation', type: 'relationship', relationTo: AUTOMATIONS as never, required: true, index: true },
    { name: 'triggerCollection', type: 'text' },
    { name: 'triggerDocId', type: 'text', index: true },
    { name: 'triggerOperation', type: 'text' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'queued',
      index: true,
      options: ['queued', 'running', 'awaiting-approval', 'approved', 'rejected', 'done', 'failed'],
    },
    { name: 'inputs', type: 'json' },
    { name: 'outputs', type: 'json' },
    { name: 'actionResult', type: 'json' },
    { name: 'costMicros', type: 'number', defaultValue: 0 },
    { name: 'error', type: 'textarea' },
    { name: 'decidedBy', type: 'text' },
    { name: 'decidedAt', type: 'date' },
  ],
  timestamps: true,
}
