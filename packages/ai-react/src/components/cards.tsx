'use client'
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { ActionStatus, Card, Cart, ChartSeries, Citation, OfferingSummary, Order, OrderSummary, Slot } from '@payload-ai-suite/ai-core/wire'
import { formatDateTime, formatMoney } from '../format'
import type { Labels } from './labels'
import { labelsFor } from './labels'

type CardOf<T extends Card['type']> = Extract<Card, { type: T }>

export interface CardHandlers {
  locale?: string
  labels?: Labels
  onConfirm?: (actionId: string) => void | Promise<unknown>
  onReject?: (actionId: string) => void | Promise<unknown>
  /** Result already known for a confirmation (hides the buttons). */
  actionStatus?: (actionId: string) => ActionStatus | undefined
  onSelectSlot?: (offeringId: string, slot: Slot) => void
  onProductClick?: (item: OfferingSummary, position: number) => void
  verify?: {
    status: string
    message?: string
    start: (i: { orderNumber: string; email: string }) => void | Promise<unknown>
    confirm: (code: string) => void | Promise<unknown>
  }
  loginUrl?: string
}

const L = (h: CardHandlers) => h.labels ?? labelsFor(h.locale ?? 'en')

export const StockBadge = ({ inStock, stock, locale, labels }: { inStock?: boolean; stock?: number | null; locale?: string; labels?: Labels }) => {
  const l = labels ?? labelsFor(locale ?? 'en')
  if (inStock === undefined) return null
  if (!inStock) return <span className="ais-badge ais-badge-out">{l.outOfStock}</span>
  if (typeof stock === 'number' && stock > 0 && stock <= 5) return <span className="ais-badge ais-badge-low">{l.onlyLeft(stock)}</span>
  return <span className="ais-badge">{l.inStock}</span>
}

export const Price = ({ item, locale }: { item: Pick<OfferingSummary, 'price' | 'compareAtPrice'>; locale?: string }) =>
  item.price ? (
    <span className="ais-price">
      {formatMoney(item.price, locale)}
      {item.compareAtPrice && item.compareAtPrice.amount > item.price.amount ? <span className="ais-compare">{formatMoney(item.compareAtPrice, locale)}</span> : null}
    </span>
  ) : null

export const ProductCard = ({
  item,
  position = 0,
  ...h
}: { item: OfferingSummary & { description?: string }; position?: number } & CardHandlers) => {
  const body = (
    <>
      {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : null}
      <strong>{item.title}</strong>
      <Price item={item} locale={h.locale} />
      <StockBadge inStock={item.inStock} stock={item.stock} locale={h.locale} labels={h.labels} />
      {item.description ? <span className="ais-status">{item.description}</span> : null}
    </>
  )
  return item.url ? (
    <a className="ais-product" href={item.url} onClick={() => h.onProductClick?.(item, position)}>
      {body}
    </a>
  ) : (
    <div className="ais-product">{body}</div>
  )
}

export const ProductsCard = ({ items, ...h }: { items: OfferingSummary[] } & CardHandlers) => (
  <div className="ais-products" role="list">
    {items.map((it, i) => (
      <div role="listitem" key={it.id}>
        <ProductCard item={it} position={i} {...h} />
      </div>
    ))}
  </div>
)

export const CartCard = ({ cart, ...h }: { cart: Cart } & CardHandlers) => {
  const l = L(h)
  return (
    <div className="ais-card">
      <h3>{l.addedToCart}</h3>
      <ul>
        {cart.items.map((i) => (
          <li key={`${i.offeringId}:${i.variantId ?? ''}`}>
            {i.quantity} × {i.title}
            {i.price ? ` — ${formatMoney(i.price, h.locale)}` : ''}
          </li>
        ))}
      </ul>
      {cart.subtotal ? (
        <div className="ais-row">
          <span>{l.subtotal}</span>
          <strong>{formatMoney(cart.subtotal, h.locale)}</strong>
        </div>
      ) : null}
    </div>
  )
}

