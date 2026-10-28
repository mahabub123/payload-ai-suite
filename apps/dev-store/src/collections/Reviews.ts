import type { CollectionConfig } from 'payload'
import { isStaffUser, roles } from '../access'

export const Reviews: CollectionConfig = {
  slug: 'reviews',
  admin: { useAsTitle: 'title', group: 'Ecommerce', defaultColumns: ['title', 'product', 'rating', 'status'] },
  access: {
    // Shoppers see approved reviews; staff see all (incl. held for moderation).
    read: ({ req }) => (isStaffUser(req.user) ? true : { status: { equals: 'approved' } }),
    create: ({ req }) => Boolean(req.user),
    update: roles('support', 'content'),
    delete: roles('support'),
  },
  hooks: {
    beforeChange: [
      ({ data, req, operation }) => {
        if (operation === 'create' && req.user && !isStaffUser(req.user)) {
          return { ...data, customer: req.user.id, status: 'pending' }
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'product', type: 'relationship', relationTo: 'products', required: true, index: true },
    { name: 'customer', type: 'relationship', relationTo: 'users' },
    { name: 'authorName', type: 'text' },
    { name: 'rating', type: 'number', min: 1, max: 5, required: true },
    { name: 'title', type: 'text' },
    { name: 'body', type: 'textarea', required: true },
    { name: 'locale', type: 'select', options: ['en', 'bn'], defaultValue: 'en' },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'pending',
      options: ['pending', 'approved', 'held'],
      admin: { position: 'sidebar' },
    },
  ],
}
