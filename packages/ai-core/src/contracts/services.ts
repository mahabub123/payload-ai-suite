/**
 * The services the core gives every module (design doc §7). Obtain them at runtime with
 * `getAI(payload)`. Modules never call a model, vector table or vendor SDK directly.
 */
import type { z } from 'zod'
import type { Payload } from 'payload'
import type {
  ChatMessage,
  ChatResult,
  EmbedResult,
  ImageResult,
  ModelInfo,
  StreamEvent,
  TaskClass,
  ToolSpec,
} from './providers'
import type { AIContext } from './context'
import type { AdapterSet, AdapterValidationResult, ConceptName, Visibility } from './adapters'
import type { AITool, AgentEvent, RunAgentOptions, ToolContext } from './tools'
import type { ActionStatus, Card, Citation } from './wire'

/* ---------- 1. Router / AI client ---------- */

export interface GenerateTextOptions {
  task: TaskClass
  system?: string
  messages?: ChatMessage[]
  /** Shorthand for a single user message. */
  prompt?: string
  tools?: ToolSpec[]
  temperature?: number
  maxOutputTokens?: number
  /** Override the per-route timeout. */
  timeoutMs?: number
  signal?: AbortSignal
  /** Extra capabilities needed beyond the task's defaults (e.g. ['vision']). */
  needs?: ('vision' | 'tools' | 'structuredOutput' | 'promptCaching' | 'batch')[]
  /** Prompt slug + version for usage/audit attribution. */
  promptRef?: { slug: string; version: number }
}

export interface GenerateObjectOptions<T> extends Omit<GenerateTextOptions, 'tools'> {
  schema: z.ZodType<T>
  schemaName?: string
}

export interface CallMeta {
  model: string
  latencyMs: number
  costMicros: number
  usageId?: string | number
}

/**
 * Every call: budget pre-check -> route resolution -> provider call with timeout/retry/fallback
 * (circuit breaker) -> usage row. Throws AIError('budget_exceeded') before any provider call when
 * the tenant/module budget is spent.
 */
export interface AIClient {
  generateText(opts: GenerateTextOptions, ctx: AIContext): Promise<ChatResult & CallMeta>
  streamText(opts: GenerateTextOptions, ctx: AIContext): AsyncIterable<StreamEvent> & { meta: Promise<CallMeta> }
  generateObject<T>(opts: GenerateObjectOptions<T>, ctx: AIContext): Promise<{ object: T } & CallMeta>
  embed(values: string[], ctx: AIContext, opts?: { task?: 'embed' }): Promise<EmbedResult & CallMeta>
  generateImage(
    opts: { prompt: string; image?: { data?: string; url?: string; mediaType?: string }; size?: `${number}x${number}`; n?: number },
    ctx: AIContext,
  ): Promise<ImageResult & CallMeta>
  /** Models the route would try, in order, for this ctx (tenant/module/locale overrides applied). */
  resolveRoute(task: TaskClass, ctx: Pick<AIContext, 'module' | 'tenant' | 'locale'>): ModelInfo[]
  /** Embedding model ref + dims currently active (for index bookkeeping). */
  activeEmbedding(ctx: Pick<AIContext, 'module' | 'tenant' | 'locale'>): { ref: string; dims: number }
  /** Run a 1-token call and a tool-call check against a provider. */
  testProvider(providerId: string, ctx: AIContext): Promise<{ ok: boolean; chat: boolean; tools: boolean; error?: string }>
}

/* ---------- 2. Agent runtime + tool registry ---------- */

export interface ToolRegistry {
  register(tool: AITool, module: string): void
  get(name: string): AITool | undefined
  list(): (AITool & { module: string })[]
  /** Tools usable in ctx: tier allowed for actor+surface, required concepts mapped, available() true. */
  availableFor(ctx: ToolContext, names?: string[]): AITool[]
  /** Startup validation output: tool -> reason disabled. */
  disabled(): Record<string, string>
}

export interface AgentRuntime {
  run(opts: RunAgentOptions): AsyncIterable<AgentEvent>
}

export interface ActionRecord {
  id: string
  tool: string
  input: unknown
  status: ActionStatus
  title: string
  summary: string
  conversationId?: string
  result?: unknown
  expiresAt: string
}

export interface ActionService {
  /** Create a proposed action for a confirm-tier tool; returns the confirmation card. */
  propose(tool: AITool, input: unknown, ctx: ToolContext, opts?: { conversationId?: string }): Promise<{ action: ActionRecord; card: Card }>
  /** Confirm and run. Same idempotencyKey -> same result, never runs twice. Actor must match the proposer (or be staff). */
  confirm(id: string, idempotencyKey: string, ctx: AIContext): Promise<ActionRecord>
  reject(id: string, ctx: AIContext): Promise<ActionRecord>
}

/* ---------- 3. Prompt library ---------- */

