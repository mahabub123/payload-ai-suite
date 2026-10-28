import type { CollectionAfterChangeHook } from 'payload'
import { DESCRIBE_TASK, SKIP_CONTEXT_KEY } from './constants'
import { isImage, tenantOf } from './image'
import type { AiMediaOptions } from './types'

/**
 * afterChange on media collections: queue alt text + tags for new image files.
 * Never throws (uploads must not fail because of AI); skips writes made by this module (recursion guard).
 */
export const describeOnUpload =
  (options: AiMediaOptions): CollectionAfterChangeHook =>
  async ({ doc, previousDoc, operation, req, context, collection }) => {
    if (options.describeOnUpload === false) return doc
    if (context?.[SKIP_CONTEXT_KEY] || req?.context?.[SKIP_CONTEXT_KEY]) return doc
    const d = doc as Record<string, any>
    const fileChanged = operation === 'create' || (d.filename && d.filename !== (previousDoc as Record<string, any> | undefined)?.filename)
    if (!fileChanged || !isImage(d) || d.aiExclude === true || d.aiGenerated === true) return doc
    try {
      const queue = req.payload.jobs.queue as unknown as (args: Record<string, unknown>) => Promise<unknown>
      const tenant = tenantOf(req.payload, d)
      await queue({
        task: DESCRIBE_TASK,
        input: { collection: collection.slug, id: String(d.id), ...(tenant != null ? { tenant: String(tenant) } : {}) },
        queue: options.queue,
        req,
      })
    } catch (e) {
      req.payload.logger?.error?.({ err: e, msg: '[ai-media] could not queue alt-text job' })
    }
    return doc
  }
