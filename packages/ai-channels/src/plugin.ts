import type { Plugin } from 'payload'
import { createAIModulePlugin } from '@payload-ai-suite/ai-core'
import { identitiesCollection, messagesCollection } from './collections'
import { MODULE } from './constants'
import { createWebhookEndpoints } from './endpoints'
import type { AiChannelsOptions } from './options'
import { createTasks } from './tasks'

/**
 * WhatsApp, Messenger and email channels for the shopping assistant (design doc §9 Channels).
 * Install after aiCore() and aiAssistant().
 */
export const aiChannels = (options: AiChannelsOptions): Plugin => {
  if (options.disabled) return (config) => config
  return createAIModulePlugin({
    slug: MODULE,
    collections: [identitiesCollection, messagesCollection],
    endpoints: createWebhookEndpoints(options),
    tasks: createTasks(options),
  })
}