export interface PromptTemplate {
  slug: string
  /** Task class the prompt runs on. */
  task: TaskClass
  /** '*' = any locale. */
  locale?: string
  description?: string
  /** Mustache-style `{{var}}` template for the system prompt. */
  system: string
  /** Optional user-message template. */
  user?: string
  /** JSON schema of expected output (documentation + DB storage). */
  outputSchema?: Record<string, unknown>
  /** Include the shared brand-voice block. Default true. */
  brandVoice?: boolean
}

export interface RenderedPrompt {
  slug: string
  version: number
  task: TaskClass
  system: string
  user?: string
}

export interface PromptLibrary {
  /** Register a code default (version 0). DB rows in ai-prompts with status 'active' win. */
  registerDefault(t: PromptTemplate, module: string): void
  render(slug: string, vars: Record<string, unknown>, ctx: Pick<AIContext, 'payload' | 'locale' | 'tenant'>): Promise<RenderedPrompt>
  list(): (PromptTemplate & { module: string })[]
}

/* ---------- 4. Knowledge and retrieval ---------- */

export interface KnowledgeHit {
  id: string
  sourceCollection: string
  sourceId: string
  title: string
  content: string
  url?: string
  score: number
}

export interface VectorTableSpec {
  /** Postgres table name, e.g. ai_offerings. */
  name: string
  /** Extra filter columns: name -> SQL type. */
  columns: Record<string, string>
}

export interface VectorRow {
  id: string
  content: string
  embedding: number[]
  /** Values for spec.columns. */
  fields: Record<string, unknown>
}

export interface VectorQuery {
  embedding?: number[]
  /** Full-text query (websearch_to_tsquery). */
  text?: string
  k: number
  /**
   * Structured filters ANDed in SQL. Keys must be spec columns.
   * Values: scalar (=), array (= ANY), { gte, lte }, { contains } for array columns.
   */
  where?: Record<string, unknown>
  /** Reciprocal rank fusion constant when both embedding and text are present. Default 60. */
  rrfK?: number
}

export interface VectorStore {
  /** 'keyword' when pgvector is unavailable: callers should skip embedding queries. 'unknown' before first use. */
  mode?(): 'vector' | 'keyword' | 'unknown'
  /** Ensure the pgvector extension and table exist (dev push). Production uses committed migrations. */
  ensureTable(spec: VectorTableSpec, dims: number): Promise<void>
  upsert(table: string, rows: VectorRow[], meta: { tenant?: string | number; locale?: string; model: string }): Promise<void>
  delete(table: string, ids: string[], tenant?: string | number): Promise<void>
  /** Hybrid when both embedding and text present (RRF), else vector-only or keyword-only. Always tenant-scoped. */
  query(
    table: string,
    q: VectorQuery,
    scope: { tenant?: string | number; locale?: string; model?: string },
  ): Promise<{ id: string; score: number; content: string; fields: Record<string, unknown> }[]>
  /** SQL for a committed migration creating a table (used by `ai-suite migrations`). */
  migrationSQL(spec: VectorTableSpec, dims: number): string
}

export interface KnowledgeService {
  search(
    query: string,
    ctx: AIContext,
    opts?: { k?: number; visibility?: Visibility[]; collections?: string[] },
  ): Promise<{ hits: KnowledgeHit[]; citations: Citation[] }>
  /** Index one source doc (chunk -> hash -> re-embed changed chunks only). */
  indexDoc(collection: string, doc: Record<string, unknown>, ctx: AIContext): Promise<{ chunks: number; embedded: number }>
  removeDoc(collection: string, id: string, ctx: AIContext): Promise<void>
  /** Full rebuild / drift repair. */
  reindexAll(ctx: AIContext, opts?: { since?: Date }): Promise<{ docs: number; chunks: number }>
}

/* ---------- 5. Guardrails ---------- */

export interface GuardrailResult {
  ok: boolean
  issues: { code: string; message: string }[]
}

export interface Guardrails {
  checkInput(text: string, ctx: AIContext): GuardrailResult
  /** Prices/stock/order numbers in text must match tool results; links only to allowed domains. */
  checkOutput(text: string, ctx: AIContext, evidence: { toolResults: unknown[] }): GuardrailResult & { text: string }
  moderate(text: string, ctx: AIContext): Promise<GuardrailResult>
  sanitizeHtml(html: string): string
  /** Markdown -> sanitized HTML. */
  renderMarkdown(md: string): string
  /** Shared system policy block (topics, never invent prices/stock, cite sources, data is quoted). */
  systemPolicy(ctx: AIContext): string
  /** Wrap retrieved/untrusted text so the model treats it as quoted data. */
  quote(label: string, text: string): string
  /** Remove fields flagged aiExclude before anything leaves the server. */
  redact<T>(collection: string, doc: T): T
}

/* ---------- 6. Memory ---------- */

export interface ConversationRef {
  id: string
  channel: string
  module: string
  summary?: string
  handedOff?: boolean
}

export interface StoredMessage {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  text: string
  cards?: Card[]
  toolCalls?: unknown[]
  citations?: Citation[]
  createdAt: string
}

