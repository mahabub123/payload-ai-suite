import type { CollectionConfig } from 'payload'
import type { AICoreOptions } from '../contracts'
import { withTenantField } from '../module/createModulePlugin'
import { aiModelsCollection, aiRoutesCollection } from './models'
import { aiProvidersCollection } from './providers'
import { aiAuditCollection, aiUsageCollection, aiUsageDailyCollection } from './usage'

export { SLUGS, ADMIN_GROUP } from './slugs'
export { aiSettingsGlobal } from './settings'
export type { AISettingsGlobalOptions } from './settings'
export { aiProvidersCollection, PROVIDER_TYPES } from './providers'
export { aiModelsCollection, aiRoutesCollection, CAPABILITIES } from './models'
export { aiUsageCollection, aiUsageDailyCollection, aiAuditCollection } from './usage'

/** Core-A admin collections (providers, models, routes, usage, usage-daily, audit), tenant field applied. */
export const coreAdminCollections = (options?: AICoreOptions): CollectionConfig[] =>
  [
    aiProvidersCollection(options),
    aiModelsCollection(options),
    aiRoutesCollection(options),
    aiUsageCollection(),
    aiUsageDailyCollection(),
    aiAuditCollection(),
  ].map((c) => (c.slug === 'ai-models' ? c : withTenantField(c, options)))
