import type { CollectionConfig, Config, Payload, Plugin } from 'payload'
import type { AICoreOptions, AdapterSet, AdapterValidationResult, SuiteConfigState } from './contracts'
import { SUITE_KEY, getSuiteState, withTenantField } from './module/createModulePlugin'
import { withRelationIdCoercion } from './module/ids'
import { setAI } from './module/runtime'
import { toPayloadEndpoint } from './api/endpoint'
import { aiActionsCollection, actionEndpoints } from './actions'
import { aiPromptsCollection } from './prompts'
import {
  aiConversationsCollection,
  aiCustomerMemoryCollection,
  aiMessagesCollection,
  memoryEndpoints,
  retentionTask,
} from './memory'
import { aiTicketsCollection } from './tickets'
import { attachKnowledgeHooks, knowledgeTasks } from './knowledge'
import { aiSettingsGlobal, coreAdminCollections, coreAEndpoints } from './core-a'
import { createCoreServices, type CoreServicesImpl } from './services'
import type { ToolRegistryImpl } from './tools'

/** Collections owned by ai-core part B (tenant field applied by the plugin). */
export const coreBCollections = (userCollection: string): CollectionConfig[] => [
  aiActionsCollection,
  aiPromptsCollection,
  aiConversationsCollection,
  aiMessagesCollection,
  aiCustomerMemoryCollection,
  aiTicketsCollection(userCollection),
]

/** Every endpoint definition the core adds (before conversion to Payload endpoints). */
export const coreEndpointDefinitions = () => [...actionEndpoints, ...memoryEndpoints, ...coreAEndpoints]

export const coreTasks = () => [...knowledgeTasks, retentionTask]

/**
 * The AI core plugin. Must run before every module plugin.
 * Adds only its own collections, global, endpoints and job tasks; keeps existing hooks and onInit.
 */
export const aiCore =
  (options: AICoreOptions): ((config: Config) => Config) & Plugin =>
  (incoming: Config): Config => {
    const prev = getSuiteState(incoming)
    const state: SuiteConfigState = {
      coreInstalled: true,
      modules: prev?.modules ?? [],
      options,
      ...(options.disabled ? { disabled: true } : {}),
    }
    const custom = { ...incoming.custom, [SUITE_KEY]: state }
    if (options.disabled) return { ...incoming, custom }

    const userCollection = (incoming.admin?.user as string | undefined) ?? 'users'
    const collections = [...coreBCollections(userCollection), ...coreAdminCollections(options)].map((c) => withRelationIdCoercion(withTenantField(c, options)))

    let config: Config = {
      ...incoming,
      collections: [...(incoming.collections ?? []), ...collections],
      globals: [...(incoming.globals ?? []), aiSettingsGlobal(options)],
      endpoints: [...(incoming.endpoints ?? []), ...coreEndpointDefinitions().map(toPayloadEndpoint)],
      jobs: { ...incoming.jobs, tasks: [...(incoming.jobs?.tasks ?? []), ...coreTasks()] },
      custom,
      onInit: async (payload) => {
        await initCore(payload, options)
        if (incoming.onInit) await incoming.onInit(payload)
      },
    }
    config = attachKnowledgeHooks(config, options)
    return config
  }

/** Runtime initialisation (called from onInit). Exported for tests and custom bootstraps. */
export const initCore = async (payload: Payload, options: AICoreOptions): Promise<CoreServicesImpl> => {
  const log = payload.logger
  let adapters: AdapterSet = {}
  let adapterStatus: AdapterValidationResult[] = []
  if (options.adapters) {
    try {
      adapters = options.adapters.build(payload)
    } catch (e) {
      log.error({ err: e, msg: `[ai-suite] Building adapters (preset "${options.adapters.preset}") failed; all adapter-backed tools are disabled.` })
    }
    try {
      adapterStatus = options.adapters.validate(payload)
    } catch (e) {
      log.error({ err: e, msg: '[ai-suite] Adapter validation threw.' })
    }
    for (const r of adapterStatus) {
      if (r.ok) continue
      // A concept the preset doesn't map is expected; a mapped-but-broken one must fail loudly.
      if (r.collection) log.error(`[ai-suite] Adapter "${r.concept}" (${r.collection}) is invalid: ${r.problems.join('; ')}`)
      else log.info(`[ai-suite] Concept "${r.concept}" is not mapped: ${r.problems.join('; ')}`)
    }
  } else {
    log.warn('[ai-suite] No business adapters configured (options.adapters); tools that need business data are disabled.')
  }

  const services = createCoreServices(payload, options, { adapters, adapterStatus })
  setAI(payload, services)

  const modules = getSuiteState(payload.config)?.modules ?? []
  // Register every module's tools/prompts first so onInit hooks can see what other modules provide.
  for (const m of modules) {
    for (const t of m.tools ?? []) services.tools.register(t, m.slug)
    for (const p of m.prompts ?? []) services.prompts.registerDefault(p, m.slug)
  }
  for (const m of modules) {
    if (!m.onInit) continue
    try {
      await m.onInit(payload, services)
    } catch (e) {
      log.error({ err: e, msg: `[ai-suite] Module "${m.slug}" onInit failed` })
    }
  }

  const { available, disabled } = (services.tools as ToolRegistryImpl).validate()
  log.info(`[ai-suite] AI core ready. Modules: ${modules.map((m) => m.slug).join(', ') || 'none'}. Tools available: ${available.join(', ') || 'none'}.`)
  for (const [tool, reason] of Object.entries(disabled)) log.warn(`[ai-suite] Tool "${tool}" disabled: ${reason}`)
  return services
}
