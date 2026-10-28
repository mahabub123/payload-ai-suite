import { describe, expect, it } from 'vitest'
import { lexicalToText } from './lexical'
import type { CollectionLike, ConfigLike } from './schema'
import { resolveFieldPath } from './schema'
import { fillPattern, getPath, relId, toMinor, toText, uploadUrl } from './values'

describe('lexicalToText', () => {
  it('flattens headings, paragraphs, lists, links, line breaks and blocks', () => {
    const state = {
      root: {
        type: 'root',
        children: [
          { type: 'heading', tag: 'h1', children: [{ type: 'text', text: 'Returns' }] },
          {
            type: 'paragraph',
            children: [
              { type: 'text', text: 'Within ' },
              { type: 'link', fields: { url: 'https://x' }, children: [{ type: 'text', text: '7 days' }] },
              { type: 'linebreak' },
              { type: 'text', text: 'unworn only.' },
            ],
          },
          {
            type: 'list',
            listType: 'number',
            children: [
              { type: 'listitem', children: [{ type: 'text', text: 'Pack it' }] },
              { type: 'listitem', children: [{ type: 'text', text: 'Ship it' }] },
            ],
          },
          { type: 'upload', value: { url: '/x.png' } },
          { type: 'block', fields: { blockType: 'callout', id: 'b1', text: 'Need help? Call us.' } },
        ],
      },
    }
    expect(lexicalToText(state)).toBe('Returns\nWithin 7 days\nunworn only.\n1. Pack it\n2. Ship it\nNeed help? Call us.')
  })
  it('returns empty for non-lexical values', () => {
    expect(lexicalToText(null)).toBe('')
    expect(toText({ blockType: 'x', id: '1', title: 'Hi', n: 3 })).toBe('Hi')
  })
})

describe('values', () => {
  it('reads dot paths with indexes, fan-out and polymorphic relations', () => {
    const doc = { gallery: [{ image: { url: '/a.jpg' } }, { image: { url: '/b.jpg' } }], rel: { relationTo: 'x', value: { title: 'T' } } }
    expect(getPath(doc, 'gallery.1.image.url')).toBe('/b.jpg')
    expect(getPath(doc, 'gallery.image.url')).toEqual(['/a.jpg', '/b.jpg'])
    expect(getPath(doc, 'rel.title')).toBe('T')
    expect(uploadUrl(getPath(doc, 'gallery.0'), 'https://s.test/')).toBe('https://s.test/a.jpg')
  })
  it('unwraps localized values', () => {
    const o = { locales: ['en', 'bn'], locale: 'bn', defaultLocale: 'en' }
    expect(getPath({ t: { en: 'Hi', bn: 'হাই' } }, 't', o)).toBe('হাই')
    expect(getPath({ t: { en: 'Hi' } }, 't', o)).toBe('Hi')
  })
  it('relationship ids and money', () => {
    expect(relId(5)).toBe('5')
    expect(relId({ id: 'a', title: 'x' })).toBe('a')
    expect(relId({ relationTo: 'p', value: 'z' })).toBe('z')
    expect(toMinor(12.345, 'major')).toBe(1235)
    expect(toMinor(1500, 'minor')).toBe(1500)
    expect(fillPattern('/p/{slug}', { slug: 'a b' })).toBe('/p/a%20b')
    expect(fillPattern('/p/{slug}', {})).toBeUndefined()
  })
})

describe('resolveFieldPath', () => {
  const config: ConfigLike = {
    blocks: [{ slug: 'hero', fields: [{ name: 'heading', type: 'text' }] }],
    collections: [
      { slug: 'media', upload: true, fields: [{ name: 'alt', type: 'text' }] },
      {
        slug: 'products',
        versions: { drafts: true },
        fields: [
          { type: 'tabs', tabs: [{ fields: [{ name: 'title', type: 'text' }] }, { name: 'seo', fields: [{ name: 'image', type: 'upload', relationTo: 'media' }] }] },
          { type: 'row', fields: [{ name: 'price', type: 'number' }] },
          { name: 'gallery', type: 'array', fields: [{ name: 'image', type: 'upload', relationTo: 'media' }] },
          { name: 'layout', type: 'blocks', blockReferences: ['hero'], blocks: [] },
        ],
      },
    ],
  }
  const products = config.collections[1] as CollectionLike
  it.each([
    ['title', true],
    ['seo.image', true],
    ['seo.image.alt', true],
    ['seo.image.url', true],
    ['price', true],
    ['gallery.0.image', true],
    ['gallery.image.alt', true],
    ['layout.heading', true],
    ['_status', true],
    ['createdAt', true],
    ['seo.title', false],
    ['price.0', false],
    ['nope', false],
  ])('%s -> %s', (path, ok) => {
    expect(!!resolveFieldPath(config, products, path)).toBe(ok)
  })
})
