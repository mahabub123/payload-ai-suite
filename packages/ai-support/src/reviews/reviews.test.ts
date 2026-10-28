import { describe, expect, it } from 'vitest'
import { setup } from '../../test/setup'
import { moderateReview } from './moderate'
import { buildReviewInsights } from './insights'

describe('review moderation', () => {
  it('holds a review classified as spam and records the flag for staff', async () => {
    const t = setup()
    const review = await t.payload.create({ collection: 'reviews' as never, data: { comment: 'BUY CHEAP FOLLOWERS at spam.example', product: 'p1' } as never })
    t.services.provider.enqueue({ object: { label: 'spam', confidence: 0.92, reason: 'advertising link' } })
    const r = await moderateReview(t.payload, t.services, { collection: 'reviews', id: String(review.id) })
    expect(r).toMatchObject({ flagged: true, label: 'spam', held: true })
    expect(t.held[String(review.id)]).toBe(true)
    const flags = [...t.payload.db_.get('ai-review-flags')!.values()]
    expect(flags).toEqual([expect.objectContaining({ reviewId: String(review.id), offeringId: 'p1', label: 'spam', status: 'held' })])
    expect(t.services.provider.calls[0].messages.at(-1)!.content).toContain('<review>')
  })

  it('leaves honest negative reviews alone', async () => {
    const t = setup()
    const review = await t.payload.create({ collection: 'reviews' as never, data: { comment: 'Fabric was thinner than expected.', product: 'p1' } as never })
    t.services.provider.enqueue({ object: { label: 'ok', confidence: 0.9, reason: '' } })
    const r = await moderateReview(t.payload, t.services, { collection: 'reviews', id: String(review.id) })
    expect(r).toMatchObject({ flagged: false, held: false })
    expect(t.held).toEqual({})
  })

  it('low-confidence spam guesses are not held', async () => {
    const t = setup()
    const review = await t.payload.create({ collection: 'reviews' as never, data: { comment: 'meh', product: 'p1' } as never })
    t.services.provider.enqueue({ object: { label: 'spam', confidence: 0.3, reason: 'short' } })
    expect(await moderateReview(t.payload, t.services, { collection: 'reviews', id: String(review.id) })).toMatchObject({ flagged: false })
  })
})

describe('weekly review insights', () => {
  it('summarises per offering with rating-based sentiment and is idempotent per period', async () => {
    const now = new Date('2026-10-28T06:00:00Z')
    const at = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString()
    const t = setup({}, [
      { id: 'r1', offeringId: 'p1', rating: 5, body: 'Lovely colour', createdAt: at(1) },
      { id: 'r2', offeringId: 'p1', rating: 2, body: 'Late delivery', createdAt: at(2) },
      { id: 'r3', offeringId: 'p2', rating: 4, body: 'Good', createdAt: at(3) },
      { id: 'old', offeringId: 'p1', rating: 1, body: 'old', createdAt: at(30) },
    ])
    const out = { object: { summary: 'Mostly positive.', themes: [{ theme: 'colour', sentiment: 'positive', mentions: 1 }] } }
    t.services.provider.enqueue(out, out, out, out)
    await buildReviewInsights(t.payload, t.services, { periodEnd: now })
    await buildReviewInsights(t.payload, t.services, { periodEnd: now })
    const rows = [...t.payload.db_.get('ai-review-insights')!.values()]
    expect(rows).toHaveLength(2)
    const p1 = rows.find((r) => r.offeringId === 'p1')!
    expect(p1).toMatchObject({ reviewCount: 2, sentimentBreakdown: { positive: 1, neutral: 0, negative: 1 }, summary: 'Mostly positive.' })
  })
})
