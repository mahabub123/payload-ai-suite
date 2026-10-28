import type { Plugin } from 'payload'
import { createAIModulePlugin } from 'payload-ai-core'
import type { AIModuleDefinition } from 'payload-ai-core'
import { resolveOptions, type AiMarketingOptions } from './options'
import { marketingCollections } from './collections'
import { marketingPrompts } from './prompts'
import { MODULE, TASKS } from './util'
import { segmentPreviewEndpoint, segmentRefreshTask, segmentSaveEndpoint } from './segments/endpoints'
import { draftsEndpoint } from './campaigns/compose'
import { approveEndpoint, pauseEndpoint, requestApprovalEndpoint } from './campaigns/approve'
import { sendTask } from './campaigns/send'
import { sequencesTask } from './campaigns/sequences'
import { unsubscribeGetEndpoint, unsubscribePostEndpoint } from './campaigns/unsubscribe'
import { socialEndpoint } from './social'

export type { AiMarketingOptions, AiMarketingSequenceFlags } from './options'
export { segmentDefinition, segmentCondition, type SegmentDefinition, type SegmentCondition } from './segments/schema'
export { evaluateSegment } from './segments/evaluate'
export { createUnsubscribeToken, verifyUnsubscribeToken } from './campaigns/unsubscribe'
export { PLATFORM_LIMITS, composePost, type SocialPlatform } from './social'
export type { CampaignKind, CampaignStatus } from './campaigns/types'

/** Build the marketing module definition (exposed for aiSuite and tests). */
export const marketingModule = (opts: AiMarketingOptions = {}): AIModuleDefinition => {
  const o = resolveOptions(opts)
  return {
    slug: MODULE,
    requires: ['customer', 'order'],
    collections: marketingCollections(o),
    prompts: marketingPrompts,
    endpoints: [
      segmentPreviewEndpoint,
      segmentSaveEndpoint,
      draftsEndpoint,
      requestApprovalEndpoint,
      approveEndpoint(o),
      pauseEndpoint(o),
      unsubscribeGetEndpoint,
      unsubscribePostEndpoint,
      socialEndpoint,
    ],
    tasks: [sendTask(o), segmentRefreshTask, sequencesTask(o)],
    schedules: [
      { task: TASKS.sequences, cron: '0 * * * *' },
      { task: TASKS.segmentRefresh, cron: '30 3 * * *' },
    ],
  }
}

/** Marketing & email module: segments, AI-drafted campaigns and sequences, approval, idempotent sends. */
export const aiMarketing = (options: AiMarketingOptions = {}): Plugin => createAIModulePlugin(marketingModule(options))
