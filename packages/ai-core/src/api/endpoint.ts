import type { Endpoint, PayloadRequest, TypedUser } from 'payload'
import type {
  AICoreOptions,
  AIContext,
  AIEndpointDefinition,
  APIErrorBody,
  Actor,
  CoreServices,
  EndpointAccess,
  Settings,
  StreamWireEvent,
  Surface,
} from '../contracts'
import { AIError, isAIError } from '../contracts'
import { coreOptionsFromReq, hasRole, isStaffRoles, rolesOf } from '../access/roles'
import { getAI, hasAI } from '../module/runtime'

/** Visitor cookie (random id; only its HMAC is ever stored). */
export const VISITOR_COOKIE = 'ai_vid'
/** Set after a successful Turnstile check; value is an HMAC of the visitor id, so it can't be forged. */
export const TURNSTILE_COOKIE = 'ai_tsv'
export const TENANT_COOKIE = 'payload-tenant'
export const HEARTBEAT_MS = 15_000
const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
/** Modules that are never gated by ai-settings enabledModules. */
const ALWAYS_ON = new Set(['core'])

/* ---------------- small request helpers ---------------- */

export const parseCookies = (header: string | null | undefined): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const k = part.slice(0, i).trim()
    if (!k) continue
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim())
    } catch {
      out[k] = part.slice(i + 1).trim()
    }
  }
  return out
}

const header = (req: PayloadRequest, name: string): string | undefined => req.headers?.get?.(name) ?? undefined

const cookiesOf = (req: PayloadRequest) => parseCookies(header(req, 'cookie'))

export const clientIp = (req: PayloadRequest): string =>
  header(req, 'cf-connecting-ip') ?? header(req, 'x-forwarded-for')?.split(',')[0]?.trim() ?? header(req, 'x-real-ip') ?? 'unknown'

const newId = () => globalThis.crypto.randomUUID()

const requestIdOf = (req: PayloadRequest): string => {
  const h = header(req, 'x-request-id')
  return h && /^[\w.-]{1,64}$/.test(h) ? h : newId()
}

const hashWith = (services: CoreServices | undefined, v: string) => (services ? services.crypto.hashId(v) : `raw_${v}`)

const isSecure = (req: PayloadRequest) =>
  (req.protocol ?? '').startsWith('https') || header(req, 'x-forwarded-proto') === 'https'

const cookieString = (name: string, value: string, req: PayloadRequest, maxAgeSec: number) =>
  `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${isSecure(req) ? '; Secure' : ''}`

/* ---------------- identity / tenant / context ---------------- */

export interface ResolvedIdentity {
  actor: Actor
  /** Set-Cookie value when a new visitor cookie was minted. */
  setCookie?: string
}

/** Payload session user -> staff/customer; otherwise a visitor identified by the hashed `ai_vid` cookie. */
export const resolveIdentity = (
  req: PayloadRequest,
  services: CoreServices | undefined,
  options: AICoreOptions | undefined = coreOptionsFromReq(req),
): ResolvedIdentity => {
  const user = req.user as TypedUser | null | undefined
  if (user) {
    const roles = rolesOf(user, req)
    const { customers: customersSlug, staff: staffSlug } = options?.userCollections ?? {}
    // A customers-only collection never yields staff; a collection shared with staff (common with the Ecommerce plugin) decides by role.
    const isCustomerCollection = Boolean(customersSlug && user.collection === customersSlug && customersSlug !== staffSlug)
    if (!isCustomerCollection && isStaffRoles(roles)) return { actor: { kind: 'staff', user, roles } }
    return { actor: { kind: 'customer', user, roles: roles.includes('customer') ? roles : [...roles, 'customer'], customerId: String(user.id) } }
  }
  const cookies = cookiesOf(req)
  let raw = cookies[VISITOR_COOKIE]
  let setCookie: string | undefined
  if (!raw || !/^[\w-]{16,64}$/.test(raw)) {
    raw = newId()
    setCookie = cookieString(VISITOR_COOKIE, raw, req, 365 * 86400)
  }
  return { actor: { kind: 'visitor', roles: [], visitorId: hashWith(services, `vid:${raw}`) }, setCookie }
}

