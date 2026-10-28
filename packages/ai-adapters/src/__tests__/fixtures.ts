/**
 * Representative site configs for contract tests. The ecommerce store uses the REAL collection factories of
 * @payloadcms/plugin-ecommerce 3.92.1 (with template-style product fields added via override), so field
 * names, nesting (unnamed price groups/rows, order tabs) and units match the plugin.
 */
import {
  createCartsCollection,
  createOrdersCollection,
  createProductsCollection,
  createVariantOptionsCollection,
  createVariantsCollection,
  createVariantTypesCollection,
} from '@payloadcms/plugin-ecommerce'
import type { FakeCollection, FakeField } from '../testing/fakePayload'
import { createFakePayload } from '../testing/fakePayload'

type Doc = Record<string, unknown>

export const lexical = (...paragraphs: (string | Doc)[]) => ({
  root: {
    type: 'root',
    children: paragraphs.map((p) =>
      typeof p === 'string' ? { type: 'paragraph', children: [{ type: 'text', text: p }] } : p,
    ),
  },
})

const isAdmin = (u: Doc | null) => Array.isArray(u?.roles) && (u!.roles as string[]).includes('admin')

const pluginAccess = {
  isAdmin: () => true,
  adminOrPublishedStatus: () => true,
  isDocumentOwner: () => true,
  isAuthenticated: () => true,
  adminOnlyFieldAccess: () => true,
  publicAccess: () => true,
  isCustomer: () => true,
  customerOnlyFieldAccess: () => true,
}
const currenciesConfig = {
  defaultCurrency: 'BDT',
  supportedCurrencies: [{ code: 'BDT', decimals: 2, label: 'Taka', symbol: '৳' }],
}

const tenantField: FakeField = { name: 'tenant', type: 'relationship', relationTo: 'tenants' }

const asFake = (c: unknown, extra: Partial<FakeCollection> = {}): FakeCollection => {
  const cfg = c as FakeCollection
  return { ...cfg, ...extra, fields: [...(extra.fields ?? []), ...cfg.fields] }
}

export const ecommerceCollections = (opts: { permissiveOrders?: boolean } = {}): FakeCollection[] => {
  const products = asFake(createProductsCollection({ access: pluginAccess, currenciesConfig, enableVariants: true } as never), {
    fields: [
      { name: 'title', type: 'text', required: true },
      { name: 'slug', type: 'text' },
      { name: 'description', type: 'richText' },
      {
        name: 'gallery',
        type: 'array',
        fields: [
          { name: 'image', type: 'upload', relationTo: 'media' },
          { name: 'variantOption', type: 'relationship', relationTo: 'variantOptions' },
        ],
      },
      { name: 'categories', type: 'relationship', relationTo: 'categories', hasMany: true },
      tenantField,
    ],
    access: { read: ({ req }) => (isAdmin(req.user) ? true : { _status: { equals: 'published' } }) },
  })
  const owner = ({ req }: { req: { user: Doc | null } }) =>
    isAdmin(req.user) ? true : req.user ? { customer: { equals: req.user.id } } : false
  const orders = asFake(createOrdersCollection({ access: pluginAccess, currenciesConfig, enableVariants: true } as never), {
    fields: [tenantField],
    access: { read: opts.permissiveOrders ? () => true : owner },
  })
  const carts = asFake(createCartsCollection({ access: pluginAccess, currenciesConfig, enableVariants: true } as never), {
    fields: [tenantField],
    access: { read: owner, update: owner, create: () => true },
  })
  return [
    { slug: 'tenants', fields: [{ name: 'name', type: 'text' }] },
    { slug: 'media', upload: true, fields: [{ name: 'alt', type: 'text' }] },
    { slug: 'categories', fields: [{ name: 'title', type: 'text' }, { name: 'slug', type: 'text' }, tenantField] },
    {
      slug: 'users',
      auth: true,
      fields: [
        { name: 'name', type: 'text' },
        { name: 'roles', type: 'select', hasMany: true, options: ['admin', 'customer'] },
      ],
    },
    products,
    asFake(createVariantsCollection({ access: pluginAccess, currenciesConfig } as never)),
    asFake(createVariantTypesCollection({ access: pluginAccess } as never)),
    asFake(createVariantOptionsCollection({ access: pluginAccess } as never)),
    orders,
    carts,
    {
      slug: 'pages',
      versions: { drafts: true },
      fields: [
        { name: 'title', type: 'text', localized: true },
        { name: 'slug', type: 'text' },
        {
          type: 'tabs',
          tabs: [
            { label: 'Content', fields: [{ name: 'content', type: 'richText' }] } as never,
            {
              name: 'extra',
              fields: [{ name: 'layout', type: 'blocks', blocks: [{ slug: 'cta', fields: [{ name: 'heading', type: 'text' }] }] }],
            },
          ],
        },
        { name: 'visibility', type: 'select', options: ['public', 'customers', 'staff'] },
        tenantField,
      ],
    },
    {
      slug: 'faqs',
      fields: [
        { name: 'question', type: 'text' },
        { name: 'answer', type: 'richText' },
      ],
    },
    {
      slug: 'ai-tickets',
      fields: [
        { name: 'source', type: 'text' },
        { name: 'subject', type: 'text' },
        { name: 'customerId', type: 'text' },
        { name: 'customerEmail', type: 'email' },
        { name: 'linkedOrderId', type: 'text' },
        { name: 'topic', type: 'text' },
        { name: 'transcript', type: 'json' },
        { name: 'status', type: 'select' },
        tenantField,
      ],
    },
  ]
}

