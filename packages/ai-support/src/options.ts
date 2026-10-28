export const DEFAULT_TOPICS = [
  'order-status',
  'shipping',
  'store-hours',
  'returns-policy',
  'refund',
  'product-question',
  'payment',
  'account',
  'complaint',
  'other',
] as const

export const DEFAULT_AUTO_ANSWER_TOPICS = ['order-status', 'shipping', 'store-hours', 'returns-policy']

export interface AiSupportOptions {
  /** Minimum triage confidence (0..1) for an automatic answer. Default 0.85. */
  autoAnswerConfidence?: number
  /** Allow-list of topics that may be answered automatically. Default order-status, shipping, store-hours, returns-policy. Use [] to disable. */
  autoAnswerTopics?: string[]
  /** Topics the triage model picks from. 'other' is always added. */
  topics?: string[]
  /** Classify new reviews (abuse/spam) and hold flagged ones. Default true. */
  reviewModeration?: boolean
}

export interface ResolvedSupportOptions {
  autoAnswerConfidence: number
  autoAnswerTopics: string[]
  topics: [string, ...string[]]
  reviewModeration: boolean
}

export const resolveOptions = (o: AiSupportOptions = {}): ResolvedSupportOptions => {
  const topics = [...new Set([...(o.topics ?? DEFAULT_TOPICS), 'other'])] as [string, ...string[]]
  const confidence = o.autoAnswerConfidence ?? 0.85
  if (!(confidence > 0 && confidence <= 1)) throw new Error('[ai-support] autoAnswerConfidence must be in (0, 1]')
  return {
    autoAnswerConfidence: confidence,
    autoAnswerTopics: (o.autoAnswerTopics ?? DEFAULT_AUTO_ANSWER_TOPICS).filter((t) => topics.includes(t)),
    topics,
    reviewModeration: o.reviewModeration ?? true,
  }
}