const userTenant = (user: unknown): string | number | undefined => {
  const u = user as Record<string, unknown> | null | undefined
  if (!u) return undefined
  const pick = (v: unknown): string | number | undefined =>
    v == null ? undefined : typeof v === 'object' ? ((v as { id?: string | number }).id ?? undefined) : (v as string | number)
  if (u.tenant !== undefined) return pick(u.tenant)
  const list = u.tenants as { tenant?: unknown }[] | undefined
  return Array.isArray(list) && list.length ? pick(list[0]?.tenant) : undefined
}

/** options.tenant.resolve, else the Multi-Tenant plugin cookie, else the user's tenant. */
export const resolveTenant = (req: PayloadRequest, options: AICoreOptions | undefined = coreOptionsFromReq(req)): string | number | undefined => {
  if (!options?.tenant) return undefined
  const fromResolver = options.tenant.resolve?.(req)
  if (fromResolver !== undefined && fromResolver !== '') return fromResolver
  const cookie = cookiesOf(req)[TENANT_COOKIE]
  if (cookie) return /^\d+$/.test(cookie) ? Number(cookie) : cookie
  return userTenant(req.user)
}

const resolveLocale = (req: PayloadRequest, options: AICoreOptions | undefined): string => {
  const l = typeof req.locale === 'string' && req.locale !== 'all' ? req.locale : undefined
  const q = (req.query as Record<string, unknown> | undefined)?.locale
  return l ?? (typeof q === 'string' && /^[a-zA-Z-]{2,10}$/.test(q) ? q : undefined) ?? options?.defaultLocale ?? 'en'
}

/**
 * Build an AIContext for a Payload request (usable from custom routes, hooks with a req, server actions).
 * Identity is resolved the same way the guard pipeline does it; no cookie is set here.
 */
export const createAIContext = (
  req: PayloadRequest,
  o: { module: string; surface?: Surface; requestId?: string; actor?: Actor; tenant?: string | number; locale?: string },
): AIContext => {
  const services = hasAI(req.payload) ? getAI(req.payload) : undefined
  const options = coreOptionsFromReq(req)
  const actor = o.actor ?? resolveIdentity(req, services, options).actor
  const tenant = o.tenant ?? resolveTenant(req, options)
  const locale = o.locale ?? resolveLocale(req, options)
  const surface: Surface = o.surface ?? (actor.kind === 'staff' ? 'admin' : actor.kind === 'channel' ? 'channel' : 'storefront')
  return {
    payload: req.payload,
    req,
    requestId: o.requestId ?? requestIdOf(req),
    module: o.module,
    surface,
    actor,
    tenant,
    locale,
    adapters: services?.adapters ?? {},
    adapterCtx: { payload: req.payload, req, user: actor.user ?? null, customerId: actor.customerId, locale, tenant, system: false },
  }
}

/* ---------------- guards ---------------- */

export const checkAccess = (access: EndpointAccess, actor: Actor): void => {
  if (access === 'anyone' || access === 'webhook') return
  const isStaff = actor.kind === 'staff' && isStaffRoles(actor.roles)
  if (access === 'customer') {
    if (actor.kind === 'customer' || (actor.kind === 'channel' && actor.channel?.verified && actor.customerId)) return
    throw actor.kind === 'visitor' ? new AIError('auth', 'Sign in required') : new AIError('forbidden', 'Customers only')
  }
  if (!isStaff) throw actor.kind === 'visitor' ? new AIError('auth', 'Sign in required') : new AIError('forbidden', 'Staff only')
  if (access === 'staff') return
  if (!hasRole(actor.roles, access)) throw new AIError('forbidden', 'Your role cannot use this endpoint')
}

const actorKey = (actor: Actor, services: CoreServices): string =>
  actor.kind === 'visitor'
    ? `visitor:${actor.visitorId}`
    : actor.kind === 'channel'
      ? `channel:${actor.channel?.externalIdHash}`
      : actor.customerId
        ? `customer:${services.crypto.hashId(actor.customerId)}`
        : `user:${String(actor.user?.id)}`

