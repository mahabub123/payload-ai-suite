import { createHash } from 'node:crypto'
import type { Payload, PayloadRequest } from 'payload'
import { AIError } from '@payload-ai-suite/ai-core'
import type { Money } from '@payload-ai-suite/ai-core'

export const MODULE = 'marketing'

export const SLUGS = {
  segments: 'ai-segments',
  campaigns: 'ai-campaigns',
  drafts: 'ai-email-drafts',
  unsubscribes: 'ai-unsubscribes',
  recs: 'ai-recs',
} as const

export const TASKS = {
  send: 'ai-marketing-send',
  segmentRefresh: 'ai-marketing-segment-refresh',
  sequences: 'ai-marketing-sequences',
} as const

export const DAY_MS = 86_400_000

export const maskEmail = (email?: string): string | undefined => {
  if (!email) return undefined
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  return `${local.slice(0, 1)}***@${domain}`
}

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Plain-text alternative from Markdown (links kept as "text (url)"). */
export const markdownToText = (md: string): string =>
  md
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*/g, ''))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

export const formatMoney = (m: Money): string => {
  const major = m.amount / 100
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: m.currency }).format(major)
  } catch {
    return `${major.toFixed(2)} ${m.currency}`
  }
}

/** Stable hash of campaign content; approval pins it so edits after approval block sending. */
export const contentHash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex')

export const normEmail = (e: string): string => e.trim().toLowerCase()

/** Path param from the core-merged `params` input or Payload's routeParams. */
export const paramId = (input: unknown, req: PayloadRequest | undefined): string => {
  const fromInput = (input as { params?: { id?: unknown } } | undefined)?.params?.id
  const id = fromInput ?? req?.routeParams?.id
  if (id === undefined || id === null || id === '') throw new AIError('validation', 'Missing id')
  return String(id)
}

/** Payload's queue() is typed against generated job types; modules queue by slug. */
export const queueJob = async (
  payload: Payload,
  task: string,
  input: Record<string, unknown>,
  opts: { waitUntil?: Date; req?: PayloadRequest } = {},
): Promise<void> => {
  const queue = payload.jobs.queue as unknown as (args: {
    task: string
    input: Record<string, unknown>
    waitUntil?: Date
    req?: PayloadRequest
  }) => Promise<unknown>
  await queue({ task, input, waitUntil: opts.waitUntil, req: opts.req })
}

export const startOfUtcDay = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

export const userId = (req: PayloadRequest | undefined): string | undefined =>
  req?.user?.id !== undefined ? String(req.user.id) : undefined
