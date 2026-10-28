import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { PayloadRequest } from 'payload'
import type { AIEndpointDefinition, StreamWireEvent } from '../contracts'
import { AIError } from '../contracts'
import { createFakePayload, createFakeServices } from '../testing'
import { setAI } from '../module/runtime'
import { toPayloadEndpoint, sseFrame, VISITOR_COOKIE, TURNSTILE_COOKIE } from './endpoint'

const make = (o: { settings?: Record<string, unknown>; budgetExceeded?: boolean; options?: Record<string, unknown> } = {}) => {
  const payload = createFakePayload({ custom: { aiSuite: { coreInstalled: true, modules: [], options: o.options ?? {} } } })
  const services = createFakeServices({ settings: o.settings as never, budgetExceeded: o.budgetExceeded })
  setAI(payload, services)
  const req = (r: { method?: string; body?: unknown; headers?: Record<string, string>; user?: unknown; query?: Record<string, unknown>; routeParams?: Record<string, unknown>; signal?: AbortSignal } = {}) =>
    ({
      payload,
      user: r.user ?? null,
      headers: new Headers(r.headers ?? {}),
      query: r.query ?? {},
      routeParams: r.routeParams,
      url: 'http://localhost/api/ai/x',
      protocol: 'http:',
      signal: r.signal,
      text: async () => (r.body === undefined ? '' : typeof r.body === 'string' ? r.body : JSON.stringify(r.body)),
    }) as unknown as PayloadRequest
  return { payload, services, req }
}

const def = (o: Partial<AIEndpointDefinition<any>> = {}): AIEndpointDefinition<any> => ({
  path: '/ai/test',
  method: 'post',
  module: 'assistant',
  access: 'anyone',
  handler: async ({ input }) => ({ echo: input }),
  ...o,
})

const call = async (d: AIEndpointDefinition<any>, req: PayloadRequest) => {
  const res = await toPayloadEndpoint(d).handler(req)
  return { res, body: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text() }
}

const staffUser = { id: 1, collection: 'users', roles: ['admin'] }

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.TS_SECRET
})

