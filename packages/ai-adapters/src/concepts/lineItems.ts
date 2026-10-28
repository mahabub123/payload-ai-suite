import type { AdapterContext, Money } from '@payload-ai-suite/ai-core'
import type { Doc } from '../mapping/values'
import { getPath, relDoc, relId, toNum, toStr } from '../mapping/values'
import type { ResolveEnv, ResolvedTarget } from '../resolve'
import type { PriceSpec } from './common'
import { money, readOpts } from './common'
import type { OfferingInternals } from './offering'

export interface LineItem {
  offeringId: string
  variantId?: string
  title: string
  quantity: number
  price?: Money
}

/**
 * Order / cart line items. Title and unit price come from mapped item fields when present,
 * otherwise from the populated variant / product (ecommerce plugin items hold only product, variant, quantity).
 */
export const lineItems = (
  env: ResolveEnv,
  t: ResolvedTarget,
  doc: Doc,
  ctx: AdapterContext,
  price: PriceSpec,
  offering?: OfferingInternals,
  currency?: unknown,
): LineItem[] => {
  const f = t.fields
  const ro = readOpts(env, ctx)
  const raw = getPath(doc, f.items, ro)
  if (!Array.isArray(raw)) return []
  return raw
    .map((item: unknown): LineItem | null => {
      const it = item as Doc
      const productVal = getPath(it, f.itemOffering, ro)
      const variantVal = f.itemVariant ? getPath(it, f.itemVariant, ro) : undefined
      const offeringId = relId(productVal)
      if (!offeringId) return null
      const product = relDoc(productVal)
      const variant = relDoc(variantVal)
      const mappedProduct = product && offering ? offering.fromDoc(product, ctx) : undefined
      const mappedVariant = variant && offering?.variants ? offering.variantFromDoc(variant, ctx) : undefined
      const unit =
        money(f.itemPrice ? getPath(it, f.itemPrice, ro) : undefined, price, getPath(it, 'currency') ?? currency) ??
        mappedVariant?.price ??
        mappedProduct?.price
      const title =
        toStr(f.itemTitle ? getPath(it, f.itemTitle, ro) : undefined) ??
        [mappedProduct?.title, mappedVariant?.title].filter(Boolean).join(' — ') ??
        ''
      return {
        offeringId,
        variantId: relId(variantVal),
        title: title || offeringId,
        quantity: toNum(getPath(it, f.itemQuantity, ro)) ?? 1,
        price: unit,
      }
    })
    .filter((x): x is LineItem => !!x)
}
