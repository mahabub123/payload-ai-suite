import type { TaskConfig } from 'payload'
import { TASK_INBOUND, TASK_SEND } from './constants'
import { processInbound } from './inbound'
import type { AiChannelsOptions } from './options'
import { processSend } from './outbound'
import { createRuntime, type RuntimeOverrides } from './runtime'

type IO = { input: { messageId: string }; output: { status: string } }

export const createTasks = (options: AiChannelsOptions, overrides: RuntimeOverrides = {}): TaskConfig<any>[] => {
  const inbound: TaskConfig<IO> = {
    slug: TASK_INBOUND,
    label: 'AI channels: process inbound message',
    inputSchema: [{ name: 'messageId', type: 'text', required: true }],
    outputSchema: [{ name: 'status', type: 'text' }],
    retries: { attempts: 3, backoff: { type: 'exponential', delay: 2_000 } },
    handler: async ({ input, req }) => {
      const r = await processInbound(createRuntime(req.payload, options, overrides), input.messageId)
      return { output: { status: r.status } }
    },
  }
  const send: TaskConfig<IO> = {
    slug: TASK_SEND,
    label: 'AI channels: send reply',
    inputSchema: [{ name: 'messageId', type: 'text', required: true }],
    outputSchema: [{ name: 'status', type: 'text' }],
    retries: { attempts: 6, backoff: { type: 'exponential', delay: 5_000 } },
    handler: async ({ input, req }) => {
      const r = await processSend(createRuntime(req.payload, options, overrides), input.messageId)
      return { output: { status: r.status } }
    },
  }
  return [inbound, send] as TaskConfig<any>[]
}