describe('guard pipeline', () => {
  it('returns 404 module_disabled with the error shape when the module is off', async () => {
    const { req } = make({ settings: { enabledModules: ['search'] } })
    const { res, body } = await call(def(), req())
    expect(res.status).toBe(404)
    expect(body).toMatchObject({ code: 'module_disabled', requestId: expect.any(String) })
    expect(res.headers.get('x-request-id')).toBe(body.requestId)
  })

  it('serves alwaysOn endpoints when their module is switched off', async () => {
    const { req } = make({ settings: { enabledModules: [] } })
    expect((await call(def(), req({ body: {} }))).res.status).toBe(404)
    expect((await call(def({ alwaysOn: true }), req({ body: {} }))).res.status).toBe(200)
  })

  it('treats core endpoints as always on', async () => {
    const { req } = make({ settings: { enabledModules: [] } })
    expect((await call(def({ module: 'core' }), req({ body: {} }))).res.status).toBe(200)
  })

  it('enforces access', async () => {
    const { req } = make()
    expect((await call(def({ access: 'staff' }), req())).body).toMatchObject({ code: 'auth' })
    const customer = { id: 5, collection: 'customers', roles: ['customer'] }
    expect((await call(def({ access: 'staff' }), req({ user: customer }))).res.status).toBe(403)
    expect((await call(def({ access: ['marketing-approver'] }), req({ user: { id: 2, collection: 'users', roles: ['editor'] } }))).res.status).toBe(403)
    expect((await call(def({ access: 'staff' }), req({ user: staffUser, body: {} }))).res.status).toBe(200)
    expect((await call(def({ access: 'customer' }), req({ user: customer, body: {} }))).res.status).toBe(200)
  })

  it('resolves staff by role when staff and customers share one collection', async () => {
    const { req } = make({ options: { userCollections: { staff: 'users', customers: 'users' } } })
    const admin = { id: 1, collection: 'users', roles: ['admin'] }
    const shopper = { id: 7, collection: 'users', roles: ['customer'] }
    expect((await call(def({ access: 'staff' }), req({ user: admin, body: {} }))).res.status).toBe(200)
    expect((await call(def({ access: 'staff' }), req({ user: shopper, body: {} }))).res.status).toBe(403)
    expect((await call(def({ access: 'customer' }), req({ user: shopper, body: {} }))).res.status).toBe(200)
    const separate = make({ options: { userCollections: { staff: 'admins', customers: 'users' } } })
    expect((await call(def({ access: 'staff' }), separate.req({ user: admin, body: {} }))).res.status).toBe(403)
  })

  it('blocks on budget unless budget:false', async () => {
    const { req } = make({ budgetExceeded: true })
    const { res, body } = await call(def(), req())
    expect(res.status).toBe(402)
    expect(body.code).toBe('budget_exceeded')
    expect((await call(def({ budget: false }), req({ body: {} }))).res.status).toBe(200)
  })

  it('rate limits', async () => {
    const { services, req } = make()
    services.rateLimit.hit = async () => ({ ok: false, remaining: 0, resetSec: 30 })
    const { res, body } = await call(def(), req())
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('30')
    expect(body.code).toBe('rate_limit')
  })

  it('validates JSON body and merges route params', async () => {
    const { req } = make()
    const d = def({ input: z.object({ message: z.string().min(1), params: z.object({ id: z.string() }) }) })
    const bad = await call(d, req({ body: { message: '' }, routeParams: { id: '9' } }))
    expect(bad.res.status).toBe(400)
    expect(bad.body).toEqual({ code: 'validation', message: 'Invalid request', details: [expect.objectContaining({ path: 'message' })], requestId: expect.any(String) })
    const ok = await call(d, req({ body: { message: 'hi' }, routeParams: { id: '9' } }))
    expect(ok.body).toEqual({ echo: { message: 'hi', params: { id: '9' } } })
    expect((await call(d, req({ body: '{not json' }))).body.code).toBe('validation')
  })

  it('validates the query string for GET', async () => {
    const { req } = make()
    const d = def({ method: 'get', input: z.object({ q: z.string() }) })
    expect((await call(d, req({ query: { q: 'shoes' } }))).body).toEqual({ echo: { q: 'shoes' } })
  })

  it('sets a visitor cookie for new visitors and reuses an existing one', async () => {
    const { req, services } = make()
    let seen: string | undefined
    const d = def({ handler: async ({ ctx }) => ((seen = ctx.actor.visitorId), {}) })
    const first = await call(d, req({ body: {} }))
    expect(first.res.headers.get('set-cookie')).toMatch(new RegExp(`^${VISITOR_COOKIE}=`))
    const vid = 'abcdefabcdefabcdef12'
    const second = await call(d, req({ body: {}, headers: { cookie: `${VISITOR_COOKIE}=${vid}` } }))
    expect(second.res.headers.get('set-cookie')).toBeNull()
    expect(seen).toBe(services.crypto.hashId(`vid:${vid}`))
  })

  it('maps unknown errors to 500 without leaking internals', async () => {
    const { req } = make()
    const { res, body } = await call(def({ handler: async () => Promise.reject(new Error('password=hunter2')) }), req())
    expect(res.status).toBe(500)
    expect(JSON.stringify(body)).not.toContain('hunter2')
    expect(body.code).toBe('unknown')
  })

  it('never forwards vendor error text to clients', async () => {
    const { req } = make()
    const vendor = new AIError('unavailable', '[openrouter] requires more credits, visit https://openrouter.ai/workspaces/default/keys/abc123', { providerId: 'openrouter', details: { status: 402 } })
    const { res, body } = await call(def({ handler: async () => Promise.reject(vendor) }), req())
    expect(res.status).toBe(503)
    expect(body).toEqual({ code: 'unavailable', message: expect.any(String), requestId: expect.any(String) })
    expect(JSON.stringify(body)).not.toMatch(/openrouter|abc123|credits/)
    const stream = def({
      handler: async () =>
        (async function* (): AsyncGenerator<StreamWireEvent> {
          yield { type: 'text', delta: 'a' }
          throw vendor
        })(),
    })
    const text = await (await toPayloadEndpoint(stream).handler(req({ body: {} }))).text()
    expect(text).toContain('event: error')
    expect(text).not.toMatch(/abc123|credits/)
  })

  it('maps AIError details and status', async () => {
    const { req } = make()
    const { res, body } = await call(def({ handler: async () => Promise.reject(new AIError('not_found', 'No such order', { details: { id: 1 } })) }), req())
    expect(res.status).toBe(404)
    expect(body).toMatchObject({ code: 'not_found', message: 'No such order', details: { id: 1 } })
  })

  it('streams async iterables as SSE frames', async () => {
    const { req } = make()
    const d = def({
      handler: async () =>
        (async function* (): AsyncGenerator<StreamWireEvent> {
          yield { type: 'meta', requestId: 'r1' }
          yield { type: 'text', delta: 'Hel' }
          yield { type: 'text', delta: 'lo' }
          yield { type: 'done' }
        })(),
    })
    const res = await toPayloadEndpoint(d).handler(req({ body: {} }))
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const text = await res.text()
    expect(text).toBe(
      [sseFrame({ type: 'meta', requestId: 'r1' }), sseFrame({ type: 'text', delta: 'Hel' }), sseFrame({ type: 'text', delta: 'lo' }), sseFrame({ type: 'done' })].join(''),
    )
    expect(text.startsWith('event: meta\ndata: {"type":"meta","requestId":"r1"}\n\n')).toBe(true)
  })

  it('sends an error frame when the stream throws, and stops on client abort', async () => {
    const { req } = make()
    const failing = def({
      handler: async () =>
        (async function* (): AsyncGenerator<StreamWireEvent> {
          yield { type: 'text', delta: 'a' }
          throw new AIError('overloaded', 'Busy')
        })(),
    })
    const text = await (await toPayloadEndpoint(failing).handler(req({ body: {} }))).text()
    expect(text).toContain('event: error\ndata: {"type":"error","code":"overloaded","message":"Busy"')

    let finalized = false
    const ac = new AbortController()
    const endless = def({
      handler: async () =>
        (async function* (): AsyncGenerator<StreamWireEvent> {
          try {
            for (;;) {
              yield { type: 'text', delta: '.' }
              await new Promise((r) => setTimeout(r, 5))
            }
          } finally {
            finalized = true
          }
        })(),
    })
    const res = await toPayloadEndpoint(endless).handler(req({ body: {}, signal: ac.signal }))
    const reader = res.body!.getReader()
    await reader.read()
    ac.abort()
    await new Promise((r) => setTimeout(r, 30))
    expect(finalized).toBe(true)
  })

  it('requires Turnstile for a visitor first message and remembers success', async () => {
    process.env.TS_SECRET = 'secret'
    const { req, services } = make({ options: { turnstile: { secretKeyEnv: 'TS_SECRET' } } })
    const d = def({ turnstile: 'first' })
    const missing = await call(d, req({ body: {}, headers: { cookie: `${VISITOR_COOKIE}=abcdefabcdefabcdef12` } }))
    expect(missing.res.status).toBe(403)
    expect(missing.body.code).toBe('turnstile_failed')

    const fetchMock = vi.fn(async () => Response.json({ success: true }))
    vi.stubGlobal('fetch', fetchMock)
    const ok = await call(d, req({ body: { turnstileToken: 'tok' }, headers: { cookie: `${VISITOR_COOKIE}=abcdefabcdefabcdef12` } }))
    expect(ok.res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
    const cookie = ok.res.headers.get('set-cookie')!
    expect(cookie).toContain(`${TURNSTILE_COOKIE}=`)

    const pass = services.crypto.hashId(`turnstile:${services.crypto.hashId('vid:abcdefabcdefabcdef12')}`)
    const again = await call(d, req({ body: {}, headers: { cookie: `${VISITOR_COOKIE}=abcdefabcdefabcdef12; ${TURNSTILE_COOKIE}=${encodeURIComponent(pass)}` } }))
    expect(again.res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()

    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: false })))
    expect((await call(d, req({ body: { turnstileToken: 'bad' } }))).body.code).toBe('turnstile_failed')
  })

  it('confirm endpoint requires an Idempotency-Key header', async () => {
    const { req } = make()
    const { actionEndpoints } = await import('../actions')
    const { res, body } = await call(actionEndpoints[0], req({ body: {}, routeParams: { id: 'x' } }))
    expect(res.status).toBe(400)
    expect(body.message).toMatch(/Idempotency-Key/)
  })
})
