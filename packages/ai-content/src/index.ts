import type { Plugin } from 'payload'
import { createAIModulePlugin, type AIModuleDefinition } from '@payload-ai-suite/ai-core'
import { bulkTask } from './bulk'
import { bulkRunsCollection, generationsCollection } from './collections'
import { MODULE } from './constants'
import { buildEndpoints } from './endpoints'
import { extendContentConfig } from './extendConfig'
import { DEFAULT_PROMPTS } from './prompts'
import type { AiContentOptions } from './types'

export type {
  AiContentOptions,
  ContentAction,
  ExtractedDraft,
  GenerateRequestBody,
  GenerateResponse,
  TargetFieldInfo,
  TargetFieldType,
} from './types'
export { CONTENT_ACTIONS } from './types'
export type { BulkActionProps, FieldButtonProps, PanelProps } from './extendConfig'
export type { BulkRequest, ReviewRequest } from './bulk'
export { ACTIONS, DEFAULT_PROMPTS, SEO_LIMITS, languageName, localeNote } from './prompts'
export { markdownToLexical } from './lexical'
export { validateCategories, enforceSeo, clampText } from './validate'
export { BULK_RUNS, BULK_TASK, GENERATIONS } from './constants'

/** Module definition (exposed for the suite installer and tests). */
export const contentModule = (options: AiContentOptions = {}): AIModuleDefinition => {
  const allowed = new Set<string>()
  return {
    slug: MODULE,
    requires: ['offering'],
    collections: [generationsCollection, bulkRunsCollection],
    prompts: DEFAULT_PROMPTS,
    endpoints: buildEndpoints(options, allowed),
    tasks: [bulkTask(options)],
    extendConfig: (config) => extendContentConfig(config, options, allowed),
  }
}

/** Catalog & Content Studio (design §10.3). Install after aiCore(). */
export const aiContent = (options: AiContentOptions = {}): Plugin => createAIModulePlugin(contentModule(options))
