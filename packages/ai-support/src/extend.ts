import type { CollectionAfterChangeHook, CollectionConfig, Config, Field } from 'payload'
import { getSuiteState } from 'payload-ai-core'
import type { AICoreOptions } from 'payload-ai-core'
import type { ResolvedSupportOptions } from './options'
import { INTERNAL, SLUGS, TASKS, queueJob, relId } from './util'

const hasField = (fields: Field[], name: string) => fields.some((f) => 'name' in f && f.name === name)

/** Fields ai-support adds to the core-owned ai-tickets collection. */
export const ticketExtraFields: Field[] = [
  {
    name: 'aiSupportPanel',
    type: 'ui',
    admin: { components: { Field: 'payload-ai-support/client#TicketAIPanel' } },
  },
  {
    name: 'replies',
    type: 'array',
    admin: { readOnly: true, initCollapsed: true },
    fields: [
      { name: 'body', type: 'textarea', required: true },
      { name: 'html', type: 'textarea', admin: { hidden: true } },
      { name: 'channel', type: 'select', options: ['email', 'hook'] },
      { name: 'auto', type: 'checkbox' },
      { name: 'sentAt', type: 'date' },
      { name: 'sentBy', type: 'text' },
    ],
  },
  { name: 'triageConfidence', type: 'number', min: 0, max: 1, admin: { readOnly: true, position: 'sidebar' } },
  { name: 'triagedAt', type: 'date', admin: { readOnly: true, position: 'sidebar' } },
  { name: 'autoAnswered', type: 'checkbox', admin: { readOnly: true, position: 'sidebar' } },
]

export const queueTriageHook: CollectionAfterChangeHook = async ({ doc, operation, req, context }) => {
  if (operation !== 'create' || context?.[INTERNAL]) return doc
  try {
    await queueJob(req.payload, TASKS.triage, { ticketId: String(doc.id), tenant: relId(doc.tenant) }, { req })
  } catch (e) {
    // Never block ticket creation (e.g. assistant hand-off) because the queue is unavailable.
    req.payload.logger.error(`[ai-support] could not queue triage for ticket ${String(doc.id)}: ${(e as Error).message}`)
  }
  return doc
}

export const queueModerationHook: CollectionAfterChangeHook = async ({ doc, operation, req, collection }) => {
  if (operation !== 'create') return doc
  try {
    await queueJob(req.payload, TASKS.reviewModerate, { collection: collection.slug, id: String(doc.id), tenant: relId(doc.tenant) }, { req })
  } catch (e) {
    req.payload.logger.error(`[ai-support] could not queue moderation for review ${String(doc.id)}: ${(e as Error).message}`)
  }
  return doc
}

export const extendTickets = (c: CollectionConfig): CollectionConfig => {
  const components = c.admin?.components
  return {
    ...c,
    fields: [...c.fields, ...ticketExtraFields.filter((f) => !('name' in f) || !hasField(c.fields, f.name))],
    hooks: { ...c.hooks, afterChange: [...(c.hooks?.afterChange ?? []), queueTriageHook] },
    admin: {
      ...c.admin,
      components: {
        ...components,
        edit: {
          ...components?.edit,
          beforeDocumentControls: [
            ...(components?.edit?.beforeDocumentControls ?? []),
            'payload-ai-support/client#SuggestReplyButton',
          ],
        },
      },
    },
  }
}

/** Review collections from the configured adapter provider (config time, no Payload instance). */
export const reviewCollectionSlugs = (config: Config): string[] => {
  const options = getSuiteState(config)?.options as AICoreOptions | undefined
  return options?.adapters?.mappedCollections().review ?? []
}

export const extendSupportConfig =
  (o: ResolvedSupportOptions) =>
  (config: Config): Config => {
    const collections = config.collections ?? []
    if (!collections.some((c) => c.slug === SLUGS.tickets)) {
      throw new Error(
        `[ai-support] The "${SLUGS.tickets}" collection is missing. It is owned by ai-core: install aiCore() (with its tickets collection) before aiSupport().`,
      )
    }
    const reviewSlugs = o.reviewModeration ? reviewCollectionSlugs(config) : []
    return {
      ...config,
      collections: collections.map((c) => {
        if (c.slug === SLUGS.tickets) return extendTickets(c)
        if (reviewSlugs.includes(c.slug)) {
          return { ...c, hooks: { ...c.hooks, afterChange: [...(c.hooks?.afterChange ?? []), queueModerationHook] } }
        }
        return c
      }),
    }
  }
