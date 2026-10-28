import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Payload } from 'payload'
import { AIError, getSuiteState, type AICoreOptions, type MessagePart } from '@payload-ai-suite/ai-core'
import type { AiMediaOptions, ImageSource } from './types'

type AnyRecord = Record<string, any>

export const isImage = (doc: AnyRecord): boolean => String(doc.mimeType ?? '').startsWith('image/')

const uploadConfig = (payload: Payload, collection: string): AnyRecord | undefined => {
  const u = payload.collections?.[collection as keyof typeof payload.collections]?.config?.upload as AnyRecord | boolean | undefined
  return u && typeof u === 'object' ? u : undefined
}

/**
 * Get bytes or a URL the provider can read. Order: options.resolveImage → local file in staticDir
 * (sent inline, works for localhost) → absolute url → serverURL + relative url.
 */
export const resolveImage = async (payload: Payload, collection: string, doc: AnyRecord, options: AiMediaOptions): Promise<ImageSource> => {
  if (options.resolveImage) {
    const custom = await options.resolveImage(doc, { payload, collection })
    if (custom) return custom
  }
  const mediaType = typeof doc.mimeType === 'string' ? doc.mimeType : undefined
  const staticDir = uploadConfig(payload, collection)?.staticDir
  if (typeof doc.filename === 'string' && typeof staticDir === 'string') {
    const dir = path.resolve(staticDir)
    const file = path.resolve(dir, doc.filename)
    if (file.startsWith(dir + path.sep)) {
      try {
        const s = await stat(file)
        if (s.isFile() && s.size <= (options.maxImageBytes ?? 10 * 1024 * 1024)) {
          return { data: (await readFile(file)).toString('base64'), mediaType }
        }
      } catch {
        /* not on local disk (cloud storage) — use the URL */
      }
    }
  }
  const url = typeof doc.url === 'string' ? doc.url : undefined
  if (url && /^https?:\/\//i.test(url)) return { url, mediaType }
  const serverURL = payload.config?.serverURL
  if (url?.startsWith('/') && serverURL) return { url: `${serverURL.replace(/\/$/, '')}${url}`, mediaType }
  throw new AIError('bad_request', 'Cannot read this image for AI: set serverURL in the Payload config or pass a resolveImage option.')
}

export const imagePart = (img: ImageSource): MessagePart => ({ type: 'image', url: img.url, data: img.data, mediaType: img.mediaType })

export const tenantFieldName = (payload: Payload): string | undefined =>
  (getSuiteState(payload.config)?.options as AICoreOptions | undefined)?.tenant?.field

export const tenantOf = (payload: Payload, doc: AnyRecord): string | number | undefined => {
  const f = tenantFieldName(payload)
  const v = f ? doc[f] : undefined
  return v && typeof v === 'object' ? (v as AnyRecord).id : (v as string | number | undefined)
}

export const hasField = (payload: Payload, collection: string, name: string): boolean => {
  const fields = payload.collections?.[collection as keyof typeof payload.collections]?.config?.flattenedFields as AnyRecord[] | undefined
  return Boolean(fields?.some((f) => f.name === name))
}

export const isLocalizedField = (payload: Payload, collection: string, name: string): boolean => {
  const fields = payload.collections?.[collection as keyof typeof payload.collections]?.config?.flattenedFields as AnyRecord[] | undefined
  return Boolean(fields?.find((f) => f.name === name)?.localized)
}

/** Short, redacted text about the image (filename, caption, existing alt) for prompts. */
export const imageInfo = (doc: AnyRecord, altField: string): string =>
  [
    doc.filename ? `filename: ${String(doc.filename)}` : '',
    doc[altField] ? `current alt: ${String(doc[altField])}` : '',
    typeof doc.caption === 'string' ? `caption: ${doc.caption}` : '',
    typeof doc.title === 'string' ? `title: ${doc.title}` : '',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 1000)

export const clamp = (text: string, max: number): string => {
  const s = text.replace(/\s+/g, ' ').trim().replace(/^(an? )?(image|photo|picture) of /i, '')
  if ([...s].length <= max) return s
  const cut = [...s].slice(0, max).join('')
  const sp = cut.lastIndexOf(' ')
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:–—-]+$/u, '')
}

export const normalizeTags = (tags: string[], max = 8): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of tags) {
    const v = String(t).trim().replace(/^#/, '').toLowerCase()
    if (!v || v.length > 40 || seen.has(v)) continue
    seen.add(v)
    out.push(v)
    if (out.length >= max) break
  }
  return out
}

export const extFor = (mediaType: string) => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' })[mediaType] ?? 'png'
