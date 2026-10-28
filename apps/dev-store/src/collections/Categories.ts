import type { CollectionConfig } from 'payload'
import { anyone, roles } from '../access'

export const Categories: CollectionConfig = {
  slug: 'categories',
  admin: { useAsTitle: 'title', group: 'Ecommerce' },
  access: { read: anyone, create: roles('content'), update: roles('content'), delete: roles() },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'parent', type: 'relationship', relationTo: 'categories' },
  ],
}
