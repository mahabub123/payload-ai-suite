/**
 * Preset defaults. Collections and field paths may be candidate lists: the first one that exists in the
 * site's config wins; preset defaults that don't exist are dropped (with a warning), never fatal —
 * except `required` logical fields and anything the site sets explicitly via overrides.
 */
import type { ConceptName } from 'payload-ai-core'
import type { PresetName } from './types'

export type Candidates = string | string[]

export interface PresetConcept {
  collection: Candidates
  fields?: Record<string, Candidates>
  required?: string[]
  /** Other concept options (same shape as the public config; nested `fields` may hold candidates). */
  [option: string]: unknown
}

export type PresetDef = Partial<Record<ConceptName, PresetConcept>>

export const KNOWLEDGE_FIELD_DEFAULTS: Record<string, Candidates> = {
  title: ['title', 'question', 'name', 'label'],
  body: ['content', 'body', 'answer', 'layout', 'richText', 'text', 'description', 'bio'],
  slug: 'slug',
  updatedAt: 'updatedAt',
  visibility: 'visibility',
}

export const KNOWLEDGE_URLS: Record<string, string> = {
  pages: '/{slug}',
  posts: '/posts/{slug}',
  policies: '/policies/{slug}',
  authors: '/authors/{slug}',
}

export const TICKETS_COLLECTION = 'ai-tickets'

const ticketFields = {
  source: 'source',
  subject: 'subject',
  customerId: 'customerId',
  customerEmail: 'customerEmail',
  linkedOrderId: 'linkedOrderId',
  topic: 'topic',
  transcript: 'transcript',
  status: 'status',
}

const leadDefaults = (collections: string[]): PresetConcept => ({
  collection: [...collections, TICKETS_COLLECTION],
  fields: {
    name: ['name', 'fullName'],
    email: ['email', 'customerEmail'],
    phone: ['phone'],
    message: ['message', 'subject', 'body'],
    source: 'source',
    meta: ['meta', 'transcript', 'data'],
  },
  required: ['message'],
})

const reviewDefaults = (collections: string[]): PresetConcept => ({
  collection: collections,
  fields: {
    offering: ['product', 'offering', 'service'],
    rating: 'rating',
    title: 'title',
    body: ['body', 'comment', 'content', 'review', 'text'],
    author: ['authorName', 'name', 'author'],
    createdAt: 'createdAt',
    status: 'status',
  },
  required: ['offering', 'body'],
})