export const ecommerceData = (): Record<string, Doc[]> => ({
  tenants: [{ id: 't1' }, { id: 't2' }],
  media: [{ id: 'm1', url: '/media/tee.jpg' }],
  categories: [
    { id: 'c1', title: 'Shirts', slug: 'shirts', tenant: 't1' },
    { id: 'c2', title: 'Pants', slug: 'pants', tenant: 't1' },
  ],
  users: [
    { id: 'u1', email: 'alice@example.com', name: 'Alice', roles: ['customer'] },
    { id: 'u2', email: 'bob@example.com', name: 'Bob', roles: ['customer'] },
    { id: 'u9', email: 'admin@example.com', name: 'Admin', roles: ['admin'] },
  ],
  variantTypes: [{ id: 'vt1', label: 'Size', name: 'size' }],
  variantOptions: [
    { id: 'o1', variantType: 'vt1', label: 'M', value: 'm' },
    { id: 'o2', variantType: 'vt1', label: 'L', value: 'l' },
  ],
  products: [
    {
      id: 'p1',
      title: 'Cotton Tee',
      slug: 'cotton-tee',
      description: lexical('Soft cotton tee.', { type: 'heading', tag: 'h2', children: [{ type: 'text', text: 'Care' }] }),
      gallery: [{ image: 'm1' }],
      categories: ['c1'],
      enableVariants: true,
      variantTypes: ['vt1'],
      inventory: 0,
      priceInBDTEnabled: true,
      priceInBDT: 150000,
      _status: 'published',
      tenant: 't1',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'p2',
      title: 'Blue Jeans',
      slug: 'blue-jeans',
      categories: ['c2'],
      enableVariants: false,
      inventory: 5,
      priceInBDTEnabled: true,
      priceInBDT: 320000,
      _status: 'published',
      tenant: 't1',
      createdAt: '2026-02-01T00:00:00.000Z',
    },
    { id: 'p3', title: 'Secret Hoodie', slug: 'hoodie', inventory: 9, priceInBDT: 99900, _status: 'draft', tenant: 't1' },
    { id: 'p4', title: 'Other Tenant Cap', slug: 'cap', inventory: 0, priceInBDT: 50000, _status: 'published', tenant: 't2' },
  ],
  variants: [
    { id: 'v1', title: 'Tee M', product: 'p1', options: ['o1'], inventory: 3, priceInBDTEnabled: true, priceInBDT: 150000, _status: 'published' },
    { id: 'v2', title: 'Tee L', product: 'p1', options: ['o2'], inventory: 0, priceInBDTEnabled: true, priceInBDT: 160000, _status: 'published' },
  ],
  orders: [
    {
      id: 'ord1',
      customer: 'u1',
      customerEmail: 'alice@example.com',
      items: [{ product: 'p1', variant: 'v1', quantity: 2 }],
      status: 'processing',
      amount: 300000,
      currency: 'BDT',
      tenant: 't1',
      createdAt: '2026-03-01T00:00:00.000Z',
    },
    {
      id: 'ord2',
      customer: 'u2',
      customerEmail: 'bob@example.com',
      items: [{ product: 'p2', quantity: 1 }],
      status: 'completed',
      amount: 320000,
      currency: 'BDT',
      tenant: 't1',
      createdAt: '2026-03-02T00:00:00.000Z',
    },
  ],
  carts: [],
  pages: [
    {
      id: 'pg1',
      title: { en: 'Shipping policy', bn: 'শিপিং নীতি' },
      slug: 'shipping',
      content: lexical('We ship in 3 days.'),
      extra: { layout: [{ blockType: 'cta', heading: 'Free returns within 7 days' }] },
      _status: 'published',
      tenant: 't1',
    },
    { id: 'pg2', title: { en: 'Unreleased' }, slug: 'soon', content: lexical('draft text'), _status: 'draft', tenant: 't1' },
    { id: 'pg3', title: { en: 'Staff notes' }, slug: 'staff', content: lexical('internal'), visibility: 'staff', _status: 'published', tenant: 't1' },
  ],
  faqs: [{ id: 'f1', question: 'Do you ship abroad?', answer: lexical('Not yet.') }],
  'ai-tickets': [],
})

export const ecommerceStore = (opts: { permissiveOrders?: boolean } = {}) =>
  createFakePayload({
    collections: ecommerceCollections(opts),
    data: ecommerceData(),
    localization: { locales: ['en', 'bn'], defaultLocale: 'en' },
    serverURL: 'https://shop.test',
  })

export const users = {
  alice: { id: 'u1', email: 'alice@example.com', roles: ['customer'], collection: 'users' },
  bob: { id: 'u2', email: 'bob@example.com', roles: ['customer'], collection: 'users' },
}
