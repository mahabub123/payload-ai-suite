import { z } from 'zod'
import { AIError, defineTool } from '@payload-ai-suite/ai-core'
import type { AITool, ToolContext } from '@payload-ai-suite/ai-core'
import { CHANGESETS } from './collections'
import { filterSchema, toWhere } from './filter'
import { api, idOf } from './local'
import { PROTECTED_FIELDS, type ResolvedCopilotOptions } from './options'

/** Max docs the model may rewrite per proposal (each needs a model call); static `set` edits go up to maxBulkItems. */
export const MAX_AI_REWRITES = 25

const staffOnAdmin = (ctx: ToolContext) => ctx.actor.kind === 'staff' && ctx.surface === 'admin'

const fieldName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Top-level field names only')

const userOf = (ctx: ToolContext) => ctx.actor.user ?? ctx.req?.user ?? null

const localArgs = (ctx: ToolContext) => ({ overrideAccess: false, user: userOf(ctx), req: ctx.req, depth: 0, locale: ctx.locale })

const pick = (doc: Record<string, unknown>, fields: string[]) => {
  const out: Record<string, unknown> = { id: doc.id }
  for (const f of fields) if (f in doc) out[f] = doc[f]
  return out
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export const buildCopilotTools = (opts: ResolvedCopilotOptions): AITool[] => {
  const collection = z
    .string()
    .refine((c) => opts.collections.includes(c), { message: `Collection must be one of: ${opts.collections.join(', ') || '(none configured)'}` })

  const assertAllowed = (c: string) => {
    if (!opts.collections.includes(c)) throw new AIError('forbidden', `The copilot may not access "${c}"`)
  }

  const titleFields = (ctx: ToolContext, c: string) => {
    const cfg = api(ctx.payload).collections?.[c]?.config as { admin?: { useAsTitle?: string } } | undefined
    return [...new Set([cfg?.admin?.useAsTitle, 'title', 'name', 'slug', '_status', 'updatedAt'].filter(Boolean) as string[])]
  }

  const checkWritableFields = (ctx: ToolContext, c: string, fields: string[]) => {
    const known = api(ctx.payload).collections?.[c]?.config?.flattenedFields?.map((f) => f.name)
    for (const f of fields) {
      if (PROTECTED_FIELDS.has(f) || f === opts.tenantField) throw new AIError('forbidden', `Field "${f}" cannot be edited by the copilot`)
      if (known && !known.includes(f)) throw new AIError('validation', `Unknown field "${f}" on ${c}`)
    }
  }

  const findDocuments = defineTool({
    name: 'findDocuments',
    description:
      'Find documents in an allowed admin collection using a structured filter ({field, op, value} | {and:[...]} | {or:[...]}; ops: equals, not_equals, in, not_in, greater_than, greater_than_equal, less_than, less_than_equal, like, contains, exists). Returns ids and a few fields.',
    tier: 'read',
    available: staffOnAdmin,
    input: z.object({
      collection,
      filter: filterSchema.optional(),
      fields: z.array(fieldName).max(12).optional(),
      sort: z.string().regex(/^-?[A-Za-z_][A-Za-z0-9_.]*$/).optional(),
      limit: z.number().int().min(1).max(50).default(10),
    }),
    async run(input, ctx) {
      assertAllowed(input.collection)
      let res: Awaited<ReturnType<ReturnType<typeof api>['find']>>
      try {
        res = await api(ctx.payload).find({
          collection: input.collection,
          where: toWhere(input.filter),
          limit: input.limit,
          sort: input.sort,
          ...localArgs(ctx),
        })
      } catch (e) {
        // Payload rejects unknown query paths; tell the model which fields exist so it can retry.
        if ((e as { name?: string }).name !== 'QueryError') throw e
        const known = api(ctx.payload).collections?.[input.collection]?.config?.flattenedFields?.map((f) => f.name) ?? []
        return {
          data: {
            error: (e as Error).message,
            fields: known.filter((f) => !PROTECTED_FIELDS.has(f) && f !== opts.tenantField).slice(0, 80),
          } as Record<string, unknown>,
        }
      }
      const fields = input.fields?.length ? input.fields : titleFields(ctx, input.collection)
      return {
        data: {
          total: res.totalDocs,
          docs: res.docs.map((d) => pick(ctx.services.guardrails.redact(input.collection, d), fields)),
        } as Record<string, unknown>,
      }
    },
  })

  const summarizeDocument = defineTool({
    name: 'summarizeDocument',
    description: 'Summarize one document (by collection and id) for a staff member.',
    tier: 'read',
    available: staffOnAdmin,
    input: z.object({ collection, id: z.union([z.string(), z.number()]), focus: z.string().max(500).optional() }),
    async run(input, ctx) {
      assertAllowed(input.collection)
      const doc = await api(ctx.payload).findByID({ collection: input.collection, id: input.id, ...localArgs(ctx) })
      const redacted = ctx.services.guardrails.redact(input.collection, doc)
      const res = await ctx.services.ai.generateText(
        {
          task: 'fast',
          system: `Summarize the record for a staff member in 3-5 bullet points.${input.focus ? ` Focus: ${input.focus}` : ''}`,
          prompt: ctx.services.guardrails.quote('record', JSON.stringify(redacted).slice(0, 12000)),
          maxOutputTokens: 400,
        },
        ctx,
      )
      return { data: { id: doc.id, summary: res.text } }
    },
  })

  const draftContent = defineTool({
    name: 'draftContent',
    description: 'Draft text (copy, reply, description, post) from instructions. Never saves anything; the staff member decides what to do with it.',
    tier: 'read',
    available: staffOnAdmin,
    input: z.object({
      instructions: z.string().min(1).max(2000),
      context: z.string().max(8000).optional(),
      format: z.enum(['plain', 'markdown']).default('markdown'),
    }),
    async run(input, ctx) {
      const res = await ctx.services.ai.generateText(
        {
          task: 'write',
          system: `You draft content for a business's staff. Output ${input.format} only, no preamble.`,
          prompt: `${input.instructions}${input.context ? `\n\n${ctx.services.guardrails.quote('context', input.context)}` : ''}`,
          maxOutputTokens: 1500,
        },
        ctx,
      )
      return { data: { draft: res.text } }
    },
  })

  const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()])
  const value = z.union([scalar, z.array(scalar).max(100)])

  const proposeBulkEdit = defineTool({
    name: 'proposeBulkEdit',
    description:
      'Propose a bulk edit on documents matching a structured filter. Either `set` static values (lists allowed; a list replaces the whole field), or give `instructions` to rewrite the listed fields per document. NEVER writes: it saves a changeset with a before/after diff that the staff member reviews and applies or discards in the admin.',
    tier: 'low',
    available: staffOnAdmin,
    input: z
      .object({
        collection,
        filter: filterSchema.optional(),
        fields: z.array(fieldName).min(1).max(10),
        set: z.record(z.string(), value).optional(),
        instructions: z.string().max(2000).optional(),
        limit: z.number().int().min(1).optional(),
      })
      .refine((v) => v.set || v.instructions, { message: 'Provide `set` or `instructions`' }),
    async run(input, ctx) {
      assertAllowed(input.collection)
      checkWritableFields(ctx, input.collection, input.fields)
      if (input.set) for (const k of Object.keys(input.set)) if (!input.fields.includes(k)) throw new AIError('validation', `set.${k} is not in fields`)
      const cap = Math.min(input.limit ?? opts.maxBulkItems, opts.maxBulkItems, input.set ? Infinity : MAX_AI_REWRITES)
      const res = await api(ctx.payload).find({
        collection: input.collection,
        where: toWhere(input.filter),
        limit: cap,
        ...localArgs(ctx),
      })
      const items: { id: string | number; before: Record<string, unknown>; after: Record<string, unknown> }[] = []
      for (const doc of res.docs) {
        const before = Object.fromEntries(input.fields.map((f) => [f, doc[f] ?? null]))
        let after: Record<string, unknown>
        if (input.set) {
          after = { ...before, ...input.set }
        } else {
          // List fields (hasMany text/select, tags) stay lists; a scalar schema would flatten them to a string.
          const shape = Object.fromEntries(input.fields.map((f) => [f, Array.isArray(before[f]) ? z.array(scalar).max(100) : scalar]))
          const r = await ctx.services.ai.generateObject(
            {
              task: 'write',
              system: `Rewrite the given fields of a record according to the instructions. Return a JSON object with exactly these keys: ${input.fields.join(', ')}.`,
              prompt: `Instructions: ${input.instructions}\n\n${ctx.services.guardrails.quote('fields', JSON.stringify(before))}`,
              schema: z.object(shape),
              maxOutputTokens: 800,
            },
            ctx,
          )
          after = { ...before, ...r.object }
        }
        if (!same(before, after)) items.push({ id: doc.id, before, after })
      }
      const userId = idOf(userOf(ctx))
      const summary = `${input.collection}: ${input.set ? `set ${Object.keys(input.set).join(', ')}` : (input.instructions ?? '').slice(0, 80)} (${items.length} docs)`
      const data: Record<string, unknown> = {
        summary,
        targetCollection: input.collection,
        status: 'proposed',
        fields: input.fields,
        items,
        instructions: input.instructions,
        createdBy: userId,
      }
      if (opts.tenantField && ctx.tenant !== undefined) data[opts.tenantField] = ctx.tenant
      const cs = await api(ctx.payload).create({ collection: CHANGESETS, data, overrideAccess: true, depth: 0 })
      const truncated = res.totalDocs > res.docs.length
      return {
        data: { changesetId: cs.id, count: items.length, matched: res.totalDocs, truncated, sample: items.slice(0, 3), status: 'proposed' },
        cards: [
          {
            type: 'action-result',
            actionId: `changeset:${cs.id}`,
            status: 'proposed',
            message: `Proposed changes to ${items.length} ${input.collection} document(s)${truncated ? ` (first ${res.docs.length} of ${res.totalDocs})` : ''}. Review the diff, then Apply or Discard.`,
          },
        ],
      }
    },
  })

  const copilotSearchKnowledge = defineTool({
    name: 'copilotSearchKnowledge',
    description: 'Search the knowledge base (pages, FAQs, policies, including staff-only docs). Returns snippets with sources.',
    tier: 'read',
    available: staffOnAdmin,
    input: z.object({ query: z.string().min(1).max(500), k: z.number().int().min(1).max(10).default(5) }),
    async run(input, ctx) {
      const { hits, citations } = await ctx.services.knowledge.search(input.query, ctx, { k: input.k, visibility: ['public', 'customers', 'staff'] })
      return {
        data: { hits: hits.map((h) => ({ title: h.title, source: `${h.sourceCollection}/${h.sourceId}`, content: h.content.slice(0, 800) })) },
        citations,
      }
    },
  })

  return [findDocuments, summarizeDocument, draftContent, proposeBulkEdit, copilotSearchKnowledge] as AITool[]
}

export const COPILOT_TOOL_NAMES = ['findDocuments', 'summarizeDocument', 'draftContent', 'proposeBulkEdit', 'copilotSearchKnowledge']
