/**
 * How modules plug into the core (design doc §6 "Each package is a normal Payload plugin").
 */
import type { CollectionConfig, GlobalConfig, PayloadRequest, TaskConfig, Payload, Config } from 'payload'
import type { z } from 'zod'
import type { ConceptName } from './adapters'
import type { AIContext, SuiteRole, Surface } from './context'
import type { AITool } from './tools'
import type { CoreServices, PromptTemplate } from './services'
import type { StreamWireEvent } from './wire'

/**
 * Who may call an endpoint.
 * 'anyone'   — visitors included (Turnstile + rate limits apply)
 * 'customer' — logged-in customer or verified channel identity
 * 'staff'    — any staff user
 * SuiteRole[] — staff with one of these roles (super-admin always passes)
 * 'webhook'  — no session; handler must verify a signature itself
 */
export type EndpointAccess = 'anyone' | 'customer' | 'staff' | 'webhook' | SuiteRole[]

export interface AIEndpointHandlerArgs<I> {
  ctx: AIContext
  services: CoreServices
  input: I
  req: PayloadRequest
  /** Raw request body (non-GET). Webhook handlers verify signatures against this. */
  rawBody?: string
}

export interface AIEndpointDefinition<I = unknown> {
  /** Path below /api, must start with '/ai/'. Payload params allowed: '/ai/actions/:id/confirm'. */
  path: `/ai/${string}`
  method: 'get' | 'post' | 'put' | 'patch' | 'delete'
  module: string
  access: EndpointAccess
  surface?: Surface
  /**
   * Serve even when the module is switched off in ai-settings. Only for obligations that outlive the
   * feature, e.g. unsubscribe links in emails already sent. Access, rate limits and validation still apply.
   */
  alwaysOn?: boolean
  /** Validate query (GET) or JSON body (others). Path params are merged in as `params`. */
  input?: z.ZodType<I>
  /** Per-actor rate limit. Default for 'anyone': settings.limits.visitorPerMinute per minute. */
  rateLimit?: { limit: number; windowSec: number } | false
  /** Budget pre-check before the handler. Default true. Handlers that degrade (search) set false. */
  budget?: boolean
  /** Require Turnstile for anonymous visitors. 'first' = only when no conversation cookie yet. */
  turnstile?: boolean | 'first'
  /**
   * The handler reads the raw request body itself (`req.text()`), e.g. to verify a webhook signature.
   * The guard pipeline must not read or parse the body for this endpoint (no `input` body validation).
   */
  rawBody?: boolean
  /** Return a Response, a JSON-serialisable value, or an async iterable of wire events (sent as SSE). */
  handler(args: AIEndpointHandlerArgs<I>): Promise<Response | unknown | AsyncIterable<StreamWireEvent>>
}

export interface AIModuleDefinition {
  /** Module key, matches modules.<key> in aiSuite options and ai-settings enabledModules. */
  slug: string
  /** Business concepts needed; when missing the module still loads but tools requiring them are disabled. */
  requires?: ConceptName[]
  collections?: CollectionConfig[]
  globals?: GlobalConfig[]
  tools?: AITool[]
  prompts?: PromptTemplate[]
  endpoints?: AIEndpointDefinition<any>[]
  /** Payload Jobs Queue tasks. Slugs should be prefixed `ai-<module>-`. */
  tasks?: TaskConfig<any>[]
  /** Cron-like schedules for tasks: { task, cron, queue? } (wired through jobs.autoRun / task.schedule). */
  schedules?: { task: string; cron: string; queue?: string }[]
  /** Extra config changes (admin components, hooks on business collections). Must preserve existing hooks. */
  extendConfig?: (config: Config) => Config
  /** Runs inside core onInit after services exist. */
  onInit?: (payload: Payload, services: CoreServices) => Promise<void> | void
}

/** Shape stored at config.custom.aiSuite. */
export interface SuiteConfigState {
  coreInstalled: true
  modules: AIModuleDefinition[]
  options: unknown
  /** aiCore({ disabled: true }): modules add nothing. */
  disabled?: boolean
}
