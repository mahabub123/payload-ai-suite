import type { CollectionConfig } from 'payload'
import { anyone, publishedOrStaff, roles } from '../access'

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: { useAsTitle: 'title', group: 'Content' },
  access: { read: publishedOrStaff, create: roles('content'), update: roles('content'), delete: roles('content') },
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true, admin: { position: 'sidebar' } },
    { name: 'content', type: 'richText', localized: true },
  ],
}

export const Faqs: CollectionConfig = {
  slug: 'faqs',
  admin: { useAsTitle: 'question', group: 'Content' },
  access: { read: anyone, create: roles('content', 'support'), update: roles('content', 'support'), delete: roles('content') },
  fields: [
    { name: 'question', type: 'text', required: true, localized: true },
    { name: 'answer', type: 'textarea', required: true, localized: true },
  ],
}
