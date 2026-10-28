import { describe, expect, it, vi } from 'vitest'
import type { CollectionAfterChangeHook, Config } from 'payload'
import { SUITE_KEY } from '@payload-ai-suite/ai-core'
import { aiSupport } from './index'
import { queueTriageHook } from './extend'

const existingHook: CollectionAfterChangeHook = ({ doc }) => doc

const base = (opts: { tickets?: boolean; reviews?: string[] } = {}): Config =>
  ({
    collections: [
      ...(opts.tickets === false ? [] : [{ slug: 'ai-tickets', fields: [{ name: 'subject', type: 'text' }], hooks: { afterChange: [existingHook] } }]),
      { slug: 'reviews', fields: [], hooks: { afterChange: [existingHook] } },
    ],
    custom: {
      [SUITE_KEY]: {
        coreInstalled: true,
        modules: [],
        options: { adapters: { preset: 'test', mappedCollections: () => ({ review: opts.reviews ?? ['reviews'] }), build: () => ({}), validate: () => [] } },
      },
    },
  }) as unknown as Config

describe('aiSupport plugin', () => {
  it('throws a clear error when ai-tickets is missing', () => {
    expect(() => aiSupport()(base({ tickets: false }))).toThrow(/ai-tickets.*owned by ai-core/)
  })

  it('preserves existing hooks and adds triage + moderation hooks, fields and admin components', async () => {
    const cfg = (await aiSupport()(base())) as Config
    const tickets = cfg.collections!.find((c) => c.slug === 'ai-tickets')!
    expect(tickets.hooks!.afterChange).toEqual([existingHook, queueTriageHook])
    const names = tickets.fields.map((f) => ('name' in f ? f.name : ''))
    expect(names).toEqual(expect.arrayContaining(['subject', 'replies', 'triagedAt', 'triageConfidence', 'aiSupportPanel']))
    expect(tickets.admin!.components!.edit!.beforeDocumentControls).toEqual(['@payload-ai-suite/ai-support/client#SuggestReplyButton'])
    const reviews = cfg.collections!.find((c) => c.slug === 'reviews')!
    expect(reviews.hooks!.afterChange).toHaveLength(2)
    expect(reviews.hooks!.afterChange![0]).toBe(existingHook)
    expect(cfg.collections!.map((c) => c.slug)).toEqual(expect.arrayContaining(['ai-review-insights', 'ai-review-flags']))
    expect(cfg.jobs!.tasks!.map((t) => t.slug)).toEqual(['ai-support-triage', 'ai-support-review-moderate', 'ai-support-review-insights'])
  })

  it('reviewModeration: false adds no review hook', async () => {
    const cfg = (await aiSupport({ reviewModeration: false })(base())) as Config
    expect(cfg.collections!.find((c) => c.slug === 'reviews')!.hooks!.afterChange).toEqual([existingHook])
  })

  it('triage hook queues a job on create only, and never for internal writes', async () => {
    const queue = vi.fn(async () => ({}))
    const req = { payload: { jobs: { queue }, logger: { error: vi.fn() } } } as never
    const args = { doc: { id: 7 }, req, context: {}, collection: { slug: 'ai-tickets' } } as never
    await queueTriageHook({ ...(args as object), operation: 'create' } as never)
    await queueTriageHook({ ...(args as object), operation: 'update' } as never)
    await queueTriageHook({ ...(args as object), operation: 'create', context: { aiSupportInternal: true } } as never)
    expect(queue).toHaveBeenCalledTimes(1)
    expect(queue).toHaveBeenCalledWith(expect.objectContaining({ task: 'ai-support-triage', input: { ticketId: '7', tenant: undefined } }))
  })
})
