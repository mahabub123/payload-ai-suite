import { z } from 'zod'

/**
 * Segments are structured filters evaluated in code over adapter data (design doc §8, §10.4).
 * Every object is strict: the model cannot smuggle SQL or free-form query strings in.
 */
export const comparison = z.enum(['gt', 'gte', 'lt', 'lte', 'eq'])
export type Comparison = z.infer<typeof comparison>

const withinDays = z.number().int().positive().max(3650).optional()
const id = z.string().min(1).max(100)

export const segmentCondition = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('purchasedCategory'), categoryIds: z.array(id).min(1).max(50), withinDays }),
  z.strictObject({ type: z.literal('purchasedOffering'), offeringIds: z.array(id).min(1).max(50), withinDays }),
  z.strictObject({ type: z.literal('orderCount'), op: comparison, value: z.number().int().min(0), withinDays }),
  z.strictObject({ type: z.literal('lastOrderDaysAgo'), op: comparison, value: z.number().int().min(0) }),
  /** Amount in integer minor units. */
  z.strictObject({ type: z.literal('totalSpent'), op: comparison, amount: z.number().int().min(0), withinDays }),
  z.strictObject({ type: z.literal('marketingOptIn'), value: z.boolean() }),
  z.strictObject({ type: z.literal('signedUpDaysAgo'), op: comparison, value: z.number().int().min(0) }),
])
export type SegmentCondition = z.infer<typeof segmentCondition>

export const segmentDefinition = z.strictObject({
  match: z.enum(['all', 'any']),
  conditions: z.array(segmentCondition).min(1).max(12),
})
export type SegmentDefinition = z.infer<typeof segmentDefinition>

/** What the reason model returns for a staff description. */
export const segmentProposal = z.strictObject({
  definition: segmentDefinition,
  explanation: z.string().max(600),
})
export type SegmentProposal = z.infer<typeof segmentProposal>
