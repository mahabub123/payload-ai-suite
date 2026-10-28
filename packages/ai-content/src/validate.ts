import type { Category } from 'payload-ai-core'
import { SEO_LIMITS } from './prompts'

/** Cut to `max` characters at a word boundary (no ellipsis — meta tags and fields must stay clean). */
export const clampText = (text: string, max: number): string => {
  const s = text.replace(/\s+/g, ' ').trim()
  if ([...s].length <= max) return s
  const chars = [...s].slice(0, max)
  const cut = chars.join('')
  const lastSpace = cut.lastIndexOf(' ')
  const out = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut
  return out.replace(/[\s,;:–—-]+$/u, '')
}

export const enforceSeo = (seo: { title: string; description: string }) => ({
  title: clampText(seo.title, SEO_LIMITS.title),
  description: clampText(seo.description, SEO_LIMITS.description),
})

/**
 * Keep only suggestions that are real categories. The model may answer with ids or titles;
 * both are mapped to ids, everything else is dropped. De-duplicated, original order kept.
 */
export const validateCategories = (suggested: string[], existing: Category[]): Category[] => {
  const byId = new Map(existing.map((c) => [String(c.id), c]))
  const byTitle = new Map(existing.map((c) => [c.title.trim().toLowerCase(), c]))
  const bySlug = new Map(existing.filter((c) => c.slug).map((c) => [String(c.slug).toLowerCase(), c]))
  const out = new Map<string, Category>()
  for (const s of suggested) {
    const key = String(s).trim()
    const c = byId.get(key) ?? byTitle.get(key.toLowerCase()) ?? bySlug.get(key.toLowerCase())
    if (c) out.set(String(c.id), c)
  }
  return [...out.values()]
}

export const normalizeTags = (tags: string[], max = 8): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of tags) {
    const v = String(t).trim().replace(/^#/, '').replace(/\s+/g, ' ')
    if (!v || v.length > 40 || seen.has(v.toLowerCase())) continue
    seen.add(v.toLowerCase())
    out.push(v)
    if (out.length >= max) break
  }
  return out
}

/** Strip code fences / wrapping quotes models sometimes add; plain fields also lose Markdown emphasis. */
export const cleanOutput = (text: string, plain: boolean): string => {
  let s = text.trim()
  const fence = s.match(/^```(?:\w+)?\n([\s\S]*?)\n```$/)
  if (fence) s = fence[1].trim()
  if (/^(["“«'])[\s\S]*(["”»'])$/.test(s) && s.length > 2 && !s.slice(1, -1).match(/["“”«»]/)) s = s.slice(1, -1).trim()
  if (plain) s = s.replace(/^#{1,6}\s+/gm, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1')
  return s
}

export const attributesToRecord = (list: { name: string; value: string }[]): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const { name, value } of list) {
    const k = String(name).trim()
    const v = String(value).trim()
    if (k && v) out[k] = v
  }
  return out
}
