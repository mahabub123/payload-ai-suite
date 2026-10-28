import type { Config, Plugin } from 'payload'
import { aiCore, type AICoreOptions } from 'payload-ai-core'
import { createAdapters } from 'payload-ai-adapters'
import { aiAssistant } from 'payload-ai-assistant'
import { aiChannels, type AiChannelsOptions } from 'payload-ai-channels'
import { aiContent } from 'payload-ai-content'
import { aiCopilot } from 'payload-ai-copilot'
import { aiInsights } from 'payload-ai-insights'
import { aiMarketing } from 'payload-ai-marketing'
import { aiMedia } from 'payload-ai-media'
import { aiSearch } from 'payload-ai-search'
import { aiSupport } from 'payload-ai-support'
import type { AISuiteOptions, SuiteModuleKey } from './options'
import { enabledModules, validateSuiteOptions } from './validate'

type ModuleFactory = (options: any) => Plugin

const FACTORIES: Record<SuiteModuleKey, ModuleFactory> = {
  content: aiContent,
  search: aiSearch,
  assistant: aiAssistant,
  marketing: aiMarketing,
  support: aiSupport,
  channels: aiChannels,
  insights: aiInsights,
  media: aiMedia,
  copilot: aiCopilot,
}

/** `true` means "defaults"; channels always receives an object because aiChannels() requires one. */
const moduleOptions = (key: SuiteModuleKey, value: unknown): unknown => {
  if (value === true) return key === 'channels' ? ({} as AiChannelsOptions) : undefined
  return value
}

/** Split suite options into the aiCore() options (everything that is not suite-only). */
export const toCoreOptions = (options: AISuiteOptions): Omit<AICoreOptions, 'adapters'> => {
  const { preset: _p, overrides: _o, custom: _c, adapters: _a, modules: _m, providers, routes, ...rest } = options
  return { ...rest, providers: providers ?? [], routes: routes ?? {} }
}

/** The ordered list of plugins aiSuite() runs: aiCore first, then enabled modules in phase order. */
export const buildSuitePlugins = (options: AISuiteOptions): { key: 'core' | SuiteModuleKey; plugin: Plugin }[] => {
  const adapters =
    options.adapters ?? createAdapters({ preset: options.preset, overrides: options.overrides, custom: options.custom })
  const plugins: { key: 'core' | SuiteModuleKey; plugin: Plugin }[] = [
    { key: 'core', plugin: aiCore({ ...toCoreOptions(options), adapters }) },
  ]
  for (const key of enabledModules(options)) {
    plugins.push({ key, plugin: FACTORIES[key](moduleOptions(key, options.modules?.[key])) })
  }
  return plugins
}

/**
 * One-line install of the Payload AI Suite (design doc §9):
 * creates the business adapters, installs ai-core, then every enabled module in phase order,
 * as a single Payload plugin. Place it after plugins that create the collections it maps
 * (e.g. the official ecommercePlugin).
 */
export const aiSuite = (options: AISuiteOptions): Plugin => {
  const { warnings } = validateSuiteOptions(options)
  const plugins = buildSuitePlugins(options)
  const plugin: Plugin = async (incoming: Config): Promise<Config> => {
    for (const w of warnings) console.warn(`[ai-suite] ${w}`)
    let config = incoming
    for (const { plugin: p } of plugins) config = await p(config)
    return config
  }
  plugin.slug = 'ai-suite'
  return plugin
}
