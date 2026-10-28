/** Public option types for the Content Studio module. */

/** Actions the Content Studio can run against a field (see prompts.ts for the prompt behind each). */
export type ContentAction =
  | 'write'
  | 'from-photo'
  | 'rewrite'
  | 'shorten'
  | 'tone'
  | 'translate'
  | 'seo'
  | 'faq'
  | 'blog'
  | 'landing'
  | 'attributes'
  | 'tags'
  | 'extract'

export const CONTENT_ACTIONS: readonly ContentAction[] = [
  'write',
  'from-photo',
  'rewrite',
  'shorten',
  'tone',
  'translate',
  'seo',
  'faq',
  'blog',
  'landing',
  'attributes',
  'tags',
  'extract',
]

export interface AiContentOptions {
  /**
   * Fields that get the AI button, per collection: `{ products: ['title', 'description', 'meta.title'] }`.
   * Dotted paths address fields inside named groups/tabs. A collection listed here replaces auto-detection
   * for that collection; collections not listed but mapped as the `offering` concept get every top-level
   * text / textarea / richText field (except slug-like ones).
   */
  fields?: Record<string, string[]>
  /** Auto-detect AI fields on the mapped offering collections. Default true. */
  autoDetectOfferingFields?: boolean
  /** Add an optional `aiTags` (text, hasMany) field to the offering collections. Default false. */
  aiTagsField?: boolean
  /** "Generate from photo / spec" panel in the sidebar of offering collections. Default true. */
  photoPanel?: boolean
  /** Bulk-enrich action above the list view of AI-enabled collections. Default true. */
  bulkAction?: boolean
  bulk?: {
    /** Parallel model calls when the route has no batch-capable model. Default 1 (sequential). */
    concurrency?: number
    /** Parallel calls (marked `needs: ['batch']`) when the route supports provider batch. Default 8. */
    batchConcurrency?: number
    /** Upper bound of documents per run. Default 500. */
    maxItems?: number
    /** Jobs queue name. Default 'default'. */
    queue?: string
  }
}

/** Resolved field kinds the studio can write to. */
export type TargetFieldType = 'text' | 'textarea' | 'richText'

export interface TargetFieldInfo {
  path: string
  type: TargetFieldType
  hasMany?: boolean
  maxLength?: number
  label?: string
  localized?: boolean
}

/** Body of POST /api/ai/content/generate. */
export interface GenerateRequestBody {
  action: ContentAction
  collection: string
  docId?: string | number
  field: string
  locale?: string
  instructions?: string
  /** Tone for 'tone' (e.g. "friendly", "premium"). */
  tone?: string
  /** Target locale for 'translate'. */
  targetLocale?: string
  /** Current (possibly unsaved) form values, used as context. */
  context?: Record<string, unknown>
  /** The field's current value (text, or Lexical JSON for rich text). */
  currentValue?: unknown
  imageUrl?: string
  /** Prompt slug override (custom template registered in ai-prompts). */
  template?: string
  /** Force JSON (false) or SSE (true). Default: SSE for long text into textarea/richText. */
  stream?: boolean
}

/** JSON response of the generate endpoint (non-streamed). */
export interface GenerateResponse {
  generationId: string
  action: ContentAction
  fieldType: TargetFieldType
  /** Text to place in the target field (Markdown for rich text). */
  output: string
  /** Structured result for seo / faq / attributes / tags / extract. */
  data?: unknown
  /** Value ready for the field: Lexical state for rich text, string[] for hasMany text. */
  value?: unknown
  model: string
  costMicros: number
}

export interface ExtractedDraft {
  title?: string
  description?: string
  attributes: Record<string, string | number | boolean | string[]>
  tags: string[]
  categoryIds: string[]
  categories: { id: string; title: string }[]
}
