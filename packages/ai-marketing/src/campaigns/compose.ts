import { z } from 'zod'
import type { AIContext, AIEndpointDefinition, CoreServices } from '@payload-ai-suite/ai-core'
import { AIError } from '@payload-ai-suite/ai-core'
import { MODULE, SLUGS, formatMoney, markdownToText } from '../util'
import { PROMPTS } from '../prompts'
import { CAMPAIGN_KINDS, type CampaignDoc, type CampaignKind, type CampaignStep, type ProductBlock } from './types'

export const emailDraftSchema = z.object({
  subjectVariants: z.array(z.string().min(1).max(120)).min(3).max(5),
  markdown: z.string().min(1).max(20_000),
})

const toBlock = (o: { id: string; title: string; url?: string; imageUrl?: string; price?: { amount: number; currency: string } }): ProductBlock => ({
  offeringId: o.id,
  title: o.title,
  url: o.url,
  imageUrl: o.imageUrl,
  price: o.price,
})

const hasCollection = (ctx: AIContext, slug: string) =>
  Boolean((ctx.payload.collections as Record<string, unknown> | undefined)?.[slug])

/** Item ids from an ai-recs row, whatever shape the search module stored (ids or objects). */
const recItemIds = (items: unknown): string[] =>
  Array.isArray(items)
    ? items
        .map((i) => (typeof i === 'object' && i ? (i as { offeringId?: unknown; id?: unknown }).offeringId ?? (i as { id?: unknown }).id : i))
        .filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
        .map(String)
    : []

/** Product blocks: explicit ids, else ai-recs for an anchor offering, else newest in-stock offerings. Prices from the adapter only. */
export const pickProducts = async (
  ctx: AIContext,
  opts: { offeringIds?: string[]; anchorOfferingId?: string; count: number },
): Promise<ProductBlock[]> => {
  const offering = ctx.adapters.offering
  if (!offering || opts.count === 0) return []
  let ids = opts.offeringIds ?? []
  if (!ids.length && opts.anchorOfferingId && hasCollection(ctx, SLUGS.recs)) {
    const recs = await ctx.payload.find({
      collection: SLUGS.recs as never,
      where: { offeringId: { equals: opts.anchorOfferingId } },
      sort: '-computedAt',
      limit: 5,
      depth: 0,
      overrideAccess: true,
    })
    const docs = recs.docs as unknown as { kind?: string; items?: unknown }[]
    const pick = docs.find((d) => d.kind === 'bought-together') ?? docs[0]
    ids = recItemIds(pick?.items)
  }
  if (ids.length) {
    const { items } = await offering.search({ ids: ids.slice(0, opts.count), limit: opts.count }, ctx.adapterCtx)
    return items.filter((i) => i.inStock !== false).map(toBlock)
  }
  const { items } = await offering.search({ sort: 'newest', inStock: true, limit: opts.count }, ctx.adapterCtx)
  return items.map(toBlock)
}

export interface ComposedStep {
  subjectVariants: string[]
  markdown: string
  html: string
  text: string
  productBlocks: ProductBlock[]
}

export const composeStep = async (
  ctx: AIContext,
  services: CoreServices,
  input: { kind: CampaignKind; brief: string; step: number; products: ProductBlock[] },
): Promise<ComposedStep> => {
  const check = services.guardrails.checkInput(input.brief, ctx)
  if (!check.ok) throw new AIError('validation', 'Brief rejected', { details: check.issues })
  const prompt = await services.prompts.render(
    PROMPTS.email,
    {
      kind: input.kind,
      step: input.step + 1,
      brief: input.brief,
      products: input.products.length
        ? input.products.map((p) => `${p.title}${p.price ? ` (${formatMoney(p.price)})` : ''}`).join('; ')
        : '(none)',
      // The prompt names the {{name}} merge tag; the renderer would blank it. send.ts fills it per recipient.
      name: '{{name}}',
    },
    ctx,
  )
  const { object } = await services.ai.generateObject(
    {
      task: 'write',
      system: prompt.system,
      prompt: prompt.user ?? input.brief,
      schema: emailDraftSchema,
      schemaName: 'EmailDraft',
      promptRef: { slug: prompt.slug, version: prompt.version },
    },
    ctx,
  )
  const subjects = [...new Set(object.subjectVariants.map((s) => s.trim()).filter(Boolean))]
  return {
    subjectVariants: subjects,
    markdown: object.markdown,
    html: services.guardrails.renderMarkdown(object.markdown),
    text: markdownToText(object.markdown),
    productBlocks: input.products,
  }
}

const draftInput = z.object({
  brief: z.string().min(3).max(4000),
  kind: z.enum(CAMPAIGN_KINDS as [CampaignKind, ...CampaignKind[]]).optional(),
  campaignId: z.union([z.string(), z.number()]).transform(String).optional(),
  stepIndex: z.number().int().min(0).max(20).default(0),
  offeringIds: z.array(z.string()).max(6).optional(),
  anchorOfferingId: z.string().optional(),
  productCount: z.number().int().min(0).max(6).default(3),
  /** Write the composed step into the campaign (requires campaignId). */
  save: z.boolean().default(false),
})

export const draftsEndpoint: AIEndpointDefinition<z.infer<typeof draftInput>> = {
  path: '/ai/marketing/drafts',
  method: 'post',
  module: MODULE,
  access: 'staff',
  surface: 'admin',
  input: draftInput,
  async handler({ ctx, services, input, req }) {
    let campaign: CampaignDoc | undefined
    if (input.campaignId) {
      campaign = (await ctx.payload.findByID({
        collection: SLUGS.campaigns as never,
        id: input.campaignId,
        depth: 0,
        req,
        overrideAccess: false,
      })) as unknown as CampaignDoc
    }
    const kind = input.kind ?? campaign?.kind ?? 'one-off'
    const products = await pickProducts(ctx, { offeringIds: input.offeringIds, anchorOfferingId: input.anchorOfferingId, count: input.productCount })
    const composed = await composeStep(ctx, services, { kind, brief: input.brief, step: input.stepIndex, products })

    if (input.save) {
      if (!campaign) throw new AIError('validation', 'save requires campaignId')
      const steps: CampaignStep[] = [...(campaign.steps ?? [])]
      while (steps.length <= input.stepIndex) steps.push({ delayHours: 0 })
      const prev = steps[input.stepIndex]
      steps[input.stepIndex] = {
        ...prev,
        subjectVariants: composed.subjectVariants.map((subject) => ({ subject })),
        chosenSubject: prev.chosenSubject && composed.subjectVariants.includes(prev.chosenSubject) ? prev.chosenSubject : null,
        markdown: composed.markdown,
        html: composed.html,
        text: composed.text,
        productBlocks: composed.productBlocks,
      }
      await ctx.payload.update({
        collection: SLUGS.campaigns as never,
        id: campaign.id,
        data: { steps } as never,
        req,
        overrideAccess: false,
      })
    }
    return { ...composed, saved: input.save, campaignId: campaign?.id }
  },
}
