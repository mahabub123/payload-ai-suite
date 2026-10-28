import type { CollectionConfig } from 'payload'
import { access } from '@payload-ai-suite/ai-core'

export const REPORTS = 'ai-insight-reports'

export const reportsCollection = (staffCollection: string): CollectionConfig => ({
  slug: REPORTS,
  labels: { singular: 'Insight report', plural: 'Insight reports' },
  admin: {
    group: 'AI Suite',
    useAsTitle: 'question',
    defaultColumns: ['question', 'kind', 'verification', 'createdAt'],
    description: 'Answers, briefings and anomaly alerts produced by AI Insights. Numbers come only from metric tools.',
  },
  access: {
    read: access.roles('manager'),
    create: access.nobody,
    update: access.admin,
    delete: access.admin,
  },
  fields: [
    { name: 'question', type: 'textarea', required: true },
    {
      name: 'kind',
      type: 'select',
      required: true,
      index: true,
      defaultValue: 'ask',
      options: ['ask', 'briefing', 'anomaly'],
    },
    {
      name: 'period',
      type: 'group',
      fields: [
        { name: 'from', type: 'date' },
        { name: 'to', type: 'date' },
        { name: 'label', type: 'text' },
      ],
    },
    { name: 'answer', type: 'textarea' },
    {
      name: 'verification',
      type: 'select',
      options: ['verified', 'corrected', 'stripped', 'computed'],
      admin: { description: 'Result of the number check: computed = written by code, not the model.' },
    },
    { name: 'metricCalls', type: 'json', admin: { description: 'Metric tool calls with inputs and outputs.' } },
    { name: 'charts', type: 'json' },
    { name: 'flagged', type: 'json', admin: { condition: (d) => d?.kind === 'anomaly' } },
    { name: 'dedupeKey', type: 'text', index: true, admin: { hidden: true } },
    { name: 'emailedAt', type: 'date', admin: { position: 'sidebar', readOnly: true } },
    { name: 'createdBy', type: 'relationship', relationTo: staffCollection as any, admin: { position: 'sidebar', readOnly: true } },
  ],
  timestamps: true,
})
