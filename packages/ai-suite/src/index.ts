/**
 * payload-ai-suite — the one-line install.
 *
 *   import { aiSuite } from 'payload-ai-suite'
 *   plugins: [ecommercePlugin({...}), aiSuite({ preset: 'ecommerce', providers, routes, modules: { assistant: true } })]
 *
 * Also re-exports the core public API and every module's plugin + options type, so sites
 * that prefer to compose plugins by hand need only this one dependency.
 */
export { aiSuite, buildSuitePlugins, toCoreOptions } from './aiSuite'
export { MODULE_ORDER } from './options'
export type { AISuiteOptions, AISuiteModules, ModuleSwitch, SuiteModuleKey } from './options'
export { AISuiteConfigError, enabledModules, validateSuiteOptions } from './validate'

export * from 'payload-ai-core'
export { createAdapters } from 'payload-ai-adapters'
export type { AdaptersOptions } from 'payload-ai-adapters'
export { aiContent } from 'payload-ai-content'
export type { AiContentOptions } from 'payload-ai-content'
export { aiSearch } from 'payload-ai-search'
export type { AiSearchOptions } from 'payload-ai-search'
export { aiAssistant } from 'payload-ai-assistant'
export type { AiAssistantOptions } from 'payload-ai-assistant'
export { aiMarketing } from 'payload-ai-marketing'
export type { AiMarketingOptions } from 'payload-ai-marketing'
export { aiSupport } from 'payload-ai-support'
export type { AiSupportOptions } from 'payload-ai-support'
export { aiChannels } from 'payload-ai-channels'
export type { AiChannelsOptions } from 'payload-ai-channels'
export { aiInsights } from 'payload-ai-insights'
export type { AiInsightsOptions } from 'payload-ai-insights'
export { aiMedia } from 'payload-ai-media'
export type { AiMediaOptions } from 'payload-ai-media'
export { aiCopilot } from 'payload-ai-copilot'
export type { AiCopilotOptions } from 'payload-ai-copilot'
