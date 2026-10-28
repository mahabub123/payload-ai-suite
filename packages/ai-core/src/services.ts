import type { Payload } from 'payload'
import type { AICoreOptions, AIContext, AdapterSet, AdapterValidationResult, ConceptName, CoreServices, Settings } from './contracts'
import {
  createAIClient,
  createAuditService,
  createBudgetService,
  createCrypto,
  createProviderRegistry,
  createRateLimiter,
  createSettingsLoader,
  createUsageService,
} from './core-a'
import { createToolRegistry } from './tools'
import { createAgentRuntime } from './agent'
import { createActionService } from './actions'
import { createPromptLibrary } from './prompts'
import { createGuardrails } from './guardrails'
import { createMemoryService } from './memory'
import { createVectorStore } from './vectors'
import { createKnowledgeService } from './knowledge'

export interface CoreServicesImpl extends CoreServices {
  /** Last loaded settings (sync access for guardrails). */
  settingsSnapshot(): Settings
}

const FALLBACK_SETTINGS: Settings = {
  enabledModules: [],
  allowedDomains: [],
  limits: { visitorPerMinute: 20, visitorPerDay: 200, maxInputChars: 2000, maxOutputTokensShopper: 400 },
  retention: { shopperChatsDays: 90, staffChatsDays: 365, usageDays: 730, auditDays: 1095 },
  budgets: {},
}

/**
 * A system AIContext for jobs and hooks. Adapters get `system: true` and must still scope by tenant and skip
 * drafts; staff-tier tools are offered on the 'job' surface but confirm/staff tools still only propose.
 */
export const systemContext = (
  payload: Payload,
  adapters: AdapterSet,
  o: { module: string; tenant?: string | number; locale?: string },
  defaultLocale = 'en',
): AIContext => {
  const locale = o.locale ?? defaultLocale
  return {
    payload,
    requestId: `job_${globalThis.crypto.randomUUID()}`,
    module: o.module,
    surface: 'job',
    actor: { kind: 'system', roles: ['super-admin'] },
    tenant: o.tenant,
    locale,
    adapters,
    adapterCtx: { payload, user: null, locale, tenant: o.tenant, system: true },
  }
}

/** Wire every core service for one Payload instance. */
export const createCoreServices = (
  payload: Payload,
  options: AICoreOptions,
  init: { adapters?: AdapterSet; adapterStatus?: AdapterValidationResult[] } = {},
): CoreServicesImpl => {
  const services = {} as CoreServicesImpl
  const svc = () => services
  const adapters = init.adapters ?? {}
  const adapterStatus = init.adapterStatus ?? []
  const tenantField = options.tenant?.field
  const knownModules = (((payload.config?.custom as Record<string, any>)?.aiSuite?.modules ?? []) as { slug: string }[]).map((m) => m.slug)

  const crypto = createCrypto({ secretEnv: options.secretEnv })
  const settingsLoader = createSettingsLoader({ options, knownModules: knownModules.length ? knownModules : undefined })
  let snapshot: Settings = { ...FALLBACK_SETTINGS, allowedDomains: options.allowedDomains ?? [] }
  const settings = async (p: Payload, tenant?: string | number) => {
    const s = await settingsLoader.load(p, tenant)
    snapshot = s
    return s
  }
  const usage = createUsageService({ tenantField })
  const audit = createAuditService({ tenantField })
  const budgets = createBudgetService({ usage, audit, settings })
  const rateLimit = createRateLimiter({ redisUrlEnv: options.redis?.urlEnv, logger: { warn: (m) => payload.logger.warn(m) } })
  const registry = createProviderRegistry({ providers: options.providers, crypto, mockProvider: options.mockProvider, tenantField })
  const ai = createAIClient({ registry, usage, budgets, options, settings: (p, t) => settingsLoader.load(p, t) })

  const isConceptAvailable = (c: ConceptName) => {
    if (!(adapters as Record<string, unknown>)[c]) return false
    const status = adapterStatus.find((r) => r.concept === c)
    return status ? status.ok : true
  }

  Object.assign(services, {
    ai,
    adapters,
    adapterStatus,
    isConceptAvailable,
    crypto,
    usage,
    budgets,
    audit,
    rateLimit,
    settings,
    settingsSnapshot: () => snapshot,
    isModuleEnabled: (m: string, p: Payload, t?: string | number) => settingsLoader.isModuleEnabled(m, p, t),
    systemContext: (p: Payload, o: { module: string; tenant?: string | number; locale?: string }) =>
      systemContext(p, adapters, o, options.defaultLocale),
    tools: createToolRegistry(svc, { logger: () => payload.logger as unknown as { warn: (m: string) => void } }),
    agent: createAgentRuntime(svc),
    actions: createActionService(svc),
    prompts: createPromptLibrary(svc),
    guardrails: createGuardrails(svc, { settings: () => snapshot, payload: () => payload }),
    memory: createMemoryService(svc),
    vectors: createVectorStore({ payload: () => payload }),
  } satisfies Partial<CoreServicesImpl>)
  services.knowledge = createKnowledgeService(svc)
  void settings(payload).catch(() => undefined)
  return services
}