export const OrderCard = ({ order, ...h }: { order: Order } & CardHandlers) => {
  const l = L(h)
  return (
    <div className="ais-card">
      <h3>
        {l.order} {order.number ? `#${order.number}` : order.id}
      </h3>
      <div className="ais-row">
        <span className="ais-badge">{order.status}</span>
        <strong>{formatMoney(order.total, h.locale)}</strong>
      </div>
      <div className="ais-status">{formatDateTime(order.createdAt, h.locale, { dateStyle: 'medium' })}</div>
      <ul>
        {order.items.map((i, n) => (
          <li key={n}>
            {i.quantity} × {i.title}
          </li>
        ))}
      </ul>
      {order.shipping ? (
        <div className="ais-status">
          {[order.shipping.status, order.shipping.carrier, order.shipping.eta && formatDateTime(order.shipping.eta, h.locale, { dateStyle: 'medium' })]
            .filter(Boolean)
            .join(' · ')}
          {order.shipping.trackingUrl && /^https?:\/\//i.test(order.shipping.trackingUrl) ? (
            <>
              {' · '}
              <a href={order.shipping.trackingUrl} target="_blank" rel="noopener noreferrer">
                {order.shipping.trackingNumber ?? 'Track'}
              </a>
            </>
          ) : order.shipping.trackingNumber ? (
            ` · ${order.shipping.trackingNumber}`
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export const OrdersCard = ({ orders, ...h }: { orders: OrderSummary[] } & CardHandlers) => (
  <div className="ais-card">
    <ul>
      {orders.map((o) => (
        <li key={o.id} className="ais-row">
          <span>
            #{o.number ?? o.id} · {o.status}
          </span>
          <span>{formatMoney(o.total, h.locale)}</span>
        </li>
      ))}
    </ul>
  </div>
)

export const ConfirmationCard = ({ card, ...h }: { card: CardOf<'confirmation'> } & CardHandlers) => {
  const l = L(h)
  const [busy, setBusy] = useState(false)
  const status = h.actionStatus?.(card.actionId)
  const expired = new Date(card.expiresAt).getTime() < Date.now()
  const act = async (f?: (id: string) => void | Promise<unknown>) => {
    if (!f || busy) return
    setBusy(true)
    try {
      await f(card.actionId)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="ais-card" role="group" aria-label={card.title}>
      <h3>{card.title}</h3>
      <p>{card.summary}</p>
      {!status && !expired ? (
        <div className="ais-actions">
          <button type="button" className="ais-btn ais-btn-primary" disabled={busy} onClick={() => act(h.onConfirm)}>
            {l.confirm}
          </button>
          <button type="button" className="ais-btn" disabled={busy} onClick={() => act(h.onReject)}>
            {l.cancel}
          </button>
        </div>
      ) : null}
      {!status && expired ? <div className="ais-status">{l.expires}: {formatDateTime(card.expiresAt, h.locale)}</div> : null}
    </div>
  )
}

export const ActionResultCard = ({ card }: { card: CardOf<'action-result'> } & CardHandlers) => (
  <div className="ais-card" role="status">
    <span className={`ais-badge${card.status === 'failed' || card.status === 'expired' ? ' ais-badge-out' : ''}`}>{card.status}</span> {card.message}
  </div>
)

export const HandoffCard = ({ card, ...h }: { card: CardOf<'handoff'> } & CardHandlers) => (
  <div className="ais-card" role="status">
    {L(h).handoff(card.expectedReply)}
  </div>
)

export const SlotsCard = ({ card, ...h }: { card: CardOf<'slots'> } & CardHandlers) => (
  <div className="ais-card">
    <div className="ais-slots">
      {card.slots.map((s) => (
        <button
          key={`${s.start}:${s.staffId ?? ''}`}
          type="button"
          className="ais-btn"
          disabled={!h.onSelectSlot}
          onClick={() => h.onSelectSlot?.(card.offeringId, s)}
          aria-label={`${L(h).pickSlot} ${formatDateTime(s.start, h.locale)}`}
        >
          {formatDateTime(s.start, h.locale)}
        </button>
      ))}
    </div>
  </div>
)

export const BookingCard = ({ card, ...h }: { card: CardOf<'booking'> } & CardHandlers) => (
  <div className="ais-card" role="status">
    <h3>{L(h).booked}</h3>
    {formatDateTime(card.slot.start, h.locale)} – {formatDateTime(card.slot.end, h.locale, { timeStyle: 'short' })}
  </div>
)

export const CitationsList = ({ citations, ...h }: { citations: Citation[] } & CardHandlers) => (
  <div className="ais-card">
    <div className="ais-status">{L(h).sources}</div>
    <ol>
      {citations.map((c) => (
        <li key={`${c.sourceCollection}:${c.sourceId}`}>
          {c.url && /^(https?:\/\/|\/)/i.test(c.url) ? (
            <a href={c.url} target="_blank" rel="noopener noreferrer">
              {c.title}
            </a>
          ) : (
            c.title
          )}
        </li>
      ))}
    </ol>
  </div>
)

export const VerifyCard = ({ card, ...h }: { card: CardOf<'verify'> } & CardHandlers) => {
  const l = L(h)
  const [orderNumber, setOrderNumber] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const v = h.verify
  if (v?.status === 'verified') return <div className="ais-card" role="status">✓ {v.message}</div>
  const codeStep = v?.status === 'code-sent' || v?.status === 'confirming'
  const submitStart = (e: FormEvent) => {
    e.preventDefault()
    void v?.start({ orderNumber, email })
  }
  const submitCode = (e: FormEvent) => {
    e.preventDefault()
    void v?.confirm(code)
  }
  return (
    <div className="ais-card" role="group" aria-label={l.verifyTitle}>
      <h3>{l.verifyTitle}</h3>
      {card.methods.includes('login') && h.loginUrl ? (
        <p>
          <a href={h.loginUrl}>{l.login}</a>
        </p>
      ) : null}
      {card.methods.includes('order-email-otp') && v ? (
        !codeStep ? (
          <form onSubmit={submitStart}>
            <label>
              {l.orderNumber}
              <input className="ais-input" required value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} autoComplete="off" />
            </label>
            <label>
              {l.email}
              <input className="ais-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <div className="ais-actions">
              <button className="ais-btn ais-btn-primary" type="submit" disabled={v.status === 'sending'}>
                {l.sendCode}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={submitCode}>
            <label>
              {l.code}
              <input
                className="ais-input"
                required
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            <div className="ais-actions">
              <button className="ais-btn ais-btn-primary" type="submit" disabled={v.status === 'confirming'}>
                {l.verifyCode}
              </button>
            </div>
          </form>
        )
      ) : null}
      {v?.message ? (
        <p className="ais-status" role="status">
          {v.message}
        </p>
      ) : null}
    </div>
  )
}

/* ---------- Chart ---------- */

const PALETTE = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2']

const chartBounds = (series: ChartSeries[]) => {
  const ys = series.flatMap((s) => s.points.map((p) => p.y))
  const max = Math.max(0, ...ys)
  const min = Math.min(0, ...ys)
  return { min, max: max === min ? min + 1 : max }
}

export const ChartCard = ({ card }: { card: CardOf<'chart'> } & CardHandlers) => {
  const W = 320
  const H = 180
  const P = 24
  const { series, kind, title } = card
  let body: ReactNode
  if (kind === 'table' || !series.length) {
    const xs = [...new Set(series.flatMap((s) => s.points.map((p) => String(p.x))))]
    body = (
      <table>
        <thead>
          <tr>
            <th />
            {series.map((s) => (
              <th key={s.name}>{s.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {xs.map((x) => (
            <tr key={x}>
              <th>{x}</th>
              {series.map((s) => (
                <td key={s.name}>{s.points.find((p) => String(p.x) === x)?.y ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  } else if (kind === 'pie') {
    const pts = series[0].points.filter((p) => p.y > 0)
    const total = pts.reduce((a, p) => a + p.y, 0) || 1
    let angle = -Math.PI / 2
    const r = 70
    const cx = W / 2
    const cy = H / 2
    body = (
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {pts.map((p, i) => {
          const a = (p.y / total) * Math.PI * 2
          const x1 = cx + r * Math.cos(angle)
          const y1 = cy + r * Math.sin(angle)
          angle += a
          const x2 = cx + r * Math.cos(angle)
          const y2 = cy + r * Math.sin(angle)
          const d = pts.length === 1 ? `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0` : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`
          return (
            <path key={String(p.x)} d={d} fill={PALETTE[i % PALETTE.length]}>
              <title>{`${p.x}: ${p.y}`}</title>
            </path>
          )
        })}
      </svg>
    )
  } else {
    const { min, max } = chartBounds(series)
    const n = Math.max(...series.map((s) => s.points.length), 1)
    const x = (i: number) => P + (kind === 'bar' ? ((i + 0.5) * (W - 2 * P)) / n : n === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (n - 1))
    const y = (v: number) => H - P - ((v - min) / (max - min)) * (H - 2 * P)
    const bw = ((W - 2 * P) / n / Math.max(series.length, 1)) * 0.8
    body = (
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        <line x1={P} y1={y(0)} x2={W - P} y2={y(0)} stroke="currentColor" strokeOpacity={0.3} />
        {series.map((s, si) =>
          kind === 'bar' ? (
            s.points.map((p, i) => (
              <rect
                key={`${s.name}:${i}`}
                x={x(i) - (bw * series.length) / 2 + si * bw}
                y={Math.min(y(p.y), y(0))}
                width={bw}
                height={Math.abs(y(p.y) - y(0))}
                fill={PALETTE[si % PALETTE.length]}
              >
                <title>{`${s.name} ${p.x}: ${p.y}`}</title>
              </rect>
            ))
          ) : (
            <polyline
              key={s.name}
              fill="none"
              stroke={PALETTE[si % PALETTE.length]}
              strokeWidth={2}
              points={s.points.map((p, i) => `${x(i)},${y(p.y)}`).join(' ')}
            />
          ),
        )}
        {series[0]?.points.map((p, i) =>
          i % Math.ceil(n / 6) === 0 ? (
            <text key={i} x={x(i)} y={H - 6} fontSize={10} textAnchor="middle" fill="currentColor">
              {String(p.x)}
            </text>
          ) : null,
        )}
      </svg>
    )
  }
  return (
    <figure className="ais-card ais-chart">
      <figcaption>
        <strong>{title}</strong>
      </figcaption>
      {body}
      {series.length > 1 ? (
        <div className="ais-status">
          {series.map((s, i) => (
            <span key={s.name} style={{ color: PALETTE[i % PALETTE.length], marginRight: 8 }}>
              ● {s.name}
            </span>
          ))}
        </div>
      ) : null}
    </figure>
  )
}

/** Renders any wire Card. */
export const CardView = ({ card, ...h }: { card: Card } & CardHandlers) => {
  switch (card.type) {
    case 'products':
      return <ProductsCard items={card.items} {...h} />
    case 'product':
      return <ProductCard item={card.offering} {...h} />
    case 'stock':
      return (
        <div className="ais-card">
          <StockBadge inStock={card.inStock} stock={card.stock} locale={h.locale} labels={h.labels} />
        </div>
      )
    case 'cart':
      return <CartCard cart={card.cart} {...h} />
    case 'order':
      return <OrderCard order={card.order} {...h} />
    case 'orders':
      return <OrdersCard orders={card.orders} {...h} />
    case 'confirmation':
      return <ConfirmationCard card={card} {...h} />
    case 'action-result':
      return <ActionResultCard card={card} {...h} />
    case 'handoff':
      return <HandoffCard card={card} {...h} />
    case 'slots':
      return <SlotsCard card={card} {...h} />
    case 'booking':
      return <BookingCard card={card} {...h} />
    case 'lead':
      return (
        <div className="ais-card" role="status">
          {L(h).leadSaved}
        </div>
      )
    case 'citations':
      return <CitationsList citations={card.citations} {...h} />
    case 'verify':
      return <VerifyCard card={card} {...h} />
    case 'chart':
      return <ChartCard card={card} {...h} />
    default:
      return null
  }
}
