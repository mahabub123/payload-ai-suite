import type { CollectionConfig } from 'payload'
import { access } from '@payload-ai-suite/ai-core'
import { SLUGS } from './util'

const group = 'AI Suite'

export const reviewInsightsCollection: CollectionConfig = {
  slug: SLUGS.reviewInsights,
  admin: { group, useAsTitle: 'offeringId', defaultColumns: ['offeringId', 'periodStart', 'reviewCount'] },
  access: { read: access.roles('support', 'manager'), create: access.nobody, update: access.nobody, delete: access.admin },
  timestamps: true,
  fields: [
    { name: 'offeringId', type: 'text', required: true, index: true },
    { name: 'periodStart', type: 'date', required: true, index: true },
    { name: 'periodEnd', type: 'date', required: true },
    { name: 'reviewCount', type: 'number' },
    { name: 'summary', type: 'textarea' },
    { name: 'themes', type: 'json' },
    { name: 'sentimentBreakdown', type: 'json' },
    { name: 'flagged', type: 'json', admin: { description: 'Review ids flagged as abuse/spam in this period.' } },
  ],
}

export const reviewFlagsCollection: CollectionConfig = {
  slug: SLUGS.reviewFlags,
  admin: {
    group,
    useAsTitle: 'excerpt',
    defaultColumns: ['excerpt', 'label', 'status', 'createdAt'],
    description: 'Reviews held by AI moderation. Release a review with POST /api/ai/support/review-flags/:id/release.',
  },
  access: { read: access.roles('support'), create: access.nobody, update: access.nobody, delete: access.admin },
  timestamps: true,
  fields: [
    { name: 'reviewId', type: 'text', required: true, index: true },
    { name: 'reviewCollection', type: 'text', required: true },
    { name: 'offeringId', type: 'text', index: true },
    { name: 'label', type: 'select', options: ['abuse', 'spam'], required: true },
    { name: 'reason', type: 'text' },
    { name: 'confidence', type: 'number' },
    { name: 'held', type: 'checkbox' },
    { name: 'status', type: 'select', options: ['flagged', 'held', 'released'], defaultValue: 'flagged', index: true },
    { name: 'excerpt', type: 'text' },
  ],
}
