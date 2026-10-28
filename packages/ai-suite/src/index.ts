/**
 * @payload-ai-suite/ai-suite — the one-line install.
 *
 *   import { aiSuite } from '@payload-ai-suite/ai-suite'
 *   plugins: [ecommercePlugin({...}), aiSuite({ preset: 'ecommerce', providers, routes, modules: { assistant: true } })]
 *
 * Also re-exports the core public API and every module's plugin + options type, so sites
 * that prefer to compose plugins by hand need only this one dependency.
 */
export { aiSuite, buildSuitePlugins, toCoreOptions } from './aiSuite'
export { MODULE_ORDER } from './options'
export type { AISuiteOptions, AISuiteModules, ModuleSwitch, SuiteModuleKey } from './options'
export { AISuiteConfigError, enabledModules, validateSuiteOptions } from './validate'

export * from '@payload-ai-suite/ai-core'
export { createAdapters } from '@payload-ai-suite/ai-adapters'
export type { AdaptersOptions } from '@payload-ai-suite/ai-adapters'
export { aiContent } from '@payload-ai-suite/ai-content'
export type { AiContentOptions } from '@payload-ai-suite/ai-content'
export { aiSearch } from '@payload-ai-suite/ai-search'
export type { AiSearchOptions } from '@payload-ai-suite/ai-search'
export { aiAssistant } from '@payload-ai-suite/ai-assistant'
export type { AiAssistantOptions } from '@payload-ai-suite/ai-assistant'
export { aiMarketing } from '@payload-ai-suite/ai-marketing'
export type { AiMarketingOptions } from '@payload-ai-suite/ai-marketing'
export { aiSupport } from '@payload-ai-suite/ai-support'
export type { AiSupportOptions } from '@payload-ai-suite/ai-support'
export { aiChannels } from '@payload-ai-suite/ai-channels'
export type { AiChannelsOptions } from '@payload-ai-suite/ai-channels'
export { aiInsights } from '@payload-ai-suite/ai-insights'
export type { AiInsightsOptions } from '@payload-ai-suite/ai-insights'
export { aiMedia } from '@payload-ai-suite/ai-media'
export type { AiMediaOptions } from '@payload-ai-suite/ai-media'
export { aiCopilot } from '@payload-ai-suite/ai-copilot'
export type { AiCopilotOptions } from '@payload-ai-suite/ai-copilot'
