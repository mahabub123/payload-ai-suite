import type { Plugin } from 'payload'
import { createAIModulePlugin, type AIModuleDefinition } from '@payload-ai-suite/ai-core'
import { MODULE } from './constants'
import { describeTask } from './describe'
import { extendMediaConfig } from './extendConfig'
import { buildEndpoints } from './ops'
import { DEFAULT_PROMPTS } from './prompts'
import type { AiMediaOptions } from './types'

export type { AiMediaOptions, ImageSource } from './types'
export type { OpInput } from './ops'
export { DESCRIBE_TASK, MEDIA_OPS, SKIP_CONTEXT_KEY, type MediaOp } from './constants'
export { describeMedia, type DescribeInput } from './describe'
export { DEFAULT_PROMPTS } from './prompts'

/** Module definition (exposed for the suite installer and tests). */
export const mediaModule = (options: AiMediaOptions = {}): AIModuleDefinition => {
  const allowed = new Set<string>()
  return {
    slug: MODULE,
    prompts: DEFAULT_PROMPTS,
    endpoints: buildEndpoints(options, allowed),
    tasks: [describeTask(options)],
    extendConfig: (config) => extendMediaConfig(config, options, allowed),
  }
}

/** Media AI (design §10.7): alt text & tags on upload, background removal, variations, lifestyle, image-to-listing. */
export const aiMedia = (options: AiMediaOptions = {}): Plugin => createAIModulePlugin(mediaModule(options))
