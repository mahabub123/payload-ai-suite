import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { ecommercePlugin, USD } from '@payloadcms/plugin-ecommerce'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { aiSuite, aiSuiteTablesFilter } from '@payload-ai-suite/ai-suite'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { hasAnyRole, isAdminUser, isStaffUser, toSuiteRoles } from './access'
import { createDevMockProvider } from './ai/mock'
import { providersFromEnv } from './ai/providers'
import { Categories } from './collections/Categories'
import { Faqs, Pages, Policies, Posts } from './collections/content'
import { Media } from './collections/Media'
import { ordersOverride, productsOverride } from './collections/products'
import { Reviews } from './collections/Reviews'
import { Users } from './collections/Users'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/** Bangladeshi Taka; amounts are stored in poisha (minor units, 1 ৳ = 100). */
export const BDT = { code: 'BDT', decimals: 2, label: 'Bangladeshi Taka', symbol: '৳' }

const { providers, routes } = providersFromEnv()
const useMock = process.env.AI_MOCK === '1' || providers.length === 0
if (useMock && process.env.AI_MOCK !== '1') {
  console.warn('[dev-store] No AI provider keys found; running the AI Suite against the mock provider (AI_MOCK=1).')
}

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || 'dev-only-secret-change-me-0123456789abcdef',
  serverURL: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000',
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: { titleSuffix: ' · AI Dev Store' },
  },
  localization: {
    locales: [
      { code: 'en', label: 'English' },
      { code: 'bn', label: 'বাংলা' },
    ],
    defaultLocale: 'en',
    fallback: true,
  },
  collections: [Users, Media, Categories, Pages, Posts, Faqs, Policies, Reviews],
  editor: lexicalEditor(),
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI || 'postgres://payload:payload@localhost:5433/payload_ai_store' },
    migrationDir: path.resolve(dirname, 'migrations'),
    push: process.env.PAYLOAD_DB_PUSH !== '0',
    // Keep schema push away from the suite's raw pgvector tables.
    tablesFilter: aiSuiteTablesFilter(),
  }),
  email: nodemailerAdapter({
    defaultFromAddress: process.env.EMAIL_FROM || 'store@example.test',
    defaultFromName: 'AI Dev Store',
    skipVerify: true,
    transportOptions: {
      host: process.env.SMTP_HOST || 'localhost',
      port: Number(process.env.SMTP_PORT || 1025),
      secure: false,
    },
  }),
  sharp,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  jobs: {
    autoRun: process.env.JOBS_AUTORUN === '0' ? [] : [
          // 'default' = on-demand jobs; 'ai-default' / 'ai-nightly' = AI Suite scheduled jobs.
          { cron: '* * * * *', queue: 'default', limit: 50 },
          { cron: '* * * * *', queue: 'ai-default', limit: 50 },
          { cron: '*/5 * * * *', queue: 'ai-nightly', limit: 10 },
        ],
    access: { run: ({ req }) => isAdminUser(req.user) },
  },
  plugins: [
    // Official Ecommerce plugin first: aiSuite maps and hooks the collections it creates.
    ecommercePlugin({
      customers: { slug: 'users' },
      currencies: { defaultCurrency: 'BDT', supportedCurrencies: [BDT, USD] },
      access: {
        isAdmin: ({ req }) => isAdminUser(req.user),
        adminOnlyFieldAccess: ({ req }) => isAdminUser(req.user),
        isAuthenticated: ({ req }) => Boolean(req.user),
        isCustomer: ({ req }) => Boolean(req.user) && !isStaffUser(req.user),
        isDocumentOwner: ({ req }) => (req.user ? { customer: { equals: req.user.id } } : false),
        adminOrPublishedStatus: ({ req }) => (isStaffUser(req.user) ? true : { _status: { equals: 'published' } }),
        publicAccess: () => true,
      },
      orders: {
        ordersCollectionOverride: ({ defaultCollection }) => {
          const c = ordersOverride({ defaultCollection })
          const read = c.access?.read
          // Managers read all orders (AI Insights runs its metrics with the manager's own access); no write access.
          return { ...c, access: { ...c.access, read: (args) => hasAnyRole(args.req.user, ['manager']) || (read ? read(args) : false) } }
        },
      },
      products: {
        variants: true,
        productsCollectionOverride: ({ defaultCollection }) => {
          const c = productsOverride({ defaultCollection })
          // Content staff may edit products (AI enrichment writes drafts with the editor's access).
          return { ...c, access: { ...c.access, update: ({ req }) => hasAnyRole(req.user, ['super-admin', 'admin', 'content']) } }
        },
      },
    }),
    aiSuite({
      preset: 'ecommerce',
      overrides: {
        offering: {
          collection: 'products',
          fields: { title: 'title', price: 'priceInBDT', image: 'gallery.0.image' },
          currency: 'BDT',
          attributes: { brand: 'brand', tags: 'tags' },
        },
        knowledge: { collections: ['pages', 'posts', 'faqs', 'policies'] },
        review: {
          collection: 'reviews',
          published: { field: 'status', equals: 'approved' },
          held: { field: 'status', heldValue: 'held', releasedValue: 'approved' },
        },
      },
      providers,
      routes,
      ...(useMock ? { mockProvider: createDevMockProvider() } : {}),
      locales: ['en', 'bn'],
      defaultLocale: 'en',
      userCollections: { staff: 'users', customers: 'users' },
      roles: toSuiteRoles,
      allowedDomains: ['localhost', new URL(process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000').hostname],
      turnstile: process.env.TURNSTILE_SECRET_KEY
        ? { secretKeyEnv: 'TURNSTILE_SECRET_KEY', siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY }
        : false,
      budgets: {
        monthlyMicros: Number(process.env.AI_MONTHLY_BUDGET_MICROS || 100_000_000),
        perModule: { assistant: 0.45, search: 0.15, content: 0.1, marketing: 0.05, support: 0.05, channels: 0.05, insights: 0.05, media: 0.05, copilot: 0.05 },
      },
      modules: {
        content: true,
        search: {
          hybrid: true,
          recommendations: true,
          currency: 'BDT',
          synonyms: { saree: ['sari', 'শাড়ি'], panjabi: ['punjabi', 'kurta', 'পাঞ্জাবি'], taka: ['tk', 'bdt', '৳', 'টাকা'] },
        },
        assistant: { handoff: 'support', expectedReplyTime: 'within 2 hours', contact: { email: 'help@example.test', phone: '09600-000000' } },
        marketing: { approvalRole: 'marketing-approver' },
        support: { autoAnswerConfidence: 0.85 },
        channels: {
          whatsapp: {
            phoneNumberIdEnv: 'WHATSAPP_PHONE_NUMBER_ID',
            accessTokenEnv: 'WHATSAPP_ACCESS_TOKEN',
            appSecretEnv: 'WHATSAPP_APP_SECRET',
            verifyTokenEnv: 'WHATSAPP_VERIFY_TOKEN',
          },
          messenger: {
            pageAccessTokenEnv: 'MESSENGER_PAGE_ACCESS_TOKEN',
            appSecretEnv: 'MESSENGER_APP_SECRET',
            verifyTokenEnv: 'MESSENGER_VERIFY_TOKEN',
          },
        },
        insights: true,
        media: true,
        copilot: { automations: true },
      },
    }),
  ],
})
