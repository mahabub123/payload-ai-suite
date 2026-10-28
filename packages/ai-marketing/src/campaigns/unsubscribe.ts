import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { Payload, PayloadRequest } from 'payload'
import type { AIEndpointDefinition, Crypto } from '@payload-ai-suite/ai-core'
import { MODULE, SLUGS, escapeHtml, normEmail } from '../util'

interface TokenBody {
  /** Encrypted recipient email. */
  e: string
  c?: string
  t?: string | number
}

const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64url')
const unb64url = (s: string) => Buffer.from(s, 'base64url').toString('utf8')
const sign = (crypto: Crypto, body: string) => crypto.hashId(`unsubscribe:${body}`)

/** Signed (HMAC via services.crypto.hashId) unsubscribe token; the email inside is encrypted. */
export const createUnsubscribeToken = (
  crypto: Crypto,
  email: string,
  opts: { campaignId?: string; tenant?: string | number } = {},
): string => {
  const body = b64url(JSON.stringify({ e: crypto.encrypt(normEmail(email)), c: opts.campaignId, t: opts.tenant } satisfies TokenBody))
  return `${body}.${sign(crypto, body)}`
}

export const verifyUnsubscribeToken = (
  crypto: Crypto,
  token: string,
): { email: string; campaignId?: string; tenant?: string | number } | null => {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = Buffer.from(sign(crypto, body))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const parsed = JSON.parse(unb64url(body)) as TokenBody
    return { email: crypto.decrypt(parsed.e), campaignId: parsed.c, tenant: parsed.t }
  } catch {
    return null
  }
}

export const unsubscribeUrl = (base: string, token: string): string =>
  `${base}${base.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`

/** Set of hashed emails that unsubscribed (scoped to tenant when set). */
export const loadUnsubscribed = async (payload: Payload, tenant?: string | number): Promise<Set<string>> => {
  const out = new Set<string>()
  let page = 1
  for (;;) {
    const res = await payload.find({
      collection: SLUGS.unsubscribes as never,
      where: tenant !== undefined ? { tenant: { equals: tenant } } : {},
      limit: 1000,
      page,
      depth: 0,
      overrideAccess: true,
    })
    for (const d of res.docs as unknown as { emailHash?: string }[]) if (d.emailHash) out.add(d.emailHash)
    if (!res.hasNextPage) break
    page++
  }
  return out
}

export const recordUnsubscribe = async (
  payload: Payload,
  crypto: Crypto,
  data: { email: string; campaignId?: string; tenant?: string | number; source: 'link' | 'one-click' | 'manual' },
): Promise<void> => {
  const emailHash = crypto.hashId(normEmail(data.email))
  const existing = await payload.find({
    collection: SLUGS.unsubscribes as never,
    where: { emailHash: { equals: emailHash } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (existing.docs.length) return
  await payload.create({
    collection: SLUGS.unsubscribes as never,
    data: {
      emailHash,
      campaign: data.campaignId,
      source: data.source,
      ...(data.tenant !== undefined ? { tenant: data.tenant } : {}),
    } as never,
    overrideAccess: true,
  })
}

const page = (title: string, message: string, status = 200) =>
  new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title></head><body style="font-family:system-ui;max-width:480px;margin:4rem auto;padding:0 1rem"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )

const tokenFrom = (input: unknown, req: PayloadRequest): string | undefined =>
  (input as { token?: string } | undefined)?.token ?? req.searchParams?.get('token') ?? undefined

const handle =
  (source: 'link' | 'one-click'): AIEndpointDefinition<{ token?: string }>['handler'] =>
  async ({ input, req, services, ctx }) => {
    const token = tokenFrom(input, req)
    const parsed = token ? verifyUnsubscribeToken(services.crypto, token) : null
    if (!parsed) return page('Link not valid', 'This unsubscribe link is invalid or has been altered.', 400)
    await recordUnsubscribe(ctx.payload, services.crypto, { ...parsed, tenant: parsed.tenant ?? ctx.tenant, source })
    return source === 'one-click'
      ? Response.json({ ok: true })
      : page('You are unsubscribed', 'You will no longer receive marketing emails from us.')
  }

const tokenInput = z.object({ token: z.string().min(10).max(2000).optional() }).passthrough()

/** GET from the email footer link. */
export const unsubscribeGetEndpoint: AIEndpointDefinition<{ token?: string }> = {
  path: '/ai/marketing/unsubscribe',
  method: 'get',
  module: MODULE,
  // Unsubscribe must keep working for emails already sent, even if marketing is switched off.
  alwaysOn: true,
  access: 'anyone',
  surface: 'storefront',
  turnstile: false,
  budget: false,
  input: tokenInput,
  rateLimit: { limit: 30, windowSec: 60 },
  handler: handle('link'),
}

/** RFC 8058 one-click (List-Unsubscribe-Post); token is in the query string. */
export const unsubscribePostEndpoint: AIEndpointDefinition<{ token?: string }> = {
  ...unsubscribeGetEndpoint,
  method: 'post',
  input: undefined,
  handler: handle('one-click'),
}
