import { describe, expect, it } from 'vitest'
import type { Config } from 'payload'
import { SUITE_KEY } from 'payload-ai-core'
import { aiMedia } from './index'

const existingHook = () => undefined
const base = (media: Record<string, unknown> = { upload: true }): Config =>
  ({
    secret: 'x',
    collections: [
      { slug: 'media', fields: [{ name: 'alt', type: 'text' }], hooks: { afterChange: [existingHook] }, ...media },
      { slug: 'products', fields: [] },
    ],
    custom: { [SUITE_KEY]: { coreInstalled: true, modules: [], options: {} } },
  }) as unknown as Config

const apply = (cfg: Config, o?: Parameters<typeof aiMedia>[0]) => aiMedia(o)(cfg) as Config

describe('aiMedia plugin config', () => {
  it('adds AI metadata fields + the upload hook to media, keeping existing hooks', () => {
    const c = apply(base())
    const media = c.collections!.find((x) => x.slug === 'media')!
    const names = media.fields.map((f) => ('name' in f ? f.name : ''))
    expect(names).toEqual(['alt', 'aiGenerated', 'aiSource', 'aiModel', 'aiOperation', 'aiTags'])
    const gen = media.fields[1] as any
    expect(gen.admin).toMatchObject({ readOnly: true, position: 'sidebar' })
    expect((media.fields[2] as any).relationTo).toBe('media')
    expect(media.hooks?.afterChange).toHaveLength(2)
    expect(media.hooks?.afterChange?.[0]).toBe(existingHook)
    expect(c.collections!.find((x) => x.slug === 'products')!.fields).toHaveLength(0)
    expect(c.jobs?.tasks?.map((t) => t.slug)).toContain('ai-media-describe')
    expect(c.endpoints?.map((e) => e.path)).toEqual(
      expect.arrayContaining(['/ai/media/alt-text', '/ai/media/tag', '/ai/media/remove-background', '/ai/media/variation', '/ai/media/lifestyle', '/ai/media/image-to-listing']),
    )
  })

  it('does nothing to media when it is not an upload collection (default detection)', () => {
    const c = apply(base({ upload: undefined }))
    expect(c.collections!.find((x) => x.slug === 'media')!.fields).toHaveLength(1)
  })

  it('fails loudly on a wrong explicit collection list', () => {
    expect(() => apply(base(), { collections: ['products'] })).toThrow(/not an upload collection/)
    expect(() => apply(base(), { collections: ['nope'] })).toThrow(/does not exist/)
  })

  it('tagsField: false skips the tags field', () => {
    const media = apply(base(), { tagsField: false }).collections!.find((x) => x.slug === 'media')!
    expect(media.fields.some((f) => 'name' in f && f.name === 'aiTags')).toBe(false)
  })
})
