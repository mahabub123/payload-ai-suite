import type { CollectionConfig } from 'payload'
import { access } from 'payload-ai-core'
import { BULK_RUNS, GENERATIONS } from './constants'
import { CONTENT_ACTIONS } from './types'

const group = 'AI Suite'
const ro = { readOnly: true }

/** One row per AI output: target, prompt version, output and the staff decision (acceptance metric, §13). */
export const generationsCollection: CollectionConfig = {
  slug: GENERATIONS,
  labels: { singular: 'AI generation', plural: 'AI generations' },
  admin: {
    group,
    useAsTitle: 'field',
    defaultColumns: ['action', 'targetCollection', 'targetId', 'field', 'accepted', 'model', 'createdAt'],
    description: 'Content Studio outputs. accepted: empty = pending, true = inserted, false = discarded.',
  },
  access: {
    read: access.roles('content'),
    create: access.nobody,
    update: access.roles('content'),
    delete: access.admin,
  },
  timestamps: true,
  fields: [
    { name: 'targetCollection', type: 'text', required: true, index: true, admin: ro },
    { name: 'targetId', type: 'text', index: true, admin: ro },
    { name: 'field', type: 'text', required: true, admin: ro },
    { name: 'fieldType', type: 'select', options: ['text', 'textarea', 'richText'], admin: ro },
    { name: 'locale', type: 'text', admin: ro },
    { name: 'action', type: 'select', options: CONTENT_ACTIONS.map((a) => a), required: true, index: true, admin: ro },
    { name: 'promptSlug', type: 'text', admin: ro },
    { name: 'promptVersion', type: 'number', admin: ro },
    { name: 'output', type: 'textarea', admin: ro },
    { name: 'data', type: 'json', admin: ro },
    // No default: null = pending decision.
    { name: 'accepted', type: 'checkbox', index: true },
    { name: 'acceptedAt', type: 'date', admin: ro },
    { name: 'decidedBy', type: 'text', admin: ro },
    { name: 'appliedAt', type: 'date', admin: { ...ro, description: 'When a bulk review wrote this value into the document as a draft.' } },
    { name: 'model', type: 'text', admin: { ...ro, position: 'sidebar' } },
    { name: 'costMicros', type: 'number', admin: { ...ro, position: 'sidebar' } },
    { name: 'requestedBy', type: 'text', admin: { ...ro, position: 'sidebar' } },
    { name: 'bulkRun', type: 'relationship', relationTo: BULK_RUNS as never, index: true, admin: { ...ro, position: 'sidebar' } },
  ],
}

export const BULK_STATUSES = ['queued', 'running', 'review', 'done', 'failed', 'cancelled'] as const
export type BulkStatus = (typeof BULK_STATUSES)[number]

/** A bulk enrichment run: results land only as pending ai-generations until reviewed. */
export const bulkRunsCollection: CollectionConfig = {
  slug: BULK_RUNS,
  labels: { singular: 'AI bulk run', plural: 'AI bulk runs' },
  admin: {
    group,
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'total', 'processed', 'failed', 'createdAt'],
  },
  access: {
    read: access.admin,
    create: access.nobody,
    update: access.nobody,
    delete: access.admin,
  },
  timestamps: true,
  fields: [
    { name: 'title', type: 'text', admin: ro },
    { name: 'status', type: 'select', options: BULK_STATUSES.map((s) => s), defaultValue: 'queued', index: true, admin: ro },
    { name: 'targetCollection', type: 'text', required: true, admin: ro },
    { name: 'action', type: 'select', options: CONTENT_ACTIONS.map((a) => a), required: true, admin: ro },
    { name: 'template', type: 'text', admin: ro },
    { name: 'fields', type: 'json', required: true, admin: ro },
    { name: 'ids', type: 'json', admin: ro },
    { name: 'where', type: 'json', admin: ro },
    { name: 'locale', type: 'text', admin: ro },
    { name: 'instructions', type: 'textarea', admin: ro },
    { name: 'tone', type: 'text', admin: ro },
    { name: 'targetLocale', type: 'text', admin: ro },
    { name: 'total', type: 'number', defaultValue: 0, admin: ro },
    { name: 'processed', type: 'number', defaultValue: 0, admin: ro },
    { name: 'failed', type: 'number', defaultValue: 0, admin: ro },
    { name: 'errorLog', type: 'json', admin: ro },
    { name: 'usedBatch', type: 'checkbox', admin: ro },
    { name: 'jobId', type: 'text', admin: { ...ro, position: 'sidebar' } },
    { name: 'requestedBy', type: 'text', admin: { ...ro, position: 'sidebar' } },
    { name: 'finishedAt', type: 'date', admin: { ...ro, position: 'sidebar' } },
  ],
}
