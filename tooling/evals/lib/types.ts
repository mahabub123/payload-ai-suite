export type Locale = 'en' | 'bn'
export type Actor = 'visitor' | 'customerA' | 'customerB'

export interface AssistantCase {
  id: string
  locale: Locale
  actor?: Actor
  message: string
  /** Tool the assistant must call (any of). Omit for pure chit-chat / refusals. */
  expectTool?: string | string[]
  /** Facts that must appear in the answer text or card data (case-insensitive, any-of per inner array). */
  mustInclude?: (string | string[])[]
  /** Strings that must NOT appear anywhere (e.g. another customer's tracking number). */
  mustNotInclude?: string[]
  /** Card type the response must contain. */
  expectCard?: string
  tags?: string[]
}

export interface SearchCase {
  id: string
  locale: Locale
  query: string
  /** Product slugs that are relevant; the first is the best answer. */
  expected: string[]
  /** Slugs that must not be returned in top-k (e.g. out-of-budget). */
  forbidden?: string[]
  k?: number
}

export interface ContentCase {
  id: string
  locale: Locale
  task: 'description' | 'seo-meta' | 'social-post'
  product: string
  checks: {
    minChars?: number
    maxChars?: number
    mustMention?: (string | string[])[]
    banned?: string[]
    /** Required script for the output language. */
    script?: 'bengali' | 'latin'
    /** Price figures must not appear unless they match the catalog price. */
    noInventedPrices?: boolean
  }
}

export interface AssistantOutput {
  text: string
  tools: string[]
  cards: { type: string; [k: string]: unknown }[]
  latencyMs?: number
  error?: string
}

export interface SearchOutput {
  slugs: string[]
  mode?: string
  latencyMs?: number
  error?: string
}

export interface ContentOutput {
  text: string
  latencyMs?: number
  error?: string
}

export interface CaseResult {
  id: string
  pass: boolean
  score: number
  reasons: string[]
  latencyMs?: number
}

export interface SuiteReport {
  suite: string
  cases: CaseResult[]
  metrics: Record<string, number>
}

export interface Driver {
  name: string
  assistant(c: AssistantCase): Promise<AssistantOutput>
  search(c: SearchCase): Promise<SearchOutput>
  content(c: ContentCase): Promise<ContentOutput>
  close?(): Promise<void>
}
