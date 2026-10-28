import { describe, expect, it } from 'vitest'
import { computeCartAbandonment, computeRepeatRate, computeRevenue, computeTopProducts, computeZeroResults } from './math'
import { resolvePeriod } from '../period'
import { order } from '../test/helpers'

const period = resolvePeriod({ from: '2026-10-01', to: '2026-10-14' })

describe('revenue', () => {
  const orders = [
    order('1', '2026-10-01T10:00:00Z', 10_000),
    order('2', '2026-10-01T18:00:00Z', 5_050),
    order('3', '2026-10-06T09:00:00Z', 20_000),
    order('4', '2026-10-13T23:59:00Z', 1_000, { total: { amount: 1_000, currency: 'USD' }, items: [{ offeringId: 'p2', title: 'Mug', quantity: 2, price: { amount: 500, currency: 'USD' } }] }),
  ]

  it('groups by day with zero-filled buckets and keeps minor units per currency', () => {
    const r = computeRevenue(orders, period, 'day')
    const bdt = r.find((c) => c.currency === 'BDT')!
    expect(bdt.total).toBe(35_050)
    expect(bdt.orders).toBe(3)
    expect(bdt.aov).toBe(11_683)
    expect(bdt.groups).toHaveLength(14)
    expect(bdt.groups[0]).toMatchObject({ key: '2026-10-01', amount: 15_050, orders: 2 })
    expect(bdt.groups[1]).toMatchObject({ key: '2026-10-02', amount: 0 })
    expect(r.find((c) => c.currency === 'USD')!.total).toBe(1_000)
  })

  it('groups by ISO week (Monday) and month', () => {
    const weeks = computeRevenue(orders, period, 'week').find((c) => c.currency === 'BDT')!.groups
    expect(weeks.map((g) => g.key)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12'])
    expect(weeks.map((g) => g.amount)).toEqual([15_050, 20_000, 0])
    const months = computeRevenue(orders, period, 'month').find((c) => c.currency === 'BDT')!.groups
    expect(months).toEqual([{ key: '2026-10', label: '2026-10', amount: 35_050, orders: 3 }])
  })

  it('groups by offering and by category from line items', () => {
    const o = [
      order('1', '2026-10-02T00:00:00Z', 0, {
        items: [
          { offeringId: 'a', title: 'A', quantity: 2, price: { amount: 300, currency: 'BDT' } },
          { offeringId: 'b', title: 'B', quantity: 1, price: { amount: 1_000, currency: 'BDT' } },
        ],
      }),
    ]
    const byOffering = computeRevenue(o, period, 'offering')[0].groups
    expect(byOffering.map((g) => [g.key, g.amount])).toEqual([['b', 1_000], ['a', 600]])
    const byCat = computeRevenue(o, period, 'category', { categoriesOf: (id) => (id === 'a' ? ['c1', 'c2'] : []), categoryTitle: () => 'Shirts' })[0].groups
    expect(byCat.map((g) => [g.label, g.amount])).toEqual([['Uncategorized', 1_000], ['Shirts', 600]])
  })
})

describe('repeat rate', () => {
  it('counts period customers with at least one other order up to period end', () => {
    const history = [
      order('0', '2026-09-01T00:00:00Z', 100, { customerId: 'alice' }),
      order('1', '2026-10-02T00:00:00Z', 100, { customerId: 'alice' }),
      order('2', '2026-10-03T00:00:00Z', 100, { customerId: 'bob' }),
      order('3', '2026-10-04T00:00:00Z', 100, { customerEmail: 'Carol@x.com' }),
      order('4', '2026-10-05T00:00:00Z', 100, { customerEmail: 'carol@x.com ' }),
      order('5', '2026-10-06T00:00:00Z', 100),
      order('6', '2026-10-20T00:00:00Z', 100, { customerId: 'bob' }),
    ]
    expect(computeRepeatRate(history, period)).toEqual({ customers: 3, repeatCustomers: 2, ratePct: 66.7, anonymousOrders: 1 })
  })
})

describe('cart abandonment', () => {
  it('rate = abandoned / (abandoned + orders) with value per currency', () => {
    const carts = [
      { id: 'c1', items: [], subtotal: { amount: 2_000, currency: 'bdt' } },
      { id: 'c2', items: [{ offeringId: 'x', title: 'X', quantity: 3, price: { amount: 100, currency: 'BDT' } }] },
      { id: 'c3', items: [] },
    ]
    expect(computeCartAbandonment(carts, 7)).toEqual({ abandonedCarts: 3, orders: 7, ratePct: 30, abandonedValue: [{ currency: 'BDT', amount: 2_300 }] })
    expect(computeCartAbandonment([], 0).ratePct).toBe(0)
  })
})

describe('top products and zero results', () => {
  it('ranks by revenue or units', () => {
    const o = [
      order('1', '2026-10-02T00:00:00Z', 0, { items: [{ offeringId: 'a', title: 'A', quantity: 5, price: { amount: 100, currency: 'BDT' } }, { offeringId: 'b', title: 'B', quantity: 1, price: { amount: 900, currency: 'BDT' } }] }),
    ]
    expect(computeTopProducts(o, 1, 'revenue')[0].offeringId).toBe('b')
    expect(computeTopProducts(o, 1, 'units')[0].offeringId).toBe('a')
  })

  it('counts zero-result searches and ignores click events', () => {
    const r = computeZeroResults([
      { query: 'Red Dress', results: [] },
      { query: 'red dress ', resultCount: 0 },
      { query: 'shoes', total: 12 },
      { type: 'click', query: 'shoes', clickedId: '1' },
    ])
    expect(r).toMatchObject({ searches: 3, zeroResultSearches: 2, ratePct: 66.7, topQueries: [{ query: 'red dress', count: 2 }] })
  })
})
