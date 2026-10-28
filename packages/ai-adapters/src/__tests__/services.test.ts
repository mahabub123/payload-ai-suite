import type { AdapterContext } from '@payload-ai-suite/ai-core'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAdapters } from '../createAdapters'
import { createFakePayload } from '../testing/fakePayload'
import type { FakeCollection } from '../testing/fakePayload'
import { lexical } from './fixtures'

const collections: FakeCollection[] = [
  { slug: 'users', auth: true, fields: [{ name: 'name', type: 'text' }] },
  {
    slug: 'services',
    fields: [
      { name: 'title', type: 'text' },
      { name: 'slug', type: 'text' },
      { name: 'description', type: 'richText' },
      { name: 'price', type: 'number' },
      { name: 'duration', type: 'number' },
    ],
  },
  {
    slug: 'locations',
    fields: [
      { name: 'name', type: 'text' },
      { name: 'openingHours', type: 'array', fields: [{ name: 'day', type: 'select' }, { name: 'open', type: 'text' }, { name: 'close', type: 'text' }] },
    ],
  },
  {
    slug: 'staff',
    fields: [
      { name: 'name', type: 'text' },
      { name: 'services', type: 'relationship', relationTo: 'services', hasMany: true },
      { name: 'location', type: 'relationship', relationTo: 'locations' },
    ],
  },
  {
    slug: 'bookings',
    // Shoppers cannot read bookings; they may create them.
    access: { read: ({ req }) => !!req.user && (req.user.roles as string[] | undefined)?.includes('admin') === true, create: () => true },
    fields: [
      { name: 'service', type: 'relationship', relationTo: 'services' },
      { name: 'start', type: 'date' },
      { name: 'end', type: 'date' },
      { name: 'staff', type: 'relationship', relationTo: 'staff' },
      { name: 'location', type: 'relationship', relationTo: 'locations' },
      { name: 'status', type: 'select' },
      { name: 'name', type: 'text' },
      { name: 'email', type: 'email' },
      { name: 'phone', type: 'text' },
      { name: 'notes', type: 'textarea' },
      { name: 'customer', type: 'relationship', relationTo: 'users' },
    ],
  },
]

const data = {
  services: [
    { id: 's1', title: 'Haircut', slug: 'haircut', description: lexical('Classic cut.'), price: 1500.5, duration: 60 },
    { id: 's2', title: 'Massage', slug: 'massage', price: 3000, duration: 90 },
  ],
  locations: [{ id: 'l1', name: 'Gulshan', openingHours: [{ day: 'monday', open: '10:00', close: '13:00' }] }],
  staff: [
    { id: 'st1', name: 'Rina', services: ['s1'], location: 'l1' },
    { id: 'st2', name: 'Karim', services: ['s2'], location: 'l1' },
  ],
  bookings: [
    // Monday 2026-11-02, 10:00 Dhaka (UTC+6) = 04:00Z
    { id: 'b1', service: 's1', staff: 'st1', start: '2026-11-02T04:00:00.000Z', end: '2026-11-02T05:00:00.000Z', status: 'confirmed' },
    { id: 'b2', service: 's1', staff: 'st1', start: '2026-11-02T05:00:00.000Z', end: '2026-11-02T06:00:00.000Z', status: 'cancelled' },
  ],
}

const setup = () => {
  const store = createFakePayload({ collections, data })
  const provider = createAdapters({
    preset: 'services',
    overrides: {
      offering: { currency: 'BDT', priceUnit: 'major' },
      booking: { utcOffsetMinutes: 360 },
    },
  })
  const adapters = provider.build(store.payload)
  const visitor: AdapterContext = { payload: store.payload, user: null }
  return { store, provider, adapters, visitor }
}

describe('services preset', () => {
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
  })
  afterAll(() => vi.useRealTimers())

  it('validates services, booking (with staff + locations), disables order/cart', () => {
    const { provider, store } = setup()
    const r = Object.fromEntries(provider.validate(store.payload).map((x) => [x.concept, x]))
    expect(r.offering.ok).toBe(true)
    expect(r.booking.ok).toBe(true)
    expect(r.customer.ok).toBe(true)
    expect(r.order.ok).toBe(false)
    expect(r.cart.ok).toBe(false)
  })

  it('maps services as offerings with major->minor price conversion', async () => {
    const { adapters, visitor } = setup()
    const s = await adapters.offering!.get('s1', visitor)
    expect(s).toMatchObject({ title: 'Haircut', url: '/services/haircut', price: { amount: 150050, currency: 'BDT' }, description: 'Classic cut.' })
    // priceMin in minor units is converted back to the stored unit for the query.
    const res = await adapters.offering!.search({ priceMin: 200000 }, visitor)
    expect(res.items.map((i) => i.id)).toEqual(['s2'])
  })

  it('computes availability from opening hours, duration, qualified staff and existing bookings', async () => {
    const { adapters, visitor } = setup()
    const slots = await adapters.booking!.availability(
      { offeringId: 's1', from: new Date('2026-11-01T18:00:00Z'), to: new Date('2026-11-02T18:00:00Z'), locationId: 'l1' },
      visitor,
    )
    expect(slots).toEqual([
      { start: '2026-11-02T05:00:00.000Z', end: '2026-11-02T06:00:00.000Z', staffId: 'st1', locationId: 'l1' },
      { start: '2026-11-02T06:00:00.000Z', end: '2026-11-02T07:00:00.000Z', staffId: 'st1', locationId: 'l1' },
    ])
  })

  it('bookTentative creates a tentative booking with caller access and rejects a taken slot', async () => {
    const { adapters, visitor, store } = setup()
    const slot = { start: '2026-11-02T05:00:00.000Z', end: '2026-11-02T06:00:00.000Z', staffId: 'st1', locationId: 'l1' }
    const res = await adapters.booking!.bookTentative({ offeringId: 's1', slot, name: 'Nadia', email: 'n@example.com' }, visitor)
    expect(res.status).toBe('tentative')
    expect(store.db.get('bookings')!.at(-1)).toMatchObject({
      service: 's1',
      staff: 'st1',
      location: 'l1',
      status: 'tentative',
      name: 'Nadia',
      start: slot.start,
      end: slot.end,
    })
    expect(store.calls.find((c) => c.op === 'create')!.overrideAccess).toBe(false)
    await expect(adapters.booking!.bookTentative({ offeringId: 's1', slot, name: 'Other' }, visitor)).rejects.toMatchObject({
      code: 'conflict',
    })
  })
})
