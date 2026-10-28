import { z } from 'zod'
import type { AIEndpointDefinition } from 'payload-ai-core'
import { AIError } from 'payload-ai-core'
import { MODULE, formatMoney } from './util'
import { PROMPTS } from './prompts'

export const PLATFORM_LIMITS = {
  x: 280,
  facebook: 63_206,
  instagram: 2_200,
  linkedin: 3_000,
} as const
export type SocialPlatform = keyof typeof PLATFORM_LIMITS
const PLATFORMS = Object.keys(PLATFORM_LIMITS) as [SocialPlatform, ...SocialPlatform[]]

/** Characters as users see them (code points), not UTF-16 units. */
export const charCount = (s: string): number => [...s].length

/** Hard-enforce a limit: cut at a word boundary and add an ellipsis. */
export const fitToLimit = (text: string, limit: number): string => {
  const chars = [...text.trim()]
  if (chars.length <= limit) return chars.join('')
  const cut = chars.slice(0, limit - 1).join('')
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** Join text + hashtags, dropping hashtags first, then trimming text, to stay within the platform limit. */
export const composePost = (platform: SocialPlatform, text: string, hashtags: string[] = []): string => {
  const limit = PLATFORM_LIMITS[platform]
  const tags = hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`).replace(/\s+/g, ''))
  const body = text.trim()
  while (tags.length) {
    const full = `${body}\n\n${tags.join(' ')}`
    if (charCount(full) <= limit) return full
    tags.pop()
  }
  return fitToLimit(body, limit)
}

const modelOutput = z.object({
  posts: z.array(z.object({ platform: z.enum(PLATFORMS), text: z.string().min(1), hashtags: z.array(z.string()).max(30).default([]) })),
})

const socialInput = z.object({
  brief: z.string().min(3).max(4000),
  platforms: z.array(z.enum(PLATFORMS)).min(1).max(4),
  offeringId: z.string().optional(),
})

export const socialEndpoint: AIEndpointDefinition<z.infer<typeof socialInput>> = {
  path: '/ai/marketing/social',
  method: 'post',
  module: MODULE,
  access: 'staff',
  surface: 'admin',
  input: socialInput,
  async handler({ ctx, services, input }) {
    const check = services.guardrails.checkInput(input.brief, ctx)
    if (!check.ok) throw new AIError('validation', 'Brief rejected', { details: check.issues })
    const product = input.offeringId && ctx.adapters.offering ? await ctx.adapters.offering.get(input.offeringId, ctx.adapterCtx) : null
    const platforms = [...new Set(input.platforms)]
    const prompt = await services.prompts.render(
      PROMPTS.social,
      {
        brief: input.brief,
        platforms: platforms.join(', '),
        limits: platforms.map((p) => `${p} ${PLATFORM_LIMITS[p]}`).join(', '),
        product: product ? `${product.title}${product.price ? ` — ${formatMoney(product.price)}` : ''}${product.url ? ` ${product.url}` : ''}` : '(none)',
      },
      ctx,
    )
    const { object } = await services.ai.generateObject(
      { task: 'write', system: prompt.system, prompt: prompt.user ?? input.brief, schema: modelOutput, schemaName: 'SocialPosts', promptRef: { slug: prompt.slug, version: prompt.version } },
      ctx,
    )
    const posts = platforms.flatMap((platform) => {
      const p = object.posts.find((x) => x.platform === platform)
      if (!p) return []
      const text = composePost(platform, p.text, p.hashtags)
      return [{ platform, text, chars: charCount(text), limit: PLATFORM_LIMITS[platform] }]
    })
    return { posts, missing: platforms.filter((p) => !posts.some((x) => x.platform === p)) }
  },
}