const enforceRateLimit = async (
  def: AIEndpointDefinition<any>,
  actor: Actor,
  req: PayloadRequest,
  services: CoreServices,
  settings: Settings,
  newVisitor = false,
): Promise<void> => {
  if (def.rateLimit === false) return
  const isStaff = actor.kind === 'staff'
  const rules: { limit: number; windowSec: number }[] = def.rateLimit
    ? [def.rateLimit]
    : def.access === 'anyone' && !isStaff
      ? [
          { limit: settings.limits.visitorPerMinute, windowSec: 60 },
          { limit: settings.limits.visitorPerDay, windowSec: 86_400 },
        ]
      : []
  if (!rules.length) return
  const ipHash = services.crypto.hashId(`ip:${clientIp(req)}`)
  const who = actorKey(actor, services)
  for (const r of rules) {
    const scope = `${def.module}:${r.windowSec}`
    const checks = [services.rateLimit.hit(`rl:${scope}:${who}`, r)]
    // IPs are shared (NAT, mobile carriers), so they get a wider allowance than a single visitor.
    if (!isStaff) checks.push(services.rateLimit.hit(`rl:${scope}:ip:${ipHash}`, { limit: r.limit * 5, windowSec: r.windowSec }))
    // A client that never keeps the visitor cookie gets a fresh identity per request, which would dodge the
    // per-visitor limit. New identities per IP are capped at the per-visitor rate (browsers mint one, once).
    if (newVisitor && actor.kind === 'visitor') checks.push(services.rateLimit.hit(`rl:${scope}:newvid:${ipHash}`, r))
    for (const res of await Promise.all(checks)) {
      if (!res.ok) throw new AIError('rate_limit', 'Too many requests, please slow down', { details: { retryAfterSec: res.resetSec } })
    }
  }
}

const readQuery = (req: PayloadRequest): Record<string, unknown> => {
  if (req.query && Object.keys(req.query).length) return { ...(req.query as Record<string, unknown>) }
  const out: Record<string, unknown> = {}
  const sp = req.searchParams ?? (req.url ? new URL(req.url, 'http://local').searchParams : undefined)
  sp?.forEach((v, k) => {
    const prev = out[k]
    out[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v]
  })
  return out
}

const readBody = async (req: PayloadRequest): Promise<{ raw?: string; body: unknown }> => {
  if (typeof req.text === 'function') {
    let raw: string
    try {
      raw = await req.text()
    } catch {
      return { body: req.data ?? {} }
    }
    if (!raw.trim()) return { raw, body: {} }
    const type = header(req, 'content-type') ?? ''
    if (type && !type.includes('json')) return { raw, body: {} }
    try {
      return { raw, body: JSON.parse(raw) }
    } catch {
      throw new AIError('validation', 'Request body must be valid JSON')
    }
  }
  if (typeof req.json === 'function') {
    try {
      return { body: await req.json() }
    } catch {
      return { body: req.data ?? {} }
    }
  }
  return { body: req.data ?? {} }
}

const validateInput = (def: AIEndpointDefinition<any>, value: unknown): unknown => {
  if (!def.input) return value
  const parsed = def.input.safeParse(value)
  if (!parsed.success) {
    throw new AIError('validation', 'Invalid request', {
      details: parsed.error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message, code: i.code })),
    })
  }
  return parsed.data
}

const turnstileWarned = new WeakSet<object>()

const enforceTurnstile = async (
  def: AIEndpointDefinition<any>,
  actor: Actor,
  req: PayloadRequest,
  input: unknown,
  services: CoreServices,
  options: AICoreOptions | undefined,
): Promise<string | undefined> => {
  if (!def.turnstile || actor.kind !== 'visitor' || !actor.visitorId) return undefined
  const cfg = options?.turnstile
  const secret = cfg ? process.env[cfg.secretKeyEnv] : undefined
  if (!cfg || !secret) {
    if (!turnstileWarned.has(req.payload)) {
      turnstileWarned.add(req.payload)
      req.payload.logger?.warn?.('[ai-suite] Turnstile is not configured (options.turnstile.secretKeyEnv); anonymous endpoints rely on rate limits only.')
    }
    return undefined
  }
  const pass = services.crypto.hashId(`turnstile:${actor.visitorId}`)
  if (def.turnstile === 'first' && cookiesOf(req)[TURNSTILE_COOKIE] === pass) return undefined
  const token =
    (input && typeof input === 'object' ? ((input as Record<string, unknown>).turnstileToken as string | undefined) : undefined) ??
    header(req, 'cf-turnstile-response') ??
    header(req, 'x-turnstile-token')
  if (!token) throw new AIError('turnstile_failed', 'Verification required', { details: { turnstile: true } })
  const form = new FormData()
  form.append('secret', secret)
  form.append('response', token)
  const ip = clientIp(req)
  if (ip !== 'unknown') form.append('remoteip', ip)
  let ok = false
  try {
    const res = await fetch(TURNSTILE_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(5000) })
    ok = Boolean(((await res.json()) as { success?: boolean }).success)
  } catch {
    ok = false
  }
  if (!ok) throw new AIError('turnstile_failed', 'Verification failed', { details: { turnstile: true } })
  return def.turnstile === 'first' ? cookieString(TURNSTILE_COOKIE, pass, req, 30 * 86400) : undefined
}

