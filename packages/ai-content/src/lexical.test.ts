import { describe, expect, it } from 'vitest'
import { createHarness } from '../test/setup'
import { markdownToLexical } from './lexical'

const types = (node: any): string[] => [node.type, ...(node.children ?? []).flatMap(types)]

describe('markdown → lexical', () => {
  it('converts model Markdown with the field editor config', async () => {
    const h = await createHarness()
    const state = (await markdownToLexical(h.payload, 'products', 'description', '## Why you will love it\n\nSoft **cotton**.\n\n- Handwoven\n- Breathable')) as any
    const all = types(state.root)
    expect(all).toContain('heading')
    expect(all).toContain('list')
    expect(all).toContain('listitem')
    const bold = JSON.stringify(state).includes('"format":1')
    expect(bold).toBe(true)
  })

  it('falls back to the default editor when the field has no adapter', async () => {
    const h = await createHarness()
    const state = (await markdownToLexical(h.payload, 'products', 'missing', 'Hello')) as any
    expect(state.root.children[0].type).toBe('paragraph')
  })

  it('generate endpoint returns Lexical value for rich text fields', async () => {
    const h = await createHarness()
    h.services.provider.enqueue('```markdown\n## Festive pick\n\nA red saree.\n```')
    const r = await h.call('/ai/content/generate', { action: 'write', collection: 'products', docId: 'p1', field: 'description', stream: false })
    expect(r.fieldType).toBe('richText')
    expect(r.output).toBe('## Festive pick\n\nA red saree.')
    expect(types(r.value.root)).toContain('heading')
  })
})
