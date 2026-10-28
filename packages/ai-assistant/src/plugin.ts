import { createAIModulePlugin } from '@payload-ai-suite/ai-core'
import type { AIModuleDefinition } from '@payload-ai-suite/ai-core'
import type { Plugin } from 'payload'
import { assistantEndpoints } from './endpoints'
import { resolveOptions, setAssistantOptions } from './options'
import type { AiAssistantOptions } from './options'
import { OUTCOMES_TASK, outcomesTask } from './outcomes'
import { assistantPrompts } from './prompts'
import { MODULE } from './state'
import { assistantTools, searchOfferingsFallback } from './tools'
import { verificationsCollection } from './verification'

/** The module definition (exported for tests and for ai-suite composition). */
export const buildAssistantModule = (options: AiAssistantOptions = {}): AIModuleDefinition => {
  const resolved = resolveOptions(options)
  return {
    slug: MODULE,
    collections: [verificationsCollection],
    tools: assistantTools(resolved),
    prompts: assistantPrompts,
    endpoints: assistantEndpoints(),
    tasks: [outcomesTask],
    schedules: [{ task: OUTCOMES_TASK, cron: '*/30 * * * *' }],
    onInit: (payload, services) => {
      setAssistantOptions(payload, resolved)
      // ai-search registers the hybrid searchOfferings first; fall back to the adapter search otherwise.
      if (resolved.tools.includes('catalog') && !services.tools.get('searchOfferings')) services.tools.register(searchOfferingsFallback, MODULE)
    },
  }
}

/** Sales & support assistant: chat endpoint (SSE), shopper tools, guest order verification, hand-off. */
export const aiAssistant = (options: AiAssistantOptions = {}): Plugin => createAIModulePlugin(buildAssistantModule(options))
