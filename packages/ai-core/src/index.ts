export * from './contracts'
export { getAI, hasAI, setAI } from './module/runtime'
export { defineTool } from './module/defineTool'
export { createAIModulePlugin, getSuiteState, SUITE_KEY, withTenantField, applySchedules } from './module/createModulePlugin'
export { coerceRelationIds, coerceRelationIdsHook, withRelationIdCoercion } from './module/ids'
export { access, rolesOf, hasRole, isStaffRoles, defaultRoles } from './access'
export {
  toPayloadEndpoint,
  createAIContext,
  resolveIdentity,
  resolveTenant,
  checkAccess,
  errorResponse,
  toSSEResponse,
  sseFrame,
  VISITOR_COOKIE,
  TURNSTILE_COOKIE,
} from './api/endpoint'

/* plugin assembly */
export { aiCore, initCore, coreBCollections, coreEndpointDefinitions, coreTasks } from './plugin'
export { createCoreServices, systemContext } from './services'
export type { CoreServicesImpl } from './services'

/* part B services */
export { createToolRegistry, maxTierFor, tierAllowed } from './tools'
export type { ToolRegistryImpl } from './tools'
export { createAgentRuntime, toolSpec, compactResult, MAX_AGENT_STEPS } from './agent'
export { createActionService, aiActionsCollection, actionEndpoints, ACTIONS_SLUG } from './actions'
export {
  createPromptLibrary,
  renderTemplate,
  localeChain,
  aiPromptsCollection,
  invalidatePromptCaches,
  PROMPTS_SLUG,
} from './prompts'
export {
  createGuardrails,
  sanitizeHtml,
  renderMarkdown,
  detectInjection,
  extractClaims,
  stripDisallowedLinks,
  INJECTION_PATTERNS,
} from './guardrails'
export {
  createMemoryService,
  aiConversationsCollection,
  aiMessagesCollection,
  aiCustomerMemoryCollection,
  memoryEndpoints,
  retentionTask,
  runRetention,
  CONVERSATIONS_SLUG,
  MESSAGES_SLUG,
  CUSTOMER_MEMORY_SLUG,
} from './memory'
export { createVectorStore, rrfMerge, vectorMigrationSQL, writeVectorMigration, aiSuiteMigration } from './vectors'
export type { PgStore, VectorMode } from './vectors'
export {
  createKnowledgeService,
  chunkText,
  hashContent,
  attachKnowledgeHooks,
  knowledgeTasks,
  knowledgeTableSpec,
  KNOWLEDGE_TABLE,
  INDEX_KNOWLEDGE_TASK,
  KNOWLEDGE_DRIFT_TASK,
  indexLocales,
} from './knowledge'
export { aiTicketsCollection, TICKETS_SLUG } from './tickets'

/* part A (providers, router, usage, budgets, audit, settings, admin collections) */
export * from './core-a'
export { AI_VECTOR_TABLES, aiSuiteTablesFilter } from './vectors/tablesFilter'
