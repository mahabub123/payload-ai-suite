import type { Card, Money, OfferingSummary } from 'payload-ai-core'

/** Integer minor units -> localized string, using the currency's own fraction digits. */
export const formatMoney = (m: Money, locale = 'en'): string => {
  try {
    const f = new Intl.NumberFormat(locale, { style: 'currency', currency: m.currency })
    const digits = f.resolvedOptions().maximumFractionDigits ?? 2
    return f.format(m.amount / 10 ** digits)
  } catch {
    return `${(m.amount / 100).toFixed(2)} ${m.currency}`
  }
}

const stockLabel = (o: Pick<OfferingSummary, 'inStock' | 'stock'>): string =>
  o.inStock === undefined ? '' : o.inStock ? (typeof o.stock === 'number' ? ` (in stock: ${o.stock})` : ' (in stock)') : ' (out of stock)'

const offeringLine = (o: OfferingSummary, locale: string): string => {
  const price = o.price ? ` - ${formatMoney(o.price, locale)}` : ''
  const was = o.compareAtPrice && o.price && o.compareAtPrice.amount > o.price.amount ? ` (was ${formatMoney(o.compareAtPrice, locale)})` : ''
  return `* ${o.title}${price}${was}${stockLabel(o)}${o.url ? `\n  ${o.url}` : ''}`
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

const when = (iso: string, locale: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC'
}

export interface RenderOptions {
  locale?: string
  /** actionId -> short reply code for confirmation cards. */
  confirmCodes?: Record<string, string>
}

/**
 * Render one card as plain text for a messaging channel. Prices, stock and order data come from the
 * card (tool results), never from model text.
 */
export const renderCard = (card: Card, o: RenderOptions = {}): string => {
  const locale = o.locale ?? 'en'
  switch (card.type) {
    case 'products':
      return card.items.map((i) => offeringLine(i, locale)).join('\n')
    case 'product': {
      const p = card.offering
      const desc = p.description ? `\n${truncate(p.description.replace(/\s+/g, ' ').trim(), 300)}` : ''
      return `${offeringLine(p, locale)}${desc}`
    }
    case 'stock':
      return card.inStock ? (typeof card.stock === 'number' ? `In stock: ${card.stock} available.` : 'In stock.') : 'Out of stock.'
    case 'cart': {
      const lines = card.cart.items.map((i) => `* ${i.quantity} x ${i.title}${i.price ? ` - ${formatMoney(i.price, locale)}` : ''}`)
      const sub = card.cart.subtotal ? `\nSubtotal: ${formatMoney(card.cart.subtotal, locale)}` : ''
      return `Your cart:\n${lines.join('\n')}${sub}`
    }
    case 'order': {
      const ord = card.order
      const parts = [`Order ${ord.number ?? ord.id}: ${ord.status}`, `Total: ${formatMoney(ord.total, locale)}`]
      if (ord.paymentStatus) parts.push(`Payment: ${ord.paymentStatus}`)
      const s = ord.shipping
      if (s?.status) parts.push(`Shipping: ${s.status}${s.carrier ? ` (${s.carrier})` : ''}`)
      if (s?.trackingNumber) parts.push(`Tracking: ${s.trackingNumber}${s.trackingUrl ? ` ${s.trackingUrl}` : ''}`)
      if (s?.eta) parts.push(`Expected: ${s.eta}`)
      for (const i of ord.items) parts.push(`* ${i.quantity} x ${i.title} - ${formatMoney(i.price, locale)}`)
      return parts.join('\n')
    }
    case 'orders':
      return card.orders.length
        ? card.orders.map((x) => `* Order ${x.number ?? x.id}: ${x.status}, ${formatMoney(x.total, locale)} (${x.itemCount} items)`).join('\n')
        : 'No orders found.'
    case 'confirmation': {
      const code = o.confirmCodes?.[card.actionId]
      const how = code ? `Reply YES ${code} to confirm or NO ${code} to cancel.` : 'Please confirm on the website.'
      return `${card.title}\n${card.summary}\n${how} (expires ${when(card.expiresAt, locale)})`
    }
    case 'action-result':
      return card.message
    case 'handoff':
      return `A team member will get back to you (${card.expectedReply}).`
    case 'slots':
      return card.slots.length ? `Available times:\n${card.slots.map((s) => `* ${when(s.start, locale)}`).join('\n')}` : 'No times available.'
    case 'booking':
      return `Booking ${card.bookingId}: ${card.status}, ${when(card.slot.start, locale)}`
    case 'lead':
      return "Thanks, we've saved your details."
    case 'citations':
      return card.citations.length ? `Sources:\n${card.citations.map((c) => `* ${c.title}${c.url ? ` ${c.url}` : ''}`).join('\n')}` : ''
    case 'verify':
      return 'To see order details, link this chat to your account: reply with the email address on your account and we will email you a 6-digit code.'
    case 'chart':
      return ''
  }
}

/** Assistant text followed by rendered cards. */
export const renderReply = (text: string, cards: Card[], o: RenderOptions = {}): string =>
  [text.trim(), ...cards.map((c) => renderCard(c, o).trim())].filter(Boolean).join('\n\n')

/**
 * Split text into parts no longer than `max`, preferring paragraph, line, sentence, then word
 * boundaries; hard-cuts only unbroken runs.
 */
export const splitMessage = (text: string, max: number): string[] => {
  const t = text.trim()
  if (!t) return []
  if (t.length <= max) return [t]
  const parts: string[] = []
  let rest = t
  while (rest.length > max) {
    const window = rest.slice(0, max + 1)
    let cut = -1
    for (const sep of ['\n\n', '\n', '. ', '! ', '? ', ' ']) {
      const i = window.lastIndexOf(sep)
      if (i > max * 0.3) {
        cut = i + (sep.trim() ? sep.length - 1 : 0)
        break
      }
    }
    if (cut <= 0) cut = max
    const head = rest.slice(0, cut).trim()
    if (head) parts.push(head)
    rest = rest.slice(cut).trim()
  }
  if (rest) parts.push(rest)
  return parts
}
