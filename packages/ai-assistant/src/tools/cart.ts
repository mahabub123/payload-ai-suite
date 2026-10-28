import { z } from 'zod'
import { defineTool } from 'payload-ai-core'
import { turnOf } from '../state'

export const addToCart = defineTool({
  name: 'addToCart',
  description: 'Add a product (and variant) to the shopper cart. Only after the shopper asked for it.',
  tier: 'low',
  requires: ['cart', 'offering'],
  input: z.object({
    offeringId: z.string().min(1),
    variantId: z.string().optional(),
    quantity: z.number().int().min(1).max(20).default(1),
  }),
  async run(input, ctx) {
    const cartId = turnOf(ctx)?.page?.cartId
    const cart = await ctx.adapters.cart!.addItem({ ...input, cartId }, ctx.adapterCtx)
    return {
      data: { cartId: cart.id, itemCount: cart.items.reduce((n, i) => n + i.quantity, 0), subtotal: cart.subtotal },
      cards: [{ type: 'cart', cart }],
    }
  },
})
