import type { CollectionConfig, Config, Field } from 'payload'
import { describeOnUpload } from './hooks'
import type { AiMediaOptions } from './types'

const hasField = (fields: Field[], name: string) => fields.some((f) => 'name' in f && f.name === name)
const sidebarRO = { position: 'sidebar' as const, readOnly: true }
/** Set on create by the module; nobody may relabel afterwards. */
const lockedAfterCreate = { update: () => false }

/** Which upload collections the module manages. Fails loudly on a wrong explicit list (§3 "wrong map fails loudly"). */
export const resolveMediaCollections = (config: Config, options: AiMediaOptions): string[] => {
  const all = config.collections ?? []
  if (!options.collections) {
    const media = all.find((c) => c.slug === 'media')
    return media?.upload ? ['media'] : []
  }
  for (const slug of options.collections) {
    const c = all.find((x) => x.slug === slug)
    if (!c) throw new Error(`[ai-media] collection "${slug}" does not exist`)
    if (!c.upload) throw new Error(`[ai-media] collection "${slug}" is not an upload collection`)
  }
  return options.collections
}

export const aiMediaFields = (slug: string, existing: Field[], options: AiMediaOptions): Field[] => {
  const tagsField = options.tagsField === false ? undefined : (options.tagsField ?? 'aiTags')
  const add: Field[] = []
  if (!hasField(existing, 'aiGenerated')) {
    add.push({
      name: 'aiGenerated',
      type: 'checkbox',
      label: 'AI-generated',
      defaultValue: false,
      index: true,
      access: lockedAfterCreate,
      admin: { ...sidebarRO, description: 'Created by an AI image model. Label it as AI-generated where shown.' },
    })
  }
  if (!hasField(existing, 'aiSource')) {
    add.push({
      name: 'aiSource',
      type: 'relationship',
      relationTo: slug as never,
      label: 'AI source image',
      access: lockedAfterCreate,
      admin: { ...sidebarRO, condition: (data) => Boolean(data?.aiGenerated) },
    } as Field)
  }
  if (!hasField(existing, 'aiModel')) {
    add.push({ name: 'aiModel', type: 'text', access: lockedAfterCreate, admin: { ...sidebarRO, condition: (data) => Boolean(data?.aiGenerated) } })
  }
  if (!hasField(existing, 'aiOperation')) {
    add.push({ name: 'aiOperation', type: 'text', access: lockedAfterCreate, admin: { ...sidebarRO, hidden: true } })
  }
  if (tagsField && !hasField(existing, tagsField)) {
    add.push({ name: tagsField, type: 'text', hasMany: true, label: 'AI tags', admin: { position: 'sidebar' } } as Field)
  }
  return [...existing, ...add]
}

/** Add AI metadata fields and the describe-on-upload hook to the managed media collections (existing hooks kept). */
export const extendMediaConfig = (config: Config, options: AiMediaOptions, allowed: Set<string>): Config => {
  const slugs = new Set(resolveMediaCollections(config, options))
  for (const s of slugs) allowed.add(s)
  if (!slugs.size) return config
  const hook = describeOnUpload(options)
  return {
    ...config,
    collections: (config.collections ?? []).map((c): CollectionConfig => {
      if (!slugs.has(c.slug)) return c
      return {
        ...c,
        fields: aiMediaFields(c.slug, c.fields, options),
        hooks: { ...c.hooks, afterChange: [...(c.hooks?.afterChange ?? []), hook] },
      }
    }),
  }
}
