import type { Payload } from 'payload'
import type { TaskClass } from 'payload-ai-core'

export interface ImageSource {
  url?: string
  /** base64 (no data: prefix) */
  data?: string
  mediaType?: string
}

export interface AiMediaOptions {
  /** Upload collections to enhance. Default ['media'] when it exists and is an upload collection. */
  collections?: string[]
  /** Queue alt text + tags when an image is uploaded. Default true. */
  describeOnUpload?: boolean
  /** Replace existing alt text. Default false (only empty alt is filled). */
  overwriteAlt?: boolean
  /** Alt text field name. Default 'alt'. */
  altField?: string
  /** Field for AI tags (added as text hasMany when missing), or false to skip tags. Default 'aiTags'. */
  tagsField?: string | false
  /** Locales to write alt text for (when alt is localized). Default: the default locale. */
  locales?: string[]
  /** Task class for alt text / tags (vision required). Default 'fast'. */
  describeTask?: Extract<TaskClass, 'fast' | 'chat'>
  /** Jobs queue name. Default 'default'. */
  queue?: string
  /** Largest local file sent inline to the model. Default 10 MB. */
  maxImageBytes?: number
  /** Custom image access (e.g. private S3 buckets). Return undefined to fall back to the built-in resolver. */
  resolveImage?: (doc: Record<string, unknown>, args: { payload: Payload; collection: string }) => Promise<ImageSource | undefined>
}
