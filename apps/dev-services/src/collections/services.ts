import type { CollectionConfig } from 'payload'
import { anyone, isStaffUser, publishedOrStaff, roles } from '../access'

export const Services: CollectionConfig = {
  slug: 'services',
  admin: { useAsTitle: 'title', group: 'Business', defaultColumns: ['title', 'price', 'duration', '_status'] },
  access: { read: publishedOrStaff, create: roles('content'), update: roles('content'), delete: roles() },
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true, admin: { position: 'sidebar' } },
    { name: 'description', type: 'richText', localized: true },
    { name: 'summary', type: 'textarea', localized: true },
    { name: 'price', type: 'number', required: true, admin: { description: 'BDT minor units (poisha): ৳1,500 = 150000' } },
    { name: 'duration', type: 'number', required: true, defaultValue: 60, admin: { description: 'Minutes' } },
    { name: 'image', type: 'upload', relationTo: 'media' },
    { name: 'category', type: 'select', options: ['hair', 'skin', 'spa', 'health', 'consulting'] },
    { name: 'tags', type: 'text', hasMany: true },
  ],
}

export const Locations: CollectionConfig = {
  slug: 'locations',
  admin: { useAsTitle: 'name', group: 'Business' },
  access: { read: anyone, create: roles(), update: roles(), delete: roles() },
  fields: [
    { name: 'name', type: 'text', required: true, localized: true },
    { name: 'address', type: 'textarea', localized: true },
    { name: 'phone', type: 'text' },
    {
      name: 'openingHours',
      type: 'array',
      fields: [
        { name: 'day', type: 'select', required: true, options: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
        { name: 'open', type: 'text', required: true, admin: { description: 'HH:mm' } },
        { name: 'close', type: 'text', required: true, admin: { description: 'HH:mm' } },
      ],
    },
  ],
}

export const Staff: CollectionConfig = {
  slug: 'staff',
  admin: { useAsTitle: 'name', group: 'Business' },
  access: { read: anyone, create: roles(), update: roles(), delete: roles() },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'bio', type: 'textarea', localized: true },
    { name: 'services', type: 'relationship', relationTo: 'services', hasMany: true },
    { name: 'location', type: 'relationship', relationTo: 'locations' },
  ],
}

export const Bookings: CollectionConfig = {
  slug: 'bookings',
  admin: { useAsTitle: 'name', group: 'Business', defaultColumns: ['service', 'start', 'name', 'status'] },
  access: {
    read: ({ req }) => (isStaffUser(req.user) ? true : req.user ? { customer: { equals: req.user.id } } : false),
    // Visitors may request tentative bookings (low-risk act, §7.2); staff confirm them.
    create: anyone,
    update: roles('support'),
    delete: roles(),
  },
  hooks: {
    beforeChange: [
      ({ data, req, operation }) =>
        operation === 'create' && !isStaffUser(req.user)
          ? { ...data, status: 'tentative', ...(req.user ? { customer: req.user.id } : {}) }
          : data,
    ],
  },
  fields: [
    { name: 'service', type: 'relationship', relationTo: 'services', required: true },
    { name: 'start', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'end', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'staff', type: 'relationship', relationTo: 'staff' },
    { name: 'location', type: 'relationship', relationTo: 'locations' },
    { name: 'status', type: 'select', defaultValue: 'tentative', options: ['tentative', 'confirmed', 'cancelled', 'completed'] },
    { name: 'customer', type: 'relationship', relationTo: 'users' },
    { name: 'name', type: 'text' },
    { name: 'email', type: 'email' },
    { name: 'phone', type: 'text' },
    { name: 'notes', type: 'textarea' },
  ],
}
