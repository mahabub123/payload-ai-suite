import type { CollectionConfig } from 'payload'

/**
 * Extends the Ecommerce plugin's products collection with the storefront fields the official
 * ecommerce template uses (title, slug, description, gallery, categories) plus a few attributes
 * the AI modules use (brand, specs, tags).
 */
export const productsOverride = ({ defaultCollection }: { defaultCollection: CollectionConfig }): CollectionConfig => ({
  ...defaultCollection,
  admin: { ...defaultCollection.admin, useAsTitle: 'title', defaultColumns: ['title', 'priceInBDT', 'inventory', '_status'] },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true, admin: { position: 'sidebar' } },
    { name: 'description', type: 'richText', localized: true },
    {
      name: 'gallery',
      type: 'array',
      fields: [{ name: 'image', type: 'upload', relationTo: 'media', required: true }],
    },
    { name: 'categories', type: 'relationship', relationTo: 'categories', hasMany: true, admin: { position: 'sidebar' } },
    { name: 'brand', type: 'text' },
    {
      name: 'specs',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'value', type: 'text', required: true },
      ],
    },
    { name: 'tags', type: 'text', hasMany: true },
    { name: 'relatedProducts', type: 'relationship', relationTo: 'products', hasMany: true },
    ...defaultCollection.fields,
  ],
})

/** Adds the tracking fields the assistant's order-status tool reads (ecommerce preset defaults). */
export const ordersOverride = ({ defaultCollection }: { defaultCollection: CollectionConfig }): CollectionConfig => ({
  ...defaultCollection,
  admin: { ...defaultCollection.admin, useAsTitle: 'orderNumber' },
  fields: [
    { name: 'orderNumber', type: 'text', unique: true, index: true, admin: { position: 'sidebar' } },
    ...defaultCollection.fields,
    { name: 'shippingStatus', type: 'select', options: ['pending', 'packed', 'shipped', 'delivered', 'returned'], defaultValue: 'pending', admin: { position: 'sidebar' } },
    { name: 'carrier', type: 'text', admin: { position: 'sidebar' } },
    { name: 'trackingNumber', type: 'text', admin: { position: 'sidebar' } },
    { name: 'estimatedDelivery', type: 'date', admin: { position: 'sidebar' } },
  ],
})
