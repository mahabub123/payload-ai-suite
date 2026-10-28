import { describe, expect, it } from 'vitest'
import type { Card } from '@payload-ai-suite/ai-core'
import { formatMoney, renderCard, renderReply, splitMessage } from './render'

describe('card -> text', () => {
  it('uses prices and stock from the card, not from model text', () => {
    const card: Card = {
      type: 'products',
      items: [
        { id: 'p1', title: 'Red Saree', price: { amount: 250000, currency: 'BDT' }, inStock: true, categoryIds: [], url: 'https://shop.test/p/red' },
        { id: 'p2', title: 'Blue Kurta', price: { amount: 1999, currency: 'USD' }, compareAtPrice: { amount: 2999, currency: 'USD' }, inStock: false, categoryIds: [] },
      ],
    }
    // Model text claims a different price; the rendered card must still carry the tool's price.
    const out = renderReply('The Red Saree costs 999 taka!', [card])
    expect(out).toContain(formatMoney({ amount: 250000, currency: 'BDT' }))
    expect(out).toContain('2,500')
    expect(out).toContain('$19.99')
    expect(out).toContain('was $29.99')
    expect(out).toContain('(out of stock)')
    expect(out).toContain('https://shop.test/p/red')
  })

  it('renders order status and confirmation prompts with reply codes', () => {
    const order = renderCard({
      type: 'order',
      order: {
        id: 'o1',
        number: '1042',
        status: 'shipped',
        total: { amount: 5000, currency: 'USD' },
        createdAt: '2026-10-01',
        itemCount: 1,
        items: [{ offeringId: 'p', title: 'Mug', quantity: 2, price: { amount: 2500, currency: 'USD' } }],
        shipping: { status: 'in transit', carrier: 'DHL', trackingNumber: 'T123' },
      },
    })
    expect(order).toContain('Order 1042: shipped')
    expect(order).toContain('Total: $50.00')
    expect(order).toContain('Tracking: T123')
    const conf = renderCard(
      { type: 'confirmation', actionId: 'a1', tool: 'proposeReturn', title: 'Return Mug', summary: '2 x Mug', expiresAt: '2026-10-28T10:15:00Z' },
      { confirmCodes: { a1: 'K7P2QX' } },
    )
    expect(conf).toContain('Reply YES K7P2QX to confirm or NO K7P2QX to cancel')
  })

  it('handles zero-decimal currencies', () => {
    expect(formatMoney({ amount: 1500, currency: 'JPY' })).toContain('1,500')
  })
})

describe('splitMessage', () => {
  it('keeps every part within the channel limit (WhatsApp 4096, Messenger 2000)', () => {
    const para = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(30)
    const text = Array.from({ length: 8 }, () => para.trim()).join('\n\n')
    for (const max of [4096, 2000]) {
      const parts = splitMessage(text, max)
      expect(parts.length).toBeGreaterThan(1)
      for (const p of parts) expect(p.length).toBeLessThanOrEqual(max)
      expect(parts.join(' ').replace(/\s+/g, ' ')).toBe(text.replace(/\s+/g, ' '))
    }
  })

  it('prefers paragraph boundaries and hard-cuts unbroken runs', () => {
    expect(splitMessage('aaaa\n\nbbbb', 6)).toEqual(['aaaa', 'bbbb'])
    expect(splitMessage('x'.repeat(25), 10)).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)])
    expect(splitMessage('short', 2000)).toEqual(['short'])
    expect(splitMessage('   ', 10)).toEqual([])
  })
})
