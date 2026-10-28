import type { AdapterContext, Cart, CartAdapter, OfferingAdapter } from 'payload-ai-core'
import { AIError } from 'payload-ai-core'
import { create, find, findOne, ownerId, update } from '../local'
import type { Doc } from '../mapping/values'
import { getPath, relId, setPath, toIso, toNum } from '../mapping/values'
import type { Resolution, ResolveEnv } from '../resolve'
import type { PriceSpec } from './common'
import { clampLimit, money, orNull, reader } from './common'
import { lineItems } from './lineItems'
import type { OfferingInternals } from './offering'

/** Cart as returned by the adapter; `secret` is set once when a guest cart is created (ecommerce guest carts). */
export type CartWithSecret = Cart & { secret?: string }

/** addItem input; `cartSecret` (optional, non-contract) unlocks an existing guest cart. */
export interface AddItemInput {
  offeringId: string
  variantId?: string
  quantity: number
  cartId?: string
  cartSecret?: string
}

const MAX_QTY = 999

export const createCartAdapter = (
  env: ResolveEnv,
  r: Resolution,
  deps: { offering?: OfferingAdapter & { internals?: OfferingInternals } } = {},
): CartAdapter => {
  const t = r.main!
  const f = t.fields
  const o = r.options as { currency: string }
  const price: PriceSpec = { currency: o.currency, unit: 'minor', decimals: 2 }

  const fromDoc = (doc: Doc, ctx: AdapterContext): CartWithSecret => {
    const read = reader(env, t, ctx)
    const currency = read(doc, 'currency')
    const items = lineItems(env, t, doc, ctx, price, deps.offering?.internals, currency)
    const out: CartWithSecret = {
      id: String(doc.id),
      items,
      subtotal: money(read(doc, 'subtotal'), price, currency),
      customerId: relId(read(doc, 'customer')),
      updatedAt: toIso(read(doc, 'updatedAt') ?? doc.updatedAt),
    }
    if (typeof doc.secret === 'string') out.secret = doc.secret
    return out
  }

  const secretArgs = (secret?: string) => (secret ? { extra: { context: { cartSecret: secret } } } : {})

  /** Only the owner's cart, or an ownerless guest cart reachable via its secret. */
  const allowed = (doc: Doc, ctx: AdapterContext) => {
    if (ctx.system) return true
    const owner = ownerId(ctx)
    const cartOwner = f.customer ? relId(getPath(doc, f.customer)) : undefined
    return cartOwner ? cartOwner === owner : true
  }

  const load = async (ctx: AdapterContext, cartId?: string, secret?: string): Promise<Doc | null> => {
    if (cartId) {
      const doc = await orNull(findOne(t, cartId, ctx, { depth: 1, ...secretArgs(secret) }))
      return doc && allowed(doc, ctx) ? doc : null
    }
    const owner = ownerId(ctx)
    if (!owner || !f.customer) return null
    const res = await find(t, ctx, {
      where: {
        [f.customer]: { equals: owner },
        ...(f.purchasedAt ? { [f.purchasedAt]: { exists: false } } : {}),
      },
      sort: `-${f.updatedAt ?? 'updatedAt'}`,
      limit: 1,
      depth: 1,
    })
    const doc = res.docs[0]
    return doc && relId(getPath(doc, f.customer)) === owner ? doc : null
  }

  const adapter: CartAdapter = {
    collection: t.collection,
    fields: { ...f },

    async get(ctx) {
      const secret = (ctx as { cartSecret?: string }).cartSecret
      const doc = await load(ctx, ctx.cartId, secret)
      return doc ? fromDoc(doc, ctx) : null
    },

    async addItem(rawInput, ctx) {
      const input = rawInput as AddItemInput
      const qty = Math.floor(input.quantity)
      if (!(qty >= 1 && qty <= MAX_QTY)) throw new AIError('validation', 'Quantity must be between 1 and 999')
      if (deps.offering) {
        const off = await deps.offering.get(input.offeringId, ctx)
        if (!off) throw new AIError('not_found', 'Product not found')
        if (off.variants?.length) {
          const v = input.variantId ? off.variants.find((x) => x.id === input.variantId) : undefined
          if (!v) throw new AIError('validation', 'Choose a variant', { details: { variants: off.variants.map((x) => ({ id: x.id, title: x.title })) } })
          if (v.inStock === false) throw new AIError('conflict', 'That variant is out of stock')
        } else if (off.inStock === false) throw new AIError('conflict', 'Out of stock')
      }

      let secret = input.cartSecret
      let doc = await load(ctx, input.cartId, secret)
      if (input.cartId && !doc) throw new AIError('not_found', 'Cart not found')
      let created = false
      if (!doc) {
        const owner = ownerId(ctx)
        const data: Doc = {}
        setPath(data, f.items, [])
        if (owner && f.customer) setPath(data, f.customer, owner)
        if (f.currency) setPath(data, f.currency, o.currency)
        doc = await create(t, data, ctx)
        created = true
        if (typeof doc.secret === 'string') secret = doc.secret
      }
      const existing = (getPath(doc, f.items) as Doc[] | undefined) ?? []
      // Write ids, not populated docs.
      const items: Doc[] = existing.map((it) => {
        const out: Doc = { ...it, [f.itemOffering]: relId(getPath(it, f.itemOffering)) }
        if (f.itemVariant && it[f.itemVariant] != null) out[f.itemVariant] = relId(getPath(it, f.itemVariant))
        return out
      })
      const match = items.find(
        (it) =>
          it[f.itemOffering] === input.offeringId &&
          (f.itemVariant ? (relId(it[f.itemVariant]) ?? undefined) === (input.variantId ?? undefined) : true),
      )
      if (match) match[f.itemQuantity] = Math.min(MAX_QTY, (toNum(match[f.itemQuantity]) ?? 0) + qty)
      else {
        const item: Doc = { [f.itemOffering]: input.offeringId, [f.itemQuantity]: qty }
        if (input.variantId && f.itemVariant) item[f.itemVariant] = input.variantId
        items.push(item)
      }
      const patch: Doc = {}
      setPath(patch, f.items, items)
      await update(t, String(doc.id), patch, ctx, secretArgs(secret))
      const fresh = await load(ctx, String(doc.id), secret)
      const cart = fromDoc(fresh ?? doc, ctx)
      if (created && secret) cart.secret = secret
      return cart
    },

    async listAbandoned(opts, ctx) {
      const updated = f.updatedAt ?? 'updatedAt'
      const res = await find(t, ctx, {
        where: {
          [updated]: { less_than: opts.olderThan.toISOString() },
          ...(f.purchasedAt ? { [f.purchasedAt]: { exists: false } } : {}),
        },
        sort: `-${updated}`,
        limit: clampLimit(opts.limit, 100, 500),
        depth: 1,
      })
      return res.docs.map((d) => fromDoc(d, ctx)).filter((c) => c.items.length > 0)
    },
  }
  return adapter
}
