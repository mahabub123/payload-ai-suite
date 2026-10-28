import { describe, expect, it } from 'vitest'
import { createMediaHarness } from '../test/setup'
import { DESCRIBE_TASK, SKIP_CONTEXT_KEY } from './constants'
import { describeMedia } from './describe'
import { describeOnUpload } from './hooks'

const runHook = (hook: ReturnType<typeof describeOnUpload>, payload: any, args: Record<string, any>) =>
  hook({
    collection: { slug: 'media' } as never,
    context: args.context ?? {},
    data: args.doc,
    doc: args.doc,
    previousDoc: args.previousDoc ?? {},
    operation: args.operation ?? 'create',
    req: { payload, context: args.reqContext ?? {} } as never,
  } as never)

describe('describe-on-upload hook', () => {
  it('queues the job for new images only', async () => {
    const h = createMediaHarness()
    const hook = describeOnUpload({})
    await runHook(hook, h.payload, { doc: { id: 'm9', filename: 'x.jpg', mimeType: 'image/jpeg' } })
    await runHook(hook, h.payload, { doc: { id: 'pdf', filename: 'x.pdf', mimeType: 'application/pdf' } })
    await runHook(hook, h.payload, {
      operation: 'update',
      doc: { id: 'm1', filename: 'saree.jpg', mimeType: 'image/jpeg', alt: 'edited' },
      previousDoc: { id: 'm1', filename: 'saree.jpg' },
    })
    const queued = h.payload.calls.filter((c) => c.op === 'queue')
    expect(queued).toHaveLength(1)
    expect(queued[0].args).toMatchObject({ task: DESCRIBE_TASK, input: { collection: 'media', id: 'm9' } })
  })

  it('recursion guard: writes made by the job (skip context) never re-queue', async () => {
    const h = createMediaHarness()
    const hook = describeOnUpload({})
    // Wire the hook into the fake payload so the job's own update triggers afterChange like Payload does.
    const update = h.payload.update.bind(h.payload)
    ;(h.payload as any).update = async (args: any) => {
      const previousDoc = h.payload.store.get('media')!.get(String(args.id))
      const doc: any = await update(args)
      await runHook(hook, h.payload, { operation: 'update', doc: { ...doc, filename: `${doc.filename}` }, previousDoc: { ...previousDoc, filename: 'changed-to-force' }, context: args.context })
      return doc
    }
    h.services.provider.enqueue({ object: { alt: 'Red saree', tags: ['saree'] } })
    await runHook(hook, h.payload, { doc: { id: 'm1', filename: 'saree.jpg', mimeType: 'image/jpeg' } })
    await describeMedia(h.payload, { collection: 'media', id: 'm1' }, {}, h.services)
    expect(h.payload.calls.filter((c) => c.op === 'queue')).toHaveLength(1)
    expect(h.payload.calls.find((c) => c.op === 'update')?.args.context[SKIP_CONTEXT_KEY]).toBe(true)
  })

  it('skips AI-generated images, aiExclude docs, and respects describeOnUpload: false', async () => {
    const h = createMediaHarness()
    await runHook(describeOnUpload({}), h.payload, { doc: { id: 'g', filename: 'g.png', mimeType: 'image/png', aiGenerated: true } })
    await runHook(describeOnUpload({}), h.payload, { doc: { id: 'e', filename: 'e.png', mimeType: 'image/png', aiExclude: true } })
    await runHook(describeOnUpload({ describeOnUpload: false }), h.payload, { doc: { id: 'n', filename: 'n.png', mimeType: 'image/png' } })
    await runHook(describeOnUpload({}), h.payload, { doc: { id: 'r', filename: 'r.png', mimeType: 'image/png' }, reqContext: { [SKIP_CONTEXT_KEY]: true } })
    expect(h.payload.calls.filter((c) => c.op === 'queue')).toHaveLength(0)
  })

  it('never fails the upload when queueing throws', async () => {
    const h = createMediaHarness()
    ;(h.payload as any).jobs.queue = async () => {
      throw new Error('db down')
    }
    const doc = { id: 'm9', filename: 'x.jpg', mimeType: 'image/jpeg' }
    await expect(runHook(describeOnUpload({}), h.payload, { doc })).resolves.toBe(doc)
  })
})