/* ---------------- responses ---------------- */

/**
 * Vendor error text can carry account URLs, key ids and request internals, so provider-originated errors
 * reach clients only as a generic message; the full error is logged under the request id.
 */
const PROVIDER_MESSAGE = 'The AI service is unavailable right now. Please try again shortly.'
const clientError = (err: AIError): { code: AIError['code']; message: string; details?: unknown } =>
  err.providerId ? { code: err.code, message: PROVIDER_MESSAGE } : { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) }

export const errorResponse = (e: unknown, requestId: string, req?: PayloadRequest): Response => {
  const err = isAIError(e) ? e : undefined
  if (!err) req?.payload?.logger?.error?.({ err: e, requestId, msg: '[ai-suite] unhandled endpoint error' })
  else if (err.providerId) req?.payload?.logger?.error?.({ err: e, requestId, msg: `[ai-suite] provider error (${err.code})` })
  const body: APIErrorBody = err ? { ...clientError(err), requestId } : { code: 'unknown', message: 'Something went wrong', requestId }
  const headers: Record<string, string> = { 'x-request-id': requestId }
  const retry = (err?.details as { retryAfterSec?: number } | undefined)?.retryAfterSec
  if (err?.code === 'rate_limit' && retry) headers['retry-after'] = String(retry)
  return Response.json(body, { status: err ? err.status : 500, headers })
}

const isAsyncIterable = (v: unknown): v is AsyncIterable<StreamWireEvent> =>
  v != null && typeof v === 'object' && typeof (v as Record<symbol, unknown>)[Symbol.asyncIterator] === 'function'

