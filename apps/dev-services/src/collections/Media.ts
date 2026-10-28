import type { CollectionConfig } from 'payload'
import { anyone, roles } from '../access'

export const Media: CollectionConfig = {
  slug: 'media',
  admin: { group: 'Content' },
  access: { read: anyone, create: roles('content', 'marketing'), update: roles('content', 'marketing'), delete: roles('content') },
  upload: {
    staticDir: 'media',
    mimeTypes: ['image/*'],
    imageSizes: [
      { name: 'thumbnail', width: 300, height: 300, position: 'centre' },
      { name: 'card', width: 768 },
    ],
    adminThumbnail: 'thumbnail',
  },
  fields: [
    { name: 'alt', type: 'text', localized: true },
    { name: 'tags', type: 'text', hasMany: true },
    { name: 'aiGenerated', type: 'checkbox', defaultValue: false, admin: { readOnly: true, position: 'sidebar' } },
  ],
}
