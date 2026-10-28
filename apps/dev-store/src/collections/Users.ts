import type { CollectionConfig } from 'payload'
import { adminFieldOnly, isAdminUser, isStaffUser, ROLES } from '../access'

/** One auth collection for staff and customers (the Ecommerce plugin links carts/orders to it). */
export const Users: CollectionConfig = {
  slug: 'users',
  auth: { tokenExpiration: 60 * 60 * 24 * 7 },
  admin: { useAsTitle: 'email', defaultColumns: ['email', 'name', 'roles'], group: 'People' },
  access: {
    admin: ({ req }) => isStaffUser(req.user),
    create: () => true,
    read: ({ req }) => (isStaffUser(req.user) ? true : req.user ? { id: { equals: req.user.id } } : false),
    update: ({ req }) => (isAdminUser(req.user) ? true : req.user ? { id: { equals: req.user.id } } : false),
    delete: ({ req }) => isAdminUser(req.user),
  },
  fields: [
    { name: 'name', type: 'text' },
    { name: 'phone', type: 'text' },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      defaultValue: ['customer'],
      required: true,
      saveToJWT: true,
      options: ROLES.map((r) => ({ label: r, value: r })),
      access: { create: adminFieldOnly, update: adminFieldOnly },
    },
    { name: 'marketingOptIn', type: 'checkbox', defaultValue: false },
    { name: 'preferredLocale', type: 'select', options: ['en', 'bn'], defaultValue: 'en' },
  ],
}
