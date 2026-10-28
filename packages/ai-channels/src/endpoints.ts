import type { PayloadRequest } from 'payload'
import type { AIEndpointDefinition } from '@payload-ai-suite/ai-core'
import { MODULE } from './constants'
import { ingestWebhook } from './inbound'
import { CHANNEL_NAMES, type AiChannelsOptions, type ChannelName } from './options'
import { createRuntime, type ChannelRuntime, type RuntimeOverrides } from './runtime'

export const WEBHOOK_PATH = '/ai/channels/:channel/webhook' as const

export const channelParam = (req: Pick<PayloadRequest, 'routeParams' | 'pathname'>): ChannelName | undefined => {
  const raw = req.routeParams?.channel ?? /\/ai\/channels\/([^/]+)\/webhook/.exec(req.pathname ?? '')?.[1]
  return CHANNEL_NAMES.includes(raw as ChannelName) ? (raw as ChannelName) : undefined
}

/** The exact request bytes; signatures are computed over these, so never JSON.parse first. */
export const readRawBody = async (req: Partial<Pick<Request, 'text' | 'arrayBuffer' | 'bodyUsed'>>): Promise<string> => {
  if (req.bodyUsed) throw new Error('[ai-channels] request body was already consumed before signature verification')
  if (typeof req.text === 'function') return req.text()
  if (typeof req.arrayBuffer === 'function') return Buffer.from(await req.arrayBuffer()).toString('utf8')
  return ''
}

const text = (body: string, status: number) => new Response(body, { status, headers: { 'content-type': 'text/plain' } })

export const createWebhookEndpoints = (
  options: AiChannelsOptions,
  overrides: RuntimeOverrides = {},
): AIEndpointDefinition<unknown>[] => {
  let cached: ChannelRuntime | undefined
  const runtime = (req: PayloadRequest) => {
    if (!cached || cached.payload !== req.payload) cached = createRuntime(req.payload, options, overrides)
    return cached
  }
  const common = {
    path: WEBHOOK_PATH,
    module: MODULE,
    access: 'webhook',
    surface: 'channel',
    // Budget is checked per message in the inbound job; providers must always get a fast 200.
    budget: false,
    rateLimit: false,
    rawBody: true,
  } as const

  return [
    {
      ...common,
      method: 'get',
      async handler({ req }) {
        const channel = channelParam(req)
        const driver = channel ? runtime(req).drivers.get(channel) : undefined
        if (!driver?.verifyChallenge) return text('Not found', 404)
        const query = req.searchParams ?? new URLSearchParams(Object.entries(req.query ?? {}).map(([k, v]) => [k, String(v)]))
        const challenge = driver.verifyChallenge(query)
        return challenge ? text(challenge, 200) : text('Forbidden', 403)
      },
    },
    {
      ...common,
      method: 'post',
      async handler(args) {
        const { req, ctx } = args
        const channel = channelParam(req)
        if (!channel) return text('Not found', 404)
        const given = (args as { rawBody?: string }).rawBody
        const rawBody = typeof given === 'string' ? given : await readRawBody(req)
        const result = await ingestWebhook(
          runtime(req),
          channel,
          { rawBody, headers: req.headers, query: req.searchParams ?? new URLSearchParams() },
          ctx?.tenant,
        )
        if (result.status !== 200) return Response.json({ code: result.status === 401 ? 'auth' : 'not_found', message: result.reason ?? 'rejected' }, { status: result.status })
        return Response.json({ ok: true, accepted: result.accepted, duplicates: result.duplicates })
      },
    },
  ]
}
