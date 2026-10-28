import type { CollectionConfig, Config, Plugin, TaskConfig } from 'payload'
import type { AICoreOptions, AIModuleDefinition, SuiteConfigState } from '../contracts'
import { toPayloadEndpoint } from '../api/endpoint'
import { SUITE_KEY } from './constants'
import { withRelationIdCoercion } from './ids'

export { SUITE_KEY }

/** Adds the tenant relationship field when the core is configured for multi-tenancy. */
export const withTenantField = (collection: CollectionConfig, options: AICoreOptions | undefined): CollectionConfig => {
  const field = options?.tenant?.field
  if (!field || collection.fields.some((f) => 'name' in f && f.name === field)) return collection
  return {
    ...collection,
    fields: [
      ...collection.fields,
      {
        name: field,
        type: 'relationship',
        relationTo: (options.tenant as { collection?: string }).collection ?? 'tenants',
        index: true,
        admin: { position: 'sidebar', readOnly: true },
      } as CollectionConfig['fields'][number],
    ],
  }
}

export const getSuiteState = (config: Pick<Config, 'custom'>): SuiteConfigState | undefined =>
  (config.custom as Record<string, unknown> | undefined)?.[SUITE_KEY] as SuiteConfigState | undefined

/** Wire `def.schedules` into each task's Payload `schedule` config (default queue 'ai-default'). */
export const applySchedules = (tasks: TaskConfig<any>[], schedules: AIModuleDefinition['schedules']): TaskConfig<any>[] =>
  !schedules?.length
    ? tasks
    : tasks.map((t) => {
        const extra = schedules.filter((s) => s.task === t.slug).map((s) => ({ cron: s.cron, queue: s.queue ?? 'ai-default' }))
        return extra.length ? { ...t, schedule: [...(t.schedule ?? []), ...extra] } : t
      })

/**
 * Turn a module definition into a normal Payload plugin. ai-core must run first.
 * Adds only the module's own collections/globals/endpoints/tasks and preserves everything else.
 * Disabling a module (option `false`) adds nothing; ai-settings enabledModules gates it at runtime.
 */
export const createAIModulePlugin =
  (def: AIModuleDefinition): ((config: Config) => Config) & Plugin =>
  (incoming: Config): Config => {
    const state = getSuiteState(incoming)
    if (!state?.coreInstalled) {
      throw new Error(`[ai-suite] Module "${def.slug}" requires aiCore() to be installed before it in plugins[].`)
    }
    if (state.disabled) return incoming
    let config: Config = {
      ...incoming,
      collections: [
        ...(incoming.collections ?? []),
        ...(def.collections ?? []).map((c) => withRelationIdCoercion(withTenantField(c, state.options as AICoreOptions))),
      ],
      globals: [...(incoming.globals ?? []), ...(def.globals ?? [])],
      endpoints: [...(incoming.endpoints ?? []), ...(def.endpoints ?? []).map(toPayloadEndpoint)],
      jobs: {
        ...incoming.jobs,
        tasks: [...(incoming.jobs?.tasks ?? []), ...applySchedules(def.tasks ?? [], def.schedules)],
      },
      custom: {
        ...incoming.custom,
        [SUITE_KEY]: { ...state, modules: [...state.modules, def] } satisfies SuiteConfigState,
      },
    }
    if (def.extendConfig) config = def.extendConfig(config)
    return config
  }