export interface MemoryService {
  /** Get or create a thread owned by ctx.actor; throws forbidden if conversationId belongs to someone else. */
  thread(ctx: AIContext, opts: { conversationId?: string; channel: string }): Promise<ConversationRef>
  append(
    conversationId: string,
    msg: Omit<StoredMessage, 'id' | 'createdAt'> & { tokens?: number; model?: string; latencyMs?: number },
    ctx: AIContext,
  ): Promise<StoredMessage>
  /** Rolling summary + last N turns as model messages. */
  context(conversationId: string, ctx: AIContext, opts?: { lastTurns?: number }): Promise<{ summary?: string; messages: ChatMessage[] }>
  /** Re-summarize when history grows past the threshold. */
  maybeSummarize(conversationId: string, ctx: AIContext): Promise<void>
  update(conversationId: string, patch: Partial<{ status: string; handedOff: boolean; tags: string[]; outcome: string }>, ctx: AIContext): Promise<void>
  /** Stored messages (with cards/citations) for widget resume. Same ownership rules as thread(). */
  messages?(conversationId: string, ctx: AIContext, opts?: { limit?: number }): Promise<StoredMessage[]>
  /** Record shopper feedback on an assistant message owned by ctx.actor. */
  feedback?(messageId: string, feedback: { rating: 'up' | 'down'; comment?: string }, ctx: AIContext): Promise<void>
  customerMemory: {
    get(ctx: AIContext): Promise<Record<string, unknown> | null>
    set(patch: Record<string, unknown>, ctx: AIContext): Promise<void>
    clear(ctx: AIContext): Promise<void>
  }
}

/* ---------- 7. Usage, budgets, audit ---------- */

export interface UsageRecordInput {
  module: string
  task: TaskClass
  model: string
  inputTokens: number
  outputTokens: number
  cachedInputTokens?: number
  costMicros: number
  latencyMs: number
  outcome: 'ok' | 'error' | 'fallback' | 'blocked'
  errorCode?: string
  promptRef?: { slug: string; version: number }
}

export interface UsageService {
  record(input: UsageRecordInput, ctx: Pick<AIContext, 'payload' | 'tenant' | 'requestId' | 'actor'>): Promise<void>
  /** Spend this calendar month, micro-USD. */
  monthToDate(scope: { tenant?: string | number; module?: string }, payload: Payload): Promise<number>
  summary(
    scope: { tenant?: string | number; from: Date; to: Date },
    payload: Payload,
  ): Promise<{ module: string; calls: number; inputTokens: number; outputTokens: number; costMicros: number }[]>
}

export interface BudgetService {
  /** Throws AIError('budget_exceeded') at >= 100%; emits a one-time alert at >= 80%. */
  assert(ctx: Pick<AIContext, 'payload' | 'tenant' | 'module'>): Promise<void>
  status(ctx: Pick<AIContext, 'payload' | 'tenant' | 'module'>): Promise<{ limitMicros: number | null; spentMicros: number; ratio: number }>
}

export interface AuditService {
  log(
    entry: { action: string; target?: { collection?: string; id?: string | number }; before?: unknown; after?: unknown; meta?: unknown },
    ctx: Pick<AIContext, 'payload' | 'tenant' | 'requestId' | 'actor'>,
  ): Promise<void>
}

/* ---------- Misc services ---------- */

export interface RateLimiter {
  /** Returns false when over limit. Key examples: `visitor:${hash}`, `ip:${hash}`. */
  hit(key: string, opts: { limit: number; windowSec: number }): Promise<{ ok: boolean; remaining: number; resetSec: number }>
}

export interface Crypto {
  /** AES-256-GCM with the server secret. */
  encrypt(plain: string): string
  decrypt(cipher: string): string
  /** HMAC-SHA256 hash for identifiers used only for joining. */
  hashId(value: string): string
}

export interface Settings {
  enabledModules: string[]
  brandVoice?: string
  allowedDomains: string[]
  limits: { visitorPerMinute: number; visitorPerDay: number; maxInputChars: number; maxOutputTokensShopper: number }
  retention: { shopperChatsDays: number; staffChatsDays: number; usageDays: number; auditDays: number }
  budgets: { monthlyMicros?: number; perModule?: Record<string, number> }
}

export interface CoreServices {
  ai: AIClient
  tools: ToolRegistry
  agent: AgentRuntime
  actions: ActionService
  prompts: PromptLibrary
  knowledge: KnowledgeService
  vectors: VectorStore
  guardrails: Guardrails
  memory: MemoryService
  usage: UsageService
  budgets: BudgetService
  audit: AuditService
  rateLimit: RateLimiter
  crypto: Crypto
  adapters: AdapterSet
  /** Startup validation results for every concept. */
  adapterStatus: AdapterValidationResult[]
  isConceptAvailable(c: ConceptName): boolean
  /** Merged ai-settings global + plugin options (cached, refreshed on change). */
  settings(payload: Payload, tenant?: string | number): Promise<Settings>
  isModuleEnabled(module: string, payload: Payload, tenant?: string | number): Promise<boolean>
  /** Build an AIContext for jobs and hooks (actor kind 'system'). */
  systemContext(payload: Payload, opts: { module: string; tenant?: string | number; locale?: string }): AIContext
}
