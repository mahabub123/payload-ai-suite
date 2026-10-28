import type { CollectionConfig, Field } from 'payload'
import { access } from 'payload-ai-core'
import { SLUGS } from './constants'

const group = 'AI Suite'

/**
 * Search/click/impression log. No PII: session ids are hashed, no user/customer ids.
 * Only the module's endpoints write (overrideAccess); staff read.
 */
export const searchEventsCollection: CollectionConfig = {
  slug: SLUGS.events,
  labels: { singular: 'Search event', plural: 'Search events' },
  admin: { group, useAsTitle: 'query', defaultColumns: ['type', 'query', 'resultCount', 'mode', 'createdAt'] },
  access: { read: access.staff, create: access.nobody, update: access.nobody, delete: access.admin },
  timestamps: true,
  fields: [
    {
      name: 'type',
      type: 'select',
      required: true,
      index: true,
      options: ['search', 'click', 'add-to-cart', 'impression'],
    },
    { name: 'searchId', type: 'text', index: true },
    { name: 'query', type: 'text' },
    { name: 'normalizedQuery', type: 'text', index: true },
    { name: 'filters', type: 'json' },
    { name: 'resultIds', type: 'json' },
    { name: 'resultCount', type: 'number' },
    { name: 'zeroResults', type: 'checkbox', index: true, defaultValue: false },
    { name: 'offeringId', type: 'text', index: true },
    { name: 'position', type: 'number' },
    { name: 'sessionId', type: 'text', index: true, admin: { description: 'Hashed session id (joining only).' } },
    { name: 'latencyMs', type: 'number' },
    { name: 'mode', type: 'select', options: ['hybrid', 'keyword'] },
    { name: 'source', type: 'select', options: ['storefront', 'assistant', 'api'], defaultValue: 'storefront' },
  ],
}

export const recsCollection: CollectionConfig = {
  slug: SLUGS.recs,
  labels: { singular: 'Recommendation list', plural: 'Recommendation lists' },
  admin: { group, useAsTitle: 'offeringId', defaultColumns: ['offeringId', 'kind', 'computedAt'] },
  access: { read: access.staff, create: access.admin, update: access.admin, delete: access.admin },
  fields: [
    { name: 'offeringId', type: 'text', required: true, index: true },
    { name: 'kind', type: 'select', required: true, index: true, options: ['similar', 'bought-together'] },
    { name: 'items', type: 'json', admin: { description: '[{ id, score }] ordered best first' } },
    { name: 'computedAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
  ],
}

const suggestionStatus: Field = {
  name: 'status',
  type: 'select',
  defaultValue: 'pending',
  options: ['pending', 'approved', 'rejected'],
}

/** Weekly learning report. Content staff approve synonyms; approved synonyms apply at query time. */
export const searchReportsCollection: CollectionConfig = {
  slug: SLUGS.reports,
  labels: { singular: 'Search report', plural: 'Search reports' },
  admin: { group, useAsTitle: 'title', defaultColumns: ['title', 'searches', 'zeroResultRate', 'createdAt'] },
  access: { read: access.staff, create: access.admin, update: access.roles('content'), delete: access.admin },
  timestamps: true,
  fields: [
    { name: 'title', type: 'text' },
    { name: 'periodStart', type: 'date' },
    { name: 'periodEnd', type: 'date' },
    { name: 'searches', type: 'number' },
    { name: 'zeroResultRate', type: 'number' },
    { name: 'zeroResultQueries', type: 'json', admin: { description: '[{ query, searches }]' } },
    { name: 'lowClickQueries', type: 'json', admin: { description: '[{ query, searches, clicks, ctr }]' } },
    {
      name: 'synonyms',
      type: 'array',
      admin: { description: 'AI-suggested synonyms. Set status to approved to apply them to search.' },
      fields: [
        { name: 'term', type: 'text', required: true },
        { name: 'synonyms', type: 'text', required: true, admin: { description: 'Comma separated' } },
        suggestionStatus,
      ],
    },
    {
      name: 'missingProducts',
      type: 'array',
      admin: { description: 'Products shoppers looked for but the catalog lacks.' },
      fields: [
        { name: 'query', type: 'text', required: true },
        { name: 'suggestion', type: 'textarea' },
        suggestionStatus,
      ],
    },
    { name: 'aiError', type: 'text', admin: { readOnly: true } },
  ],
}
