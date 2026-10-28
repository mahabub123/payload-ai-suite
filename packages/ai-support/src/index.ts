import type { Plugin } from 'payload'
import { createAIModulePlugin } from '@payload-ai-suite/ai-core'
import type { AIModuleDefinition } from '@payload-ai-suite/ai-core'
import { resolveOptions, type AiSupportOptions } from './options'
import { reviewFlagsCollection, reviewInsightsCollection } from './collections'
import { extendSupportConfig } from './extend'
import { supportPrompts } from './prompts'
import { MODULE, TASKS } from './util'
import { triageTask } from './tickets/triage'
import { replyEndpoint, suggestEndpoint } from './tickets/endpoints'
import { moderateTask, releaseFlagEndpoint } from './reviews/moderate'
import { reviewInsightsTask } from './reviews/insights'

export type { AiSupportOptions } from './options'
export { DEFAULT_TOPICS, DEFAULT_AUTO_ANSWER_TOPICS } from './options'
export { onSupportReply, type SupportReplyEvent, type SupportReplyListener } from './tickets/reply'

/** Build the support module definition (exposed for aiSuite and tests). */
export const supportModule = (opts: AiSupportOptions = {}): AIModuleDefinition => {
  const o = resolveOptions(opts)
  return {
    slug: MODULE,
    collections: [reviewInsightsCollection, reviewFlagsCollection],
    prompts: supportPrompts,
    endpoints: [suggestEndpoint, replyEndpoint, releaseFlagEndpoint],
    tasks: [triageTask(o), moderateTask, reviewInsightsTask],
    schedules: [{ task: TASKS.reviewInsights, cron: '0 6 * * 1' }],
    extendConfig: extendSupportConfig(o),
  }
}

/** Support inbox: ticket triage, grounded suggested replies, guarded auto-answers, review insights and moderation. */
export const aiSupport = (options: AiSupportOptions = {}): Plugin => createAIModulePlugin(supportModule(options))
