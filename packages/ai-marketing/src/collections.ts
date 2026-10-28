import type { CollectionBeforeChangeHook, CollectionConfig, Field } from 'payload'
import { access } from '@payload-ai-suite/ai-core'
import type { ResolvedMarketingOptions } from './options'
import { SLUGS, userId } from './util'
import { approvalHash } from './campaigns/send'
import { CAMPAIGN_KINDS, CAMPAIGN_STATUSES, type CampaignDoc } from './campaigns/types'

const group = 'AI Suite'
/** Fields only the module's own code (overrideAccess) may write. */
const systemOnly = { create: () => false, update: () => false }

export const segmentsCollection = (o: ResolvedMarketingOptions): CollectionConfig => ({
  slug: SLUGS.segments,
  admin: { group, useAsTitle: 'name', defaultColumns: ['name', 'size', 'refreshedAt'] },
  access: { read: access.staff, create: access.staff, update: access.staff, delete: access.roles(o.approvalRole) },
  timestamps: true,
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'description', type: 'textarea' },
    {
      name: 'definition',
      type: 'json',
      required: true,
      admin: { description: 'Structured filter (never SQL). Create it from the segment preview endpoint.' },
    },
    { name: 'size', type: 'number', admin: { readOnly: true, position: 'sidebar' } },
    { name: 'sample', type: 'json', admin: { readOnly: true, description: 'Up to 10 members, emails masked.' } },
    { name: 'refreshedAt', type: 'date', admin: { readOnly: true, position: 'sidebar' } },
  ],
})

const stepFields: Field[] = [
  { name: 'delayHours', type: 'number', min: 0, defaultValue: 0, admin: { description: 'Hours after the previous step (or the trigger).' } },
  { name: 'subjectVariants', type: 'array', maxRows: 5, fields: [{ name: 'subject', type: 'text', required: true }] },
  { name: 'chosenSubject', type: 'text' },
  { name: 'markdown', type: 'textarea', admin: { description: 'Source Markdown; html/text are rendered from it.' } },
  { name: 'html', type: 'code', admin: { language: 'html' } },
  { name: 'text', type: 'textarea' },
  { name: 'productBlocks', type: 'json' },
]

/** Any content edit after approval revokes the approval. */
const revokeApprovalOnEdit: CollectionBeforeChangeHook = ({ data, originalDoc, operation }) => {
  if (operation !== 'update' || !originalDoc) return data
  const merged = { ...originalDoc, ...data } as CampaignDoc
  const pinned = (data.approvedHash !== undefined ? data.approvedHash : originalDoc.approvedHash) as string | null | undefined
  if (pinned && ['approved', 'scheduled', 'sending'].includes(merged.status) && approvalHash(merged) !== pinned) {
    return { ...data, status: 'draft', approvedAt: null, approvedBy: null, approvedHash: null }
  }
  return data
}

const setAuthor: CollectionBeforeChangeHook = ({ data, operation, req }) =>
  operation === 'create' ? { ...data, author: userId(req) ?? data.author } : data

export const campaignsCollection = (o: ResolvedMarketingOptions): CollectionConfig => ({
  slug: SLUGS.campaigns,
  admin: {
    group,
    useAsTitle: 'name',
    defaultColumns: ['name', 'kind', 'status', 'approvedAt'],
    components: {
      edit: { beforeDocumentControls: ['@payload-ai-suite/ai-marketing/client#CampaignApproval'] },
    },
  },
  access: { read: access.staff, create: access.staff, update: access.staff, delete: access.roles(o.approvalRole) },
  timestamps: true,
  hooks: { beforeChange: [setAuthor, revokeApprovalOnEdit] },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'kind', type: 'select', required: true, defaultValue: 'one-off', options: CAMPAIGN_KINDS },
    { name: 'segment', type: 'relationship', relationTo: SLUGS.segments as never, admin: { description: 'Audience (one-off and win-back).' } },
    { name: 'steps', type: 'array', minRows: 1, fields: stepFields },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: CAMPAIGN_STATUSES,
      access: { update: () => false },
      admin: { position: 'sidebar', readOnly: true },
    },
    { name: 'author', type: 'text', access: systemOnly, admin: { position: 'sidebar', readOnly: true } },
    { name: 'approvedBy', type: 'text', access: systemOnly, admin: { position: 'sidebar', readOnly: true } },
    { name: 'approvedAt', type: 'date', access: systemOnly, admin: { position: 'sidebar', readOnly: true } },
    { name: 'approvedHash', type: 'text', access: systemOnly, admin: { hidden: true } },
    { name: 'scheduledAt', type: 'date', admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } } },
  ],
})

export const draftsCollection = (o: ResolvedMarketingOptions): CollectionConfig => ({
  slug: SLUGS.drafts,
  admin: { group, useAsTitle: 'subject', defaultColumns: ['subject', 'status', 'sentAt', 'campaign'] },
  access: { read: access.roles(o.approvalRole), create: access.nobody, update: access.nobody, delete: access.admin },
  timestamps: true,
  fields: [
    { name: 'campaign', type: 'relationship', relationTo: SLUGS.campaigns as never, required: true, index: true },
    { name: 'step', type: 'number', required: true, defaultValue: 0 },
    { name: 'recipientHash', type: 'text', index: true },
    { name: 'email', type: 'email' },
    { name: 'customerId', type: 'text' },
    { name: 'ref', type: 'text', admin: { description: 'Cart/order id for triggered sequences.' } },
    { name: 'subject', type: 'text' },
    { name: 'html', type: 'code', admin: { language: 'html' } },
    { name: 'text', type: 'textarea' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'queued',
      index: true,
      options: ['queued', 'sending', 'sent', 'failed', 'skipped'],
    },
    { name: 'idempotencyKey', type: 'text', required: true, unique: true, index: true },
    { name: 'attempts', type: 'number', defaultValue: 0 },
    { name: 'sentAt', type: 'date', index: true },
    { name: 'error', type: 'text' },
  ],
})

export const unsubscribesCollection = (o: ResolvedMarketingOptions): CollectionConfig => ({
  slug: SLUGS.unsubscribes,
  admin: { group, useAsTitle: 'emailHash', defaultColumns: ['emailHash', 'source', 'createdAt'] },
  access: { read: access.roles(o.approvalRole), create: access.nobody, update: access.nobody, delete: access.admin },
  timestamps: true,
  fields: [
    { name: 'emailHash', type: 'text', required: true, unique: true, index: true },
    { name: 'campaign', type: 'text' },
    { name: 'source', type: 'select', options: ['link', 'one-click', 'manual'], defaultValue: 'link' },
  ],
})

export const marketingCollections = (o: ResolvedMarketingOptions): CollectionConfig[] => [
  segmentsCollection(o),
  campaignsCollection(o),
  draftsCollection(o),
  unsubscribesCollection(o),
]
