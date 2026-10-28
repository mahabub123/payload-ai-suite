/**
 * ai-core part A: providers, router, usage, budgets, audit, crypto, rate limits, settings, admin collections.
 *
 * Factory deps (core B wires these in services.ts / plugin.ts):
 *
 *   createCrypto({ secret?, secretEnv? = 'PAYLOAD_SECRET', env? }): Crypto
 *   createRateLimiter({ redisUrl?, redisUrlEnv?, env?, logger?, now? }): RateLimiter
 *       Redis via dynamic import('ioredis') when a URL is set; otherwise (or if not installed) in-memory + warning.
 *   createSettingsLoader({ options?, knownModules?, ttlMs? = 300_000 }): SettingsLoader
 *       .load(payload, tenant?) -> LoadedSettings (Settings + admin default `routes`), cached; invalidated by the
 *       ai-settings afterChange hook. .isModuleEnabled(module, payload, tenant?) ('core' always true). .invalidate()
 *   createUsageService({ tenantField?, now? }): UsageServiceImpl   (UsageService + onRecord(listener))
 *   createAuditService({ tenantField? }): AuditService
 *   createBudgetService({ usage, audit?, settings: (payload, tenant?) => Promise<Settings>, cacheTtlMs? = 60_000, now? })
 *       : BudgetService & { invalidate() }   — subscribes to usage.onRecord to keep its spend cache warm.
 *   createProviderRegistry({ providers?, crypto?, env?, fetch?, mockProvider?, tenantField?, includeCatalog? = true })
 *       : ProviderRegistry   — get/require/config/list/register/models/model(ref)/setModelOverrides/loadFromPayload
 *   createAIClient({ registry, usage, budgets, options?: { routes, routeOverrides, mockProvider, tenant },
 *                    settings?: (payload, tenant?) => Promise<LoadedSettings>, db? = !mockProvider, refreshMs? = 60_000,
 *                    breaker?: CircuitBreaker | { threshold=5, windowMs=60_000, cooldownMs=30_000 },
 *                    defaultTimeoutMs? = 30_000, defaultMaxRetries? = 1, embedBatchSize? = 100, now? })
 *       : AIClientImpl   (AIClient + refresh(payload) + breaker)
 *
 * Config-time:
 *   coreAdminCollections(options?: AICoreOptions): CollectionConfig[]  — ai-providers, ai-models, ai-routes,
 *       ai-usage, ai-usage-daily, ai-audit (tenant field already applied; re-applying is a no-op).
 *   aiSettingsGlobal(options?: AICoreOptions & { knownModules?, usageDashboard? = true }): GlobalConfig
 *   coreAEndpoints: AIEndpointDefinition[]  — GET /ai/usage (store-admin), POST /ai/providers/:id/test (super-admin);
 *       both use module 'core' and budget: false.
 *   usageDashboardConfig — how to mount the UsageDashboard client component (default: a tab on ai-settings).
 */
import type { AdminViewConfig } from 'payload'

export { createCrypto } from './crypto'
export type { CryptoDeps } from './crypto'
export { createRateLimiter, createMemoryRateLimiter } from './ratelimit'
export type { RateLimiterDeps } from './ratelimit'
export { createSettingsLoader, invalidateAllSettings, mergeSettings, DEFAULT_SETTINGS, ALL_MODULES } from './settings'
export type { SettingsLoader, SettingsLoaderDeps, LoadedSettings } from './settings'
export { createUsageService, computeCostMicros, usdToMicros } from './usage'
export type { UsageServiceDeps, UsageServiceImpl, UsageListener } from './usage'
export { createBudgetService, moduleLimit, BUDGET_WARN_RATIO } from './budgets'
export type { BudgetServiceDeps } from './budgets'
export { createAuditService } from './audit'
export type { AuditServiceDeps } from './audit'
export { createProviderRegistry, buildProvider, lookupCatalog, BUILTIN_CATALOG, mapProviderError } from './providers'
export type { ProviderRegistry, ProviderRegistryDeps } from './providers'
export { createAIClient, CircuitBreaker, invalidateRouting, resolveRouteConfig } from './router'
export type { AIClientDeps, AIClientImpl, CircuitBreakerOptions, RouteRow } from './router'
export { coreAdminCollections, aiSettingsGlobal, SLUGS as CORE_A_SLUGS } from './collections'
export { coreAEndpoints, usageEndpoint, providerTestEndpoint } from './endpoints'
export type { UsageResponse } from './endpoints'

/**
 * The usage dashboard is mounted by default as the "Usage" tab of the ai-settings global (a `ui` field).
 * To also show it as a standalone admin view, add `usageDashboardConfig.view` to
 * `config.admin.components.views[usageDashboardConfig.viewKey]`.
 */
export const usageDashboardConfig = {
  component: '@payload-ai-suite/ai-core/client#UsageDashboard',
  mountedOn: { global: 'ai-settings', tab: 'Usage', field: 'usageDashboard' },
  viewKey: 'aiUsage',
  view: { Component: '@payload-ai-suite/ai-core/client#UsageDashboard', path: '/ai-usage', exact: true } satisfies AdminViewConfig,
} as const
