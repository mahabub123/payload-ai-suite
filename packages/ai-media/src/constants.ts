export const MODULE = 'media'
export const DESCRIBE_TASK = 'ai-media-describe'
/** Set on `req.context` / Local API `context` for writes made by this module so afterChange does not re-queue. */
export const SKIP_CONTEXT_KEY = 'aiMediaSkip'
export const IMAGE_OPS = ['remove-background', 'variation', 'lifestyle'] as const
export type ImageOp = (typeof IMAGE_OPS)[number]
export const MEDIA_OPS = ['alt-text', 'tag', ...IMAGE_OPS, 'image-to-listing'] as const
export type MediaOp = (typeof MEDIA_OPS)[number]
