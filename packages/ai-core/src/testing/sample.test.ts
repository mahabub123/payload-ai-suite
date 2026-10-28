import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createMockProvider, sampleFromSchema } from './index'

const schemaOf = (s: z.ZodType) => z.toJSONSchema(s, { unrepresentable: 'any' }) as Record<string, unknown>

describe('sampleFromSchema', () => {
  it('produces values that pass the original zod schema', () => {
    const s = z.object({
      alt: z.string().min(3).max(125),
      tags: z.array(z.string()).min(1),
      topic: z.enum(['billing', 'returns']),
      priority: z.number().int().min(1),
      maybe: z.string().nullable().optional(),
      nested: z.object({ ok: z.boolean() }),
    })
    expect(s.safeParse(sampleFromSchema(schemaOf(s))).success).toBe(true)
  })

  it('mock provider returns a schema-valid object for structured calls', async () => {
    const p = createMockProvider()
    const s = z.object({ title: z.string().max(60) })
    const r = await p.chat({ model: 'm', messages: [{ role: 'user', content: 'x' }], responseSchema: schemaOf(s) })
    expect(s.safeParse(r.object).success).toBe(true)
  })

  it('keeps scripted JSON replies untouched', async () => {
    const p = createMockProvider({ fallback: '{"title":"scripted"}' })
    const r = await p.chat({ model: 'm', messages: [], responseSchema: { type: 'object' } })
    expect(r.object).toBeUndefined()
  })
})
