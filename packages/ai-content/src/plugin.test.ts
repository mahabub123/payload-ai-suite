import { describe, expect, it } from 'vitest'
import type { Config } from 'payload'
import { SUITE_KEY } from 'payload-ai-core'
import { aiContent } from './index'

const baseConfig = (): Config =>
  ({
    secret: 'x',
    collections: [
      {
        slug: 'products',
        fields: [
          { name: 'title', type: 'text', admin: { components: { afterInput: ['./Existing#Comp'] } } },
          { name: 'slug', type: 'text' },
          { name: 'description', type: 'richText' },
          { type: 'tabs', tabs: [{ name: 'meta', fields: [{ name: 'title', type: 'text' }] }] },
          { name: 'categories', type: 'relationship', relationTo: 'categories', hasMany: true },
        ],
      },
      { slug: 'categories', fields: [{ name: 'title', type: 'text' }] },
      { slug: 'posts', fields: [{ name: 'body', type: 'richText' }, { name: 'excerpt', type: 'textarea' }] },
    ],
    custom: {
      [SUITE_KEY]: {
        coreInstalled: true,
        modules: [],
        options: { adapters: { preset: 'ecommerce', mappedCollections: () => ({ offering: ['products'], category: ['categories'] }) } },
      },
    },
  }) as unknown as Config

const comps = (f: any) => f.admin?.components?.afterInput ?? []
const apply = (o?: Parameters<typeof aiContent>[0]) => aiContent(o)(baseConfig()) as Config

describe('aiContent plugin config', () => {
  it('adds own collections, endpoints and task', () => {
    const c = apply()
    expect(c.collections?.map((x) => x.slug)).toEqual(expect.arrayContaining(['ai-generations', 'ai-bulk-runs']))
    expect(c.endpoints?.map((e) => e.path)).toEqual(
      expect.arrayContaining(['/ai/content/generate', '/ai/content/generations/:id', '/ai/content/bulk', '/ai/content/bulk/:runId', '/ai/content/bulk/:runId/review']),
    )
    expect(c.jobs?.tasks?.map((t) => t.slug)).toContain('ai-content-bulk')
    expect((c.admin?.components?.views as any).aiContentBulkReview.path).toBe('/ai-content/bulk/:runId')
  })

  it('attaches the AI button to offering copy fields, preserving existing components', () => {
    const c = apply()
    const products = c.collections!.find((x) => x.slug === 'products')!
    const [title, slug, description, tabs] = products.fields as any[]
    expect(comps(title)).toHaveLength(2)
    expect(comps(title)[0]).toBe('./Existing#Comp')
    expect(comps(title)[1].path).toBe('payload-ai-content/client#AIFieldButton')
    expect(comps(title)[1].clientProps).toMatchObject({ collection: 'products', field: 'title', fieldType: 'text' })
    expect(comps(slug)).toHaveLength(0)
    expect(comps(description)[0].clientProps.fieldType).toBe('richText')
    expect(comps(tabs.tabs[0].fields[0])[0].clientProps.field).toBe('meta.title')

    const panel = (products.fields as any[]).find((f) => f.name === 'aiContentPanel')
    expect(panel.type).toBe('ui')
    expect(panel.admin.components.Field.clientProps.categoryField).toBe('categories')
    expect((products.admin?.components?.beforeListTable as any[])[0].path).toBe('payload-ai-content/client#BulkEnrichAction')
    // non-offering collections untouched without an override
    const posts = c.collections!.find((x) => x.slug === 'posts')!
    expect(comps((posts.fields as any[])[0])).toHaveLength(0)
  })

  it('options.fields overrides per collection and adds others', () => {
    const c = apply({ fields: { products: ['description'], posts: ['excerpt'] }, photoPanel: false, bulkAction: false })
    const products = c.collections!.find((x) => x.slug === 'products')!
    expect(comps((products.fields as any[])[0])).toHaveLength(1) // only the pre-existing one
    expect(comps((products.fields as any[])[2])).toHaveLength(1)
    expect((products.fields as any[]).some((f) => f.name === 'aiContentPanel')).toBe(false)
    expect(products.admin?.components?.beforeListTable).toBeUndefined()
    const posts = c.collections!.find((x) => x.slug === 'posts')!
    expect(comps((posts.fields as any[])[1])[0].clientProps.field).toBe('excerpt')
  })

  it('adds aiTags to offerings only when enabled', () => {
    const off = apply().collections!.find((x) => x.slug === 'products')!
    expect((off.fields as any[]).some((f) => f.name === 'aiTags')).toBe(false)
    const on = apply({ aiTagsField: true })
    const products = on.collections!.find((x) => x.slug === 'products')!
    const tags = (products.fields as any[]).find((f) => f.name === 'aiTags')
    expect(tags).toMatchObject({ type: 'text', hasMany: true })
    expect(comps(tags)[0].clientProps.actions).toEqual(['tags'])
    expect((on.collections!.find((x) => x.slug === 'posts')!.fields as any[]).some((f) => f.name === 'aiTags')).toBe(false)
  })

  it('requires aiCore first', () => {
    expect(() => aiContent()({ collections: [] } as unknown as Config)).toThrow(/aiCore/)
  })
})
