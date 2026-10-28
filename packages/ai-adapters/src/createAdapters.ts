import type { AdapterProvider, AdapterSet, AdapterValidationResult, ConceptName } from 'payload-ai-core'
import { CONCEPTS } from 'payload-ai-core'
import type { Payload } from 'payload'
import { createBookingAdapter } from './concepts/booking'
import { createCartAdapter } from './concepts/cart'
import { createCategoryAdapter } from './concepts/category'
import { createCustomerAdapter } from './concepts/customer'
import { createKnowledgeAdapter } from './concepts/knowledge'
import { createLeadAdapter } from './concepts/lead'
import { createOfferingAdapter } from './concepts/offering'
import { createOrderAdapter } from './concepts/order'
import { createReviewAdapter } from './concepts/review'
import { configOf } from './mapping/schema'
import type { MergedConcept } from './resolve'
import { makeEnv, mergeOptions, resolveAll } from './resolve'
import type { AdaptersOptions } from './types'

/** Validation result plus non-fatal notes (preset defaults that were dropped). */
export type AdapterValidationReport = AdapterValidationResult & { warnings: string[] }

export interface AdaptersProvider extends AdapterProvider {
  validate(payload: Payload): AdapterValidationReport[]
}

const nestedSlug = (m: MergedConcept, key: string): string[] => {
  const v = m.options[key] as { collection?: string } | false | undefined
  return v && typeof v === 'object' && v.collection ? [v.collection] : []
}

/**
 * Business adapters for the AI suite (design doc §3).
 *
 * ```ts
 * createAdapters({ preset: 'ecommerce', overrides: {
 *   offering: { fields: { title: 'name', price: 'priceInBDT', image: 'gallery.0' } },
 *   knowledge: { collections: ['pages', 'faqs', 'policies'] } } })
 * ```
 */
export const createAdapters = (opts: AdaptersOptions): AdaptersProvider => {
  if (opts.preset === 'custom' && !opts.custom && !opts.overrides)
    throw new Error("[ai-adapters] preset 'custom' needs a `custom` concept map")
  const merged = mergeOptions(opts)

  const resolveFor = (payload: Payload) => {
    const env = makeEnv(configOf(payload), opts)
    return { env, res: resolveAll(env, merged, opts.preset) }
  }

  return {
    preset: opts.preset,

    mappedCollections() {
      const out: Partial<Record<ConceptName, string[]>> = {}
      for (const c of CONCEPTS) {
        const m = merged[c]
        if (!m) continue
        let slugs: string[]
        if (c === 'knowledge') {
          const entries = (m.options.collections as unknown[] | undefined) ?? m.candidates
          slugs = entries.map((e) => (typeof e === 'string' ? e : (e as { collection: string }).collection))
        } else slugs = [...m.candidates]
        if (c === 'offering') slugs.push(...nestedSlug(m, 'variants'))
        out[c] = [...new Set(slugs)]
      }
      return out
    },

    validate(payload) {
      const { res } = resolveFor(payload)
      return CONCEPTS.map((c) => res[c].result)
    },

    build(payload) {
      const { env, res } = resolveFor(payload)
      const ok = (c: ConceptName) => res[c].result.ok && (c === 'knowledge' ? !!res[c].knowledge?.length : !!res[c].main)
      const set: AdapterSet = {}
      if (ok('category')) set.category = createCategoryAdapter(env, res.category)
      const offering = ok('offering') ? createOfferingAdapter(env, res.offering, { category: set.category }) : undefined
      if (offering) set.offering = offering
      if (ok('customer')) set.customer = createCustomerAdapter(env, res.customer)
      if (ok('order')) set.order = createOrderAdapter(env, res.order, { offering: offering?.internals })
      if (ok('cart')) set.cart = createCartAdapter(env, res.cart, { offering })
      if (ok('knowledge')) set.knowledge = createKnowledgeAdapter(env, res.knowledge)
      if (ok('lead')) set.lead = createLeadAdapter(res.lead)
      if (ok('review')) set.review = createReviewAdapter(env, res.review)
      if (ok('booking')) set.booking = createBookingAdapter(env, res.booking)
      return set
    },
  }
}

/** One-line summary per concept for startup logs. */
export const formatValidation = (results: AdapterValidationResult[]): string =>
  results
    .map((r) => `${r.ok ? 'ok ' : 'OFF'} ${r.concept}${r.collection ? ` (${r.collection})` : ''}${r.problems.length ? `: ${r.problems.join('; ')}` : ''}`)
    .join('\n')
