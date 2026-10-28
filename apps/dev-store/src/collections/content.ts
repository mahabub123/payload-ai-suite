import type { CollectionConfig } from 'payload'
import { anyone, publishedOrStaff, roles } from '../access'

const contentAccess = {
  read: publishedOrStaff,
  create: roles('content'),
  update: roles('content'),
  delete: roles('content'),
}

const slugField = { name: 'slug', type: 'text', required: true, unique: true, index: true, admin: { position: 'sidebar' } } as const

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: { useAsTitle: 'title', group: 'Content' },
  access: contentAccess,
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    slugField,
    { name: 'content', type: 'richText', localized: true },
    {
      name: 'meta',
      type: 'group',
      fields: [
        { name: 'title', type: 'text', localized: true },
        { name: 'description', type: 'textarea', localized: true },
      ],
    },
  ],
}

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: { useAsTitle: 'title', group: 'Content' },
  access: contentAccess,
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    slugField,
    { name: 'excerpt', type: 'textarea', localized: true },
    { name: 'content', type: 'richText', localized: true },
    { name: 'author', type: 'relationship', relationTo: 'users' },
    { name: 'publishedAt', type: 'date', admin: { position: 'sidebar' } },
    { name: 'relatedProducts', type: 'relationship', relationTo: 'products', hasMany: true },
  ],
}

export const Faqs: CollectionConfig = {
  slug: 'faqs',
  admin: { useAsTitle: 'question', group: 'Content' },
  access: { read: anyone, create: roles('content', 'support'), update: roles('content', 'support'), delete: roles('content') },
  fields: [
    { name: 'question', type: 'text', required: true, localized: true },
    { name: 'answer', type: 'textarea', required: true, localized: true },
    {
      name: 'topic',
      type: 'select',
      options: ['ordering', 'payment', 'shipping', 'returns', 'products', 'account'],
      defaultValue: 'ordering',
    },
    { name: 'order', type: 'number', defaultValue: 0 },
  ],
}

export const Policies: CollectionConfig = {
  slug: 'policies',
  admin: { useAsTitle: 'title', group: 'Content' },
  access: contentAccess,
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    slugField,
    { name: 'kind', type: 'select', required: true, options: ['shipping', 'returns', 'privacy', 'warranty', 'terms', 'payment'] },
    { name: 'content', type: 'richText', localized: true },
    { name: 'summary', type: 'textarea', localized: true },
  ],
}
