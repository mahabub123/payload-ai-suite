import { describe, expect, it } from 'vitest'
import type { Config } from 'payload'
import { SUITE_KEY } from 'payload-ai-core'
import { aiChannels } from './plugin'
import { IDENTITIES, MESSAGES, TASK_INBOUND, TASK_SEND } from './constants'

const base = (): Config =>
  ({
    collections: [{ slug: 'posts', fields: [] }],
    endpoints: [{ path: '/x', method: 'get', handler: async () => new Response() }],
    jobs: { tasks: [] },
    custom: { [SUITE_KEY]: { coreInstalled: true, modules: [], options: {} } },
  }) as unknown as Config

describe('aiChannels plugin', () => {
  it('adds only its own collections, webhook endpoints and jobs', async () => {
    const out = await aiChannels({ whatsapp: { phoneNumberIdEnv: 'A', accessTokenEnv: 'B', appSecretEnv: 'C', verifyTokenEnv: 'D' } })(base())
    expect(out.collections!.map((c) => c.slug)).toEqual(['posts', IDENTITIES, MESSAGES])
    expect(out.endpoints!.map((e) => `${e.method} ${e.path}`)).toEqual(['get /x', 'get /ai/channels/:channel/webhook', 'post /ai/channels/:channel/webhook'])
    expect(out.jobs!.tasks!.map((t) => t.slug)).toEqual([TASK_INBOUND, TASK_SEND])
    const messages = out.collections!.find((c) => c.slug === MESSAGES)!
    expect(messages.indexes).toEqual([{ fields: ['channel', 'externalMessageId'], unique: true }])
  })

  it('adds nothing when disabled and requires the core', async () => {
    const cfg = base()
    expect(await aiChannels({ disabled: true })(cfg)).toBe(cfg)
    expect(() => aiChannels({})({ collections: [] } as unknown as Config)).toThrow(/aiCore/)
  })
})
