import type { CollectionConfig, Field } from 'payload'
import { TASK_CLASSES } from '../contracts'
import { access } from '../access'
import { ADMIN_GROUP, SLUGS } from './slugs'

const ro = { readOnly: true }
const n = (name: string): Field => ({ name, type: 'number', defaultValue: 0, admin: ro })
const tenantKeyField: Field = { name: 'tenantKey', type: 'text', index: true, admin: { hidden: true } }
const systemOnly = { create: access.nobody, update: access.nobody, delete: access.nobody }

/** ai-usage: one row per model call. Written by the usage service only. */
export const aiUsageCollection = (): CollectionConfig => ({
  slug: SLUGS.usage,
  labels: { singular: 'AI usage', plural: 'AI usage' },
  admin: { group: ADMIN_GROUP, defaultColumns: ['createdAt', 'module', 'task', 'model', 'costMicros', 'outcome'] },
  access: { read: access.admin, ...systemOnly },
  timestamps: true,
  fields: [
    { name: 'module', type: 'text', index: true, admin: ro },
    { name: 'task', type: 'select', options: TASK_CLASSES.map((t) => ({ label: t, value: t })), admin: ro },
    { name: 'model', type: 'text', index: true, admin: ro },
    n('inputTokens'),
    n('outputTokens'),
    n('cachedInputTokens'),
    { name: 'costMicros', type: 'number', defaultValue: 0, admin: { readOnly: true, description: 'micro-USD' } },
    n('latencyMs'),
    { name: 'outcome', type: 'select', index: true, options: ['ok', 'error', 'fallback', 'blocked'].map((v) => ({ label: v, value: v })), admin: ro },
    { name: 'errorCode', type: 'text', admin: ro },
    { name: 'promptSlug', type: 'text', admin: ro },
    { name: 'promptVersion', type: 'number', admin: ro },
    { name: 'requestId', type: 'text', index: true, admin: ro },
    { name: 'actorKind', type: 'text', admin: ro },
    tenantKeyField,
  ],
})

/** ai-usage-daily: rollup per day/tenant/module/task/model (budgets and dashboards read this). */
export const aiUsageDailyCollection = (): CollectionConfig => ({
  slug: SLUGS.usageDaily,
  labels: { singular: 'AI usage (daily)', plural: 'AI usage (daily)' },
  admin: { group: ADMIN_GROUP, defaultColumns: ['date', 'module', 'model', 'calls', 'costMicros'] },
  access: { read: access.admin, ...systemOnly },
  fields: [
    { name: 'key', type: 'text', unique: true, index: true, admin: { hidden: true } },
    { name: 'date', type: 'text', index: true, admin: { readOnly: true, description: 'YYYY-MM-DD (UTC)' } },
    { name: 'module', type: 'text', index: true, admin: ro },
    { name: 'task', type: 'text', admin: ro },
    { name: 'model', type: 'text', admin: ro },
    n('calls'),
    n('errors'),
    n('inputTokens'),
    n('outputTokens'),
    n('cachedInputTokens'),
    { name: 'costMicros', type: 'number', defaultValue: 0, admin: { readOnly: true, description: 'micro-USD' } },
    tenantKeyField,
  ],
})

/** ai-audit: append-only. No create/update/delete access; the audit service writes with overrideAccess. */
export const aiAuditCollection = (): CollectionConfig => ({
  slug: SLUGS.audit,
  labels: { singular: 'AI audit entry', plural: 'AI audit log' },
  admin: { group: ADMIN_GROUP, useAsTitle: 'action', defaultColumns: ['createdAt', 'action', 'actorKind', 'actorId', 'targetCollection', 'targetId'] },
  access: { read: access.admin, ...systemOnly },
  timestamps: true,
  fields: [
    { name: 'action', type: 'text', required: true, index: true, admin: ro },
    { name: 'actorKind', type: 'text', admin: ro },
    { name: 'actorId', type: 'text', index: true, admin: ro },
    { name: 'actorRoles', type: 'text', admin: ro },
    { name: 'targetCollection', type: 'text', index: true, admin: ro },
    { name: 'targetId', type: 'text', index: true, admin: ro },
    { name: 'before', type: 'json', admin: ro },
    { name: 'after', type: 'json', admin: ro },
    { name: 'meta', type: 'json', admin: ro },
    { name: 'requestId', type: 'text', index: true, admin: ro },
    tenantKeyField,
  ],
  hooks: {
    beforeChange: [
      ({ operation, originalDoc, data }) => {
        // Defense in depth: even overrideAccess writes may not rewrite history.
        if (operation === 'update' && originalDoc) throw new Error('ai-audit is append-only')
        return data
      },
    ],
    beforeDelete: [
      ({ req }) => {
        if (!req.context?.aiRetentionPurge) throw new Error('ai-audit is append-only')
      },
    ],
  },
})