export const sseFrame = (e: StreamWireEvent): string => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`

/** Serialise wire events as Server-Sent Events with heartbeats; stops the producer when the client goes away. */
export const toSSEResponse = (
  events: AsyncIterable<StreamWireEvent>,
  o: { requestId: string; signal?: AbortSignal; headers?: Headers; heartbeatMs?: number; logger?: { error?: (o: unknown) => void } },
): Response => {
  const enc = new TextEncoder()
  const it = events[Symbol.asyncIterator]()
  let closed = false
  let timer: ReturnType<typeof setInterval> | undefined
  const stop = () => {
    if (closed) return
    closed = true
    if (timer) clearInterval(timer)
    void it.return?.()
  }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (s: string) => {
        if (closed) return
        try {
          controller.enqueue(enc.encode(s))
        } catch {
          stop()
        }
      }
      timer = setInterval(() => send(': ping\n\n'), o.heartbeatMs ?? HEARTBEAT_MS)
      o.signal?.addEventListener('abort', stop, { once: true })
      void (async () => {
        try {
          while (!closed) {
            const r = await it.next()
            if (r.done || closed) break
            send(sseFrame(r.value))
          }
        } catch (e) {
          const err = isAIError(e) ? e : undefined
          if (!err || err.providerId) o.logger?.error?.({ err: e, requestId: o.requestId, msg: '[ai-suite] stream error' })
          send(sseFrame({ type: 'error', code: err?.code ?? 'unknown', message: err ? clientError(err).message : 'Something went wrong', requestId: o.requestId }))
        } finally {
          const wasClosed = closed
          closed = true
          if (timer) clearInterval(timer)
          if (!wasClosed) {
            try {
              controller.close()
            } catch {
              /* already closed */
            }
          }
        }
      })()
    },
    cancel() {
      stop()
    },
  })
  const headers = new Headers(o.headers)
  headers.set('content-type', 'text/event-stream; charset=utf-8')
  headers.set('cache-control', 'no-cache, no-transform')
  headers.set('connection', 'keep-alive')
  headers.set('x-accel-buffering', 'no')
  headers.set('x-request-id', o.requestId)
  return new Response(stream, { status: 200, headers })
}

const withHeaders = (res: Response, extra: Headers): Response => {
  let mutable = res
  try {
    extra.forEach((v, k) => (k === 'set-cookie' ? res.headers.append(k, v) : res.headers.set(k, v)))
  } catch {
    // Immutable headers (e.g. Response.redirect): copy into a new response.
    const h = new Headers(res.headers)
    extra.forEach((v, k) => (k === 'set-cookie' ? h.append(k, v) : h.set(k, v)))
    mutable = new Response(res.body, { status: res.status, statusText: res.statusText, headers: h })
  }
  return mutable
}

/* ---------------- pipeline ---------------- */

/**
 * Convert an AI endpoint definition into a Payload endpoint whose handler runs the guard pipeline:
 * requestId -> identity -> tenant -> module enabled -> access -> rate limit -> budget -> input validation
 * -> Turnstile, then the handler. Errors become { code, message, details?, requestId }. Async iterables become SSE.
 * The raw request body is available to webhook handlers as `rawBody`.
 */
export const toPayloadEndpoint = (def: AIEndpointDefinition<any>): Endpoint => ({
  path: def.path,
  method: def.method,
  custom: { aiSuite: { module: def.module, access: def.access } },
  handler: async (req: PayloadRequest) => {
    const requestId = requestIdOf(req)
    const extra = new Headers({ 'x-request-id': requestId })
    try {
      if (!hasAI(req.payload)) throw new AIError('unavailable', 'AI is not available right now')
      const services = getAI(req.payload)
      const options = coreOptionsFromReq(req)

      const identity: ResolvedIdentity =
        def.access === 'webhook' ? { actor: { kind: 'channel', roles: [] } } : resolveIdentity(req, services, options)
      if (identity.setCookie) extra.append('set-cookie', identity.setCookie)
      const tenant = resolveTenant(req, options)
      const ctx = createAIContext(req, {
        module: def.module,
        surface: def.surface ?? (def.access === 'webhook' ? 'channel' : undefined),
        requestId,
        actor: identity.actor,
        tenant,
      })

      if (!def.alwaysOn && !ALWAYS_ON.has(def.module) && !(await services.isModuleEnabled(def.module, req.payload, tenant))) {
        throw new AIError('module_disabled', `The ${def.module} module is turned off`)
      }
      checkAccess(def.access, identity.actor)
      const settings = await services.settings(req.payload, tenant)
      if (def.access !== 'webhook') await enforceRateLimit(def, identity.actor, req, services, settings, Boolean(identity.setCookie))
      if (def.budget !== false) await services.budgets.assert({ payload: req.payload, tenant, module: def.module })

      let rawBody: string | undefined
      let value: unknown
      if (def.method === 'get' || def.method === 'delete') value = readQuery(req)
      else if (def.rawBody) value = {}
      else {
        const b = await readBody(req)
        rawBody = b.raw
        value = b.body
      }
      const params = req.routeParams && Object.keys(req.routeParams).length ? { ...req.routeParams } : undefined
      if (params && value && typeof value === 'object' && !Array.isArray(value)) value = { ...(value as object), params }
      const input = validateInput(def, value)

      const tsCookie = await enforceTurnstile(def, identity.actor, req, input, services, options)
      if (tsCookie) extra.append('set-cookie', tsCookie)

      const result = await def.handler({ ctx, services, input, req, rawBody })
      if (result instanceof Response) return withHeaders(result, extra)
      if (isAsyncIterable(result)) {
        return toSSEResponse(result, { requestId, signal: req.signal ?? undefined, headers: extra, logger: req.payload.logger })
      }
      extra.set('content-type', 'application/json')
      return new Response(JSON.stringify(result ?? { ok: true }), { status: 200, headers: extra })
    } catch (e) {
      return withHeaders(errorResponse(e, requestId, req), extra)
    }
  },
})
