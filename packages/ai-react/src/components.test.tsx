import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { AISuiteProvider } from './provider'
import { AssistantWidget } from './components/AssistantWidget'
import { CardView } from './components/cards'
import type { Card } from 'payload-ai-core/wire'

const cards: Card[] = [
  { type: 'products', items: [{ id: 'p1', title: 'Red <b>Dress</b>', price: { amount: 250000, currency: 'BDT' }, inStock: true, stock: 3, categoryIds: [], url: '/p/1' }] },
  { type: 'stock', offeringId: 'p1', inStock: false, stock: 0 },
  { type: 'cart', cart: { id: 'c', items: [{ offeringId: 'p1', title: 'Red Dress', quantity: 2, price: { amount: 250000, currency: 'BDT' } }], subtotal: { amount: 500000, currency: 'BDT' } } },
  { type: 'order', order: { id: 'o1', number: '1001', status: 'shipped', total: { amount: 100, currency: 'USD' }, createdAt: '2026-10-01T00:00:00Z', itemCount: 1, items: [{ offeringId: 'p1', title: 'Dress', quantity: 1, price: { amount: 100, currency: 'USD' } }], shipping: { trackingUrl: 'javascript:alert(1)', trackingNumber: 'TRK1' } } },
  { type: 'orders', orders: [{ id: 'o1', number: '1001', status: 'shipped', total: { amount: 100, currency: 'USD' }, createdAt: '2026-10-01T00:00:00Z', itemCount: 1 }] },
  { type: 'confirmation', actionId: 'a1', tool: 'proposeReturn', title: 'Return request for order 1001', summary: '1 × Dress', expiresAt: '2100-01-01T00:00:00Z' },
  { type: 'handoff', ticketId: 't1', expectedReply: 'within 2 hours' },
  { type: 'slots', offeringId: 's1', slots: [{ start: '2026-11-01T10:00:00Z', end: '2026-11-01T11:00:00Z' }] },
  { type: 'booking', bookingId: 'b1', status: 'tentative', slot: { start: '2026-11-01T10:00:00Z', end: '2026-11-01T11:00:00Z' } },
  { type: 'lead', leadId: 'l1' },
  { type: 'citations', citations: [{ title: 'Returns', url: 'javascript:alert(1)', sourceCollection: 'pages', sourceId: '1' }] },
  { type: 'verify', reason: 'order-lookup', methods: ['login', 'order-email-otp'] },
  { type: 'chart', title: 'Sales', kind: 'bar', series: [{ name: 'BDT', points: [{ x: 'Mon', y: 3 }, { x: 'Tue', y: 5 }] }] },
  { type: 'chart', title: 'Mix', kind: 'pie', series: [{ name: 'cat', points: [{ x: 'A', y: 1 }, { x: 'B', y: 2 }] }] },
  { type: 'chart', title: 'Trend', kind: 'line', series: [{ name: 'x', points: [{ x: 1, y: 1 }, { x: 2, y: 4 }] }] },
  { type: 'chart', title: 'Tbl', kind: 'table', series: [{ name: 'x', points: [{ x: 1, y: 1 }] }] },
  { type: 'action-result', actionId: 'a1', status: 'done', message: 'Submitted' },
]

describe('components (SSR)', () => {
  it('renders every card type safely', () => {
    const verify = { status: 'idle', start: () => undefined, confirm: () => undefined }
    const html = renderToString(
      <>
        {cards.map((c, i) => (
          <CardView key={i} card={c} locale="en-US" verify={verify} onConfirm={() => undefined} onReject={() => undefined} />
        ))}
      </>,
    )
    expect(html).toContain('Red &lt;b&gt;Dress&lt;/b&gt;')
    expect(html).toContain('BDT')
    expect(html).toContain('Out of stock')
    expect(html).toContain('Confirm')
    expect(html).toContain('within 2 hours')
    expect(html).toContain('Order number')
    expect(html).toContain('<svg')
    expect(html).not.toContain('javascript:')
  })

  it('renders the widget panel with AI notice and an aria-live log', () => {
    const html = renderToString(
      <AISuiteProvider locale="bn">
        <AssistantWidget defaultOpen greeting="হ্যালো!" />
      </AISuiteProvider>,
    )
    expect(html).toContain('role="log"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('AI সহকারী')
    expect(html).toContain('হ্যালো!')
    expect(html).toContain('aria-expanded="true"')
  })
})
