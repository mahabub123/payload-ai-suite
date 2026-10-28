import { describe, expect, it } from 'vitest'
import type { Field } from 'payload'
import { coerceRelationIds, withRelationIdCoercion, coerceRelationIdsHook } from './ids'

const cartFields: Field[] = [
  { name: 'customer', type: 'relationship', relationTo: 'users' },
  {
    name: 'items',
    type: 'array',
    fields: [
      { name: 'product', type: 'relationship', relationTo: 'products' },
      { name: 'variant', type: 'relationship', relationTo: 'variants' },
      { name: 'quantity', type: 'number' },
    ],
  },
  { name: 'tags', type: 'relationship', relationTo: 'tags', hasMany: true },
  { name: 'ref', type: 'relationship', relationTo: ['products', 'slugged'] },
  { type: 'row', fields: [{ name: 'image', type: 'upload', relationTo: 'media' }] },
  { name: 'note', type: 'text' },
]

const payload = {
  db: { defaultIDType: 'number' as const },
  collections: {
    carts: { config: { fields: cartFields } },
    users: {},
    products: {},
    variants: {},
    tags: {},
    media: {},
    slugged: { customIDType: 'text' as const },
  },
}

describe('coerceRelationIds', () => {
  it('turns digit strings into numbers for numeric-id targets, everywhere relationships live', () => {
    const out = coerceRelationIds(payload, 'carts', {
      customer: '7',
      items: [{ product: '22', variant: '3', quantity: 1 }],
      tags: ['1', 2],
      ref: { relationTo: 'products', value: '5' },
      image: '9',
      note: '42',
    })
    expect(out).toEqual({
      customer: 7,
      items: [{ product: 22, variant: 3, quantity: 1 }],
      tags: [1, 2],
      ref: { relationTo: 'products', value: 5 },
      image: 9,
      note: '42',
    })
  })

  it('leaves text ids, non-digit strings and unknown collections alone', () => {
    expect(coerceRelationIds(payload, 'carts', { ref: { relationTo: 'slugged', value: '5' }, customer: 'abc' })).toEqual({
      ref: { relationTo: 'slugged', value: '5' },
      customer: 'abc',
    })
    const mongo = { ...payload, db: { defaultIDType: 'text' as const } }
    expect(coerceRelationIds(mongo, 'carts', { customer: '7' })).toEqual({ customer: '7' })
    expect(coerceRelationIds(payload, 'nope', { customer: '7' })).toEqual({ customer: '7' })
  })

  it('runs as a beforeValidate hook, added once and ahead of existing hooks', () => {
    const existing = () => undefined
    const c = withRelationIdCoercion(withRelationIdCoercion({ slug: 'carts', fields: cartFields, hooks: { beforeValidate: [existing] } }))
    expect(c.hooks?.beforeValidate).toEqual([coerceRelationIdsHook, existing])
    const data = (coerceRelationIdsHook as (a: unknown) => unknown)({ data: { customer: '7' }, req: { payload }, collection: { slug: 'carts' } })
    expect(data).toEqual({ customer: 7 })
  })
})
