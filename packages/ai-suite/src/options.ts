import type { AICoreOptions, AdapterProvider, ProviderConfig, RoutesOption } from 'payload-ai-core'
import type { AdaptersOptions } from 'payload-ai-adapters'
import type { AiAssistantOptions } from 'payload-ai-assistant'
import type { AiChannelsOptions } from 'payload-ai-channels'
import type { AiContentOptions } from 'payload-ai-content'
import type { AiCopilotOptions } from 'payload-ai-copilot'
import type { AiInsightsOptions } from 'payload-ai-insights'
import type { AiMarketingOptions } from 'payload-ai-marketing'
import type { AiMediaOptions } from 'payload-ai-media'
import type { AiSearchOptions } from 'payload-ai-search'
import type { AiSupportOptions } from 'payload-ai-support'

/** Module keys in install (phase) order. aiSuite() applies enabled modules in exactly this order. */
export const MODULE_ORDER = [
  'content',
  'search',
  'assistant',
  'marketing',
  'support',
  'channels',
  'insights',
  'media',
  'copilot',
] as const

export type SuiteModuleKey = (typeof MODULE_ORDER)[number]

/** `true` = defaults, options object = enabled with options, `false`/omitted = not installed. */
export type ModuleSwitch<O> = boolean | O

export interface AISuiteModules {
  content?: ModuleSwitch<AiContentOptions>
  search?: ModuleSwitch<AiSearchOptions>
  assistant?: ModuleSwitch<AiAssistantOptions>
  marketing?: ModuleSwitch<AiMarketingOptions>
  support?: ModuleSwitch<AiSupportOptions>
  /** Requires `assistant`. Channel credentials come from env vars named in the options. */
  channels?: ModuleSwitch<AiChannelsOptions>
  insights?: ModuleSwitch<AiInsightsOptions>
  media?: ModuleSwitch<AiMediaOptions>
  copilot?: ModuleSwitch<AiCopilotOptions>
}

/**
 * One-line install options (design doc §9). Everything that is not suite-specific is passed through to aiCore().
 */
export interface AISuiteOptions extends Omit<AICoreOptions, 'adapters' | 'providers' | 'routes'> {
  /** Business preset for the concept adapters: 'ecommerce' | 'services' | 'content' | 'custom'. */
  preset: AdaptersOptions['preset']
  /** Field/collection overrides on top of the preset. */
  overrides?: AdaptersOptions['overrides']
  /** Custom adapter implementations (preset 'custom' or to replace single concepts). */
  custom?: AdaptersOptions['custom']
  /** Bring a fully built AdapterProvider instead of preset/overrides/custom. */
  adapters?: AdapterProvider
  /** Provider connections. May be omitted only when `mockProvider` is set. */
  providers?: ProviderConfig[]
  /** Task class -> ordered model refs (`providerId:modelId`). */
  routes?: RoutesOption
  modules?: AISuiteModules
}
