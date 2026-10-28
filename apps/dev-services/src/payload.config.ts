import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { aiSuite, aiSuiteTablesFilter } from 'payload-ai-suite'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { isAdminUser, toSuiteRoles } from './access'
import { createDevMockProvider } from './ai/mock'
import { providersFromEnv } from './ai/providers'
import { Faqs, Pages } from './collections/content'
import { Media } from './collections/Media'
import { Bookings, Locations, Services, Staff } from './collections/services'
import { Users } from './collections/Users'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const { providers, routes } = providersFromEnv()
const useMock = process.env.AI_MOCK === '1' || providers.length === 0

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || 'dev-only-secret-change-me-0123456789abcdef',
  serverURL: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001',
  admin: { user: Users.slug, importMap: { baseDir: path.resolve(dirname) }, meta: { titleSuffix: ' · AI Dev Services' } },
  localization: {
    locales: [
      { code: 'en', label: 'English' },
      { code: 'bn', label: 'বাংলা' },
    ],
    defaultLocale: 'en',
    fallback: true,
  },
  collections: [Users, Media, Services, Locations, Staff, Bookings, Pages, Faqs],
  editor: lexicalEditor(),
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI || 'postgres://payload:payload@localhost:5433/payload_ai_services' },
    migrationDir: path.resolve(dirname, 'migrations'),
    push: process.env.PAYLOAD_DB_PUSH !== '0',
    // Keep schema push away from the suite's raw pgvector tables.
    tablesFilter: aiSuiteTablesFilter(),
  }),
  email: nodemailerAdapter({
    defaultFromAddress: process.env.EMAIL_FROM || 'clinic@example.test',
    defaultFromName: 'AI Dev Services',
    skipVerify: true,
    transportOptions: { host: process.env.SMTP_HOST || 'localhost', port: Number(process.env.SMTP_PORT || 1025), secure: false },
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
    aiSuite({
      preset: 'services',
      overrides: {
        offering: { collection: 'services', fields: { title: 'title', price: 'price', image: 'image' }, currency: 'BDT' },
        booking: { collection: 'bookings', utcOffsetMinutes: 360, slotStepMinutes: 30 },
        knowledge: { collections: ['pages', 'faqs'] },
        category: false,
      },
      providers,
      routes,
      ...(useMock ? { mockProvider: createDevMockProvider() } : {}),
      locales: ['en', 'bn'],
      defaultLocale: 'en',
      userCollections: { staff: 'users', customers: 'users' },
      roles: toSuiteRoles,
      turnstile: false,
      budgets: { monthlyMicros: Number(process.env.AI_MONTHLY_BUDGET_MICROS || 50_000_000) },
      modules: {
        content: true,
        search: { hybrid: true, recommendations: false, currency: 'BDT' },
        assistant: { tools: ['catalog', 'booking', 'knowledge', 'leads'], handoff: 'support' },
        support: true,
      },
    }),
  ],
})