const ecommerce: PresetDef = {
  offering: {
    collection: 'products',
    fields: {
      title: ['title', 'name'],
      slug: 'slug',
      description: ['description', 'content', 'shortDescription'],
      price: 'priceIn{CURRENCY}',
      priceEnabled: 'priceIn{CURRENCY}Enabled',
      compareAtPrice: ['compareAtPriceIn{CURRENCY}', 'compareAtPrice'],
      stock: 'inventory',
      image: ['gallery.0.image', 'gallery.0', 'image', 'meta.image'],
      images: ['gallery.image', 'gallery', 'images'],
      categories: ['categories', 'category'],
      tags: ['tags'],
      enableVariants: 'enableVariants',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    required: ['title'],
    urlPattern: '/products/{slug}',
    variants: {
      collection: 'variants',
      fields: {
        title: 'title',
        product: 'product',
        options: 'options',
        price: 'priceIn{CURRENCY}',
        priceEnabled: 'priceIn{CURRENCY}Enabled',
        stock: 'inventory',
      },
    },
  },
  category: {
    collection: 'categories',
    fields: { title: ['title', 'name'], slug: 'slug', parent: 'parent' },
    required: ['title'],
  },
  customer: {
    collection: 'users',
    fields: {
      email: 'email',
      name: ['name', 'fullName', 'firstName'],
      phone: ['phone', 'phoneNumber'],
      createdAt: 'createdAt',
      marketingOptIn: ['marketingOptIn', 'newsletter'],
    },
    required: ['email'],
    role: { field: 'roles', value: 'customer' },
  },
  order: {
    collection: 'orders',
    fields: {
      number: ['orderNumber', 'number'],
      status: 'status',
      total: 'amount',
      currency: 'currency',
      customer: 'customer',
      customerEmail: 'customerEmail',
      items: 'items',
      itemOffering: 'product',
      itemVariant: 'variant',
      itemQuantity: 'quantity',
      itemPrice: 'amount',
      paymentStatus: 'paymentStatus',
      shippingStatus: ['shippingStatus', 'fulfillmentStatus'],
      carrier: 'carrier',
      trackingNumber: 'trackingNumber',
      trackingUrl: 'trackingUrl',
      eta: ['estimatedDelivery', 'eta'],
      createdAt: 'createdAt',
    },
    required: ['customer', 'total'],
    returns: { collection: TICKETS_COLLECTION, fields: ticketFields },
  },
  cart: {
    collection: 'carts',
    fields: {
      items: 'items',
      itemOffering: 'product',
      itemVariant: 'variant',
      itemQuantity: 'quantity',
      itemPrice: 'amount',
      customer: 'customer',
      subtotal: 'subtotal',
      currency: 'currency',
      purchasedAt: 'purchasedAt',
      updatedAt: 'updatedAt',
    },
    required: ['items', 'itemOffering', 'itemQuantity'],
  },
  knowledge: { collection: ['pages', 'posts', 'faqs', 'policies'] },
  lead: leadDefaults(['leads']),
  review: reviewDefaults(['reviews', 'product-reviews']),
}

const services: PresetDef = {
  offering: {
    collection: 'services',
    fields: {
      title: ['title', 'name'],
      slug: 'slug',
      description: ['description', 'summary', 'content'],
      price: ['price', 'priceIn{CURRENCY}'],
      image: ['image', 'gallery.0.image', 'gallery.0', 'photo', 'meta.image'],
      images: ['gallery.image', 'gallery', 'images'],
      categories: ['categories', 'category'],
      tags: ['tags'],
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    required: ['title'],
    urlPattern: '/services/{slug}',
    variants: false,
  },
  category: {
    collection: ['service-categories', 'categories'],
    fields: { title: ['title', 'name'], slug: 'slug', parent: 'parent' },
    required: ['title'],
  },
  customer: {
    collection: ['customers', 'users'],
    fields: {
      email: 'email',
      name: ['name', 'fullName', 'firstName'],
      phone: ['phone', 'phoneNumber'],
      createdAt: 'createdAt',
      marketingOptIn: ['marketingOptIn', 'newsletter'],
    },
    required: ['email'],
    role: { field: 'roles', value: 'customer' },
  },
  booking: {
    collection: ['bookings', 'appointments'],
    fields: {
      service: ['service', 'offering'],
      start: ['start', 'startsAt', 'startTime', 'date'],
      end: ['end', 'endsAt', 'endTime'],
      staff: ['staff', 'staffMember'],
      location: 'location',
      status: 'status',
      name: ['name', 'customerName'],
      email: ['email', 'customerEmail'],
      phone: ['phone', 'customerPhone'],
      notes: ['notes', 'message'],
      customer: 'customer',
    },
    required: ['service', 'start'],
    services: { collection: 'services', durationField: ['duration', 'durationMinutes'] },
    staff: { collection: 'staff', servicesField: 'services', locationField: ['location', 'locations'] },
    locations: { collection: 'locations', hoursField: ['openingHours', 'hours'] },
  },
  knowledge: { collection: ['pages', 'posts', 'faqs', 'policies'] },
  lead: leadDefaults(['leads', 'enquiries', 'inquiries']),
  review: reviewDefaults(['reviews', 'testimonials']),
}

const content: PresetDef = {
  category: {
    collection: 'categories',
    fields: { title: ['title', 'name'], slug: 'slug', parent: 'parent' },
    required: ['title'],
  },
  customer: {
    collection: 'users',
    fields: { email: 'email', name: ['name', 'fullName', 'firstName'], createdAt: 'createdAt' },
    required: ['email'],
    role: false,
  },
  knowledge: { collection: ['pages', 'posts', 'faqs', 'authors'] },
  lead: leadDefaults(['leads']),
}

export const PRESETS: Record<PresetName, PresetDef> = { ecommerce, services, content, custom: {} }
