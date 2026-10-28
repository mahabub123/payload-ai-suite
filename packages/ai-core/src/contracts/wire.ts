/**
 * Wire types shared by server endpoints and @payload-ai-suite/ai-react.
 * Type-only module: no runtime imports, safe for the browser.
 */
import type { Money, OfferingSummary, OrderSummary, Order, Cart, Slot } from './adapters'

export type { Money, OfferingSummary, OrderSummary, Order, Cart, Slot }

export interface Citation {
  title: string
  url?: string
  sourceCollection: string
  sourceId: string
}

/** Structured cards: prices, stock and order data shown to shoppers come from here, never from model text. */
export type Card =
  | { type: 'products'; items: OfferingSummary[] }
  | { type: 'product'; offering: OfferingSummary & { description?: string } }
  | { type: 'stock'; offeringId: string; variantId?: string; inStock: boolean; stock: number | null }
  | { type: 'cart'; cart: Cart }
  | { type: 'order'; order: Order }
  | { type: 'orders'; orders: OrderSummary[] }
  | {
      type: 'confirmation'
      actionId: string
      tool: string
      title: string
      summary: string
      expiresAt: string
    }
  | { type: 'action-result'; actionId: string; status: ActionStatus; message: string }
  | { type: 'handoff'; ticketId: string; expectedReply: string }
  | { type: 'slots'; offeringId: string; slots: Slot[] }
  | { type: 'booking'; bookingId: string; status: string; slot: Slot }
  | { type: 'lead'; leadId: string }
  | { type: 'citations'; citations: Citation[] }
  | { type: 'verify'; reason: string; methods: ('login' | 'order-email-otp')[] }
  | { type: 'chart'; title: string; kind: 'line' | 'bar' | 'pie' | 'table'; series: ChartSeries[] }

export interface ChartSeries {
  name: string
  points: { x: string | number; y: number }[]
}

export type ActionStatus = 'proposed' | 'confirmed' | 'done' | 'rejected' | 'failed' | 'expired'

/** Server-Sent Events emitted by streaming endpoints (`event: <type>` / `data: <json>`). */
export type StreamWireEvent =
  | { type: 'meta'; requestId: string; conversationId?: string; /** Show the "you are chatting with an AI" notice. */ aiNotice?: boolean }
  | { type: 'text'; delta: string }
  | { type: 'card'; card: Card }
  | { type: 'tool'; name: string; status: 'started' | 'done' | 'error' }
  | { type: 'done'; messageId?: string; outcome?: string }
  | { type: 'error'; code: string; message: string; requestId: string }

export interface ChatRequestBody {
  conversationId?: string
  message: string
  /** Page context: current product, cart, url. */
  page?: { url?: string; offeringId?: string; cartId?: string }
  locale?: string
  /** Cloudflare Turnstile token (required on a visitor's first message). */
  turnstileToken?: string
}

export interface SearchResponse {
  items: (OfferingSummary & { score: number })[]
  total: number
  nextCursor?: string
  facets?: { categories: { id: string; title: string; count: number }[]; attributes: Record<string, { value: string; count: number }[]> }
  parsedFilters?: Record<string, unknown>
  mode: 'hybrid' | 'keyword'
  requestId: string
  /** Id of the logged search (send back with click/add-to-cart events). */
  searchId?: string
}

export interface RecsResponse {
  kind: 'similar' | 'bought-together' | 'for-you'
  items: OfferingSummary[]
  requestId: string
}

export interface SearchEventBody {
  type: 'click' | 'add-to-cart' | 'impression'
  searchId?: string
  query?: string
  offeringId?: string
  position?: number
  sessionId?: string
}
