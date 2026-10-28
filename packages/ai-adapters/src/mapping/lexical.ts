/** Lexical (Payload richText) JSON -> plain text. Walks the serialized tree; no editor dependency. */

interface LexNode {
  type?: string
  text?: string
  tag?: string
  listType?: string
  children?: LexNode[]
  fields?: Record<string, unknown>
  [k: string]: unknown
}

export const isLexicalState = (v: unknown): v is { root: LexNode } =>
  typeof v === 'object' &&
  v !== null &&
  'root' in v &&
  typeof (v as { root: unknown }).root === 'object' &&
  Array.isArray((v as { root: LexNode }).root?.children)

const BLOCK_TYPES = new Set(['paragraph', 'heading', 'quote', 'listitem', 'code', 'tablerow', 'horizontalrule'])

const walk = (node: LexNode, out: string[], depth: number): void => {
  switch (node.type) {
    case 'text':
    case 'code-highlight':
      out.push(node.text ?? '')
      return
    case 'linebreak':
      out.push('\n')
      return
    case 'tab':
      out.push('\t')
      return
    case 'upload':
    case 'relationship':
      return
    case 'block':
    case 'inlineBlock': {
      // Custom blocks: flatten string and nested rich text values of their fields.
      const fields = node.fields ?? {}
      const parts: string[] = []
      for (const [k, v] of Object.entries(fields)) {
        if (k === 'id' || k === 'blockType' || k === 'blockName') continue
        if (typeof v === 'string') parts.push(v)
        else if (isLexicalState(v)) parts.push(lexicalToText(v))
      }
      if (parts.length) out.push(parts.join('\n'), node.type === 'block' ? '\n' : '')
      return
    }
  }
  if (node.type === 'list') {
    let n = 1
    for (const child of node.children ?? []) {
      out.push('  '.repeat(depth), node.listType === 'number' ? `${n++}. ` : '- ')
      const inner: string[] = []
      walk(child, inner, depth + 1)
      out.push(inner.join('').replace(/\n+$/, ''), '\n')
    }
    return
  }
  if (node.type === 'listitem') {
    for (const child of node.children ?? []) {
      if (child.type === 'list') {
        out.push('\n')
        walk(child, out, depth)
      } else walk(child, out, depth)
    }
    return
  }
  for (const child of node.children ?? []) walk(child, out, depth)
  if (node.type === 'tablecell') out.push('\t')
  if (node.type && BLOCK_TYPES.has(node.type)) out.push('\n')
}

export const lexicalToText = (state: unknown): string => {
  if (!isLexicalState(state)) return typeof state === 'string' ? state : ''
  const out: string[] = []
  for (const child of state.root.children ?? []) walk(child, out, 0)
  return out
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
