import type { PayloadRequest, TypedUser } from 'payload'
import type { AdapterProvider } from './adapters'
import type { SuiteRole } from './context'
import type { AIProvider, ProviderConfig, RoutesOption } from './providers'

export interface AICoreOptions {
  providers: ProviderConfig[]
  routes: RoutesOption
  /** Route overrides by scope. */
  routeOverrides?: {
    module?: Record<string, RoutesOption>
    locale?: Record<string, RoutesOption>
  }
  /** Tenants may add their own providers/keys in the admin (encrypted at rest). */
  allowTenantKeys?: boolean
  /** Business adapters (from payload-ai-adapters createAdapters()). */
  adapters?: AdapterProvider
  locales?: string[]
  defaultLocale?: string
  budgets?: {
    /** Monthly budget per site/tenant, micro-USD (100_000_000 = $100). */
    monthlyMicros?: number
    /** Share of the monthly budget per module (0..1). */
    perModule?: Record<string, number>
  }
  /** Multi-Tenant plugin integration. */
  tenant?: {
    field: string
    /** Tenants collection slug (Multi-Tenant plugin). Default 'tenants'. */
    collection?: string
    resolve?: (req: PayloadRequest) => string | number | undefined
  }
  /** Collection slug of the staff/customer auth collection(s). */
  userCollections?: { staff?: string; customers?: string }
  /** Map a Payload user to suite roles. Default reads `user.roles` / `user.role`. */
  roles?: (user: TypedUser) => SuiteRole[]
  /** Env var with the 32+ char server secret for encryption and id hashing. Default PAYLOAD_SECRET. */
  secretEnv?: string
  turnstile?: { secretKeyEnv: string; siteKey?: string } | false
  /** Optional Redis for rate limits / caches; in-memory + Postgres otherwise. */
  redis?: { urlEnv: string }
  allowedDomains?: string[]
  retention?: Partial<{ shopperChatsDays: number; staffChatsDays: number; usageDays: number; auditDays: number }>
  /** Skip DB writes/model calls (tests). */
  mockProvider?: AIProvider
  /** Disable the whole suite without uninstalling. */
  disabled?: boolean
}
