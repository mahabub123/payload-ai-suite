import type { Config, Plugin, TaskConfig } from 'payload'
import { createAIModulePlugin, getAI } from 'payload-ai-core'
import { automationsCollection, changesetsCollection, runsCollection } from './collections'
import { buildEndpoints } from './endpoints'
import { attachAutomationHooks } from './automations/hooks'
import { dispatchScheduled } from './automations/dispatch'
import { DISPATCH_TASK, executeRun, RUN_TASK } from './automations/runner'
import { resolveOptions, type AiCopilotOptions, type ResolvedCopilotOptions } from './options'
import { buildCopilotTools } from './tools'

export const COPILOT_PROVIDER_PATH = 'payload-ai-copilot/client#CopilotProvider'

const buildTasks = (opts: ResolvedCopilotOptions): TaskConfig<any>[] => [
  {
    slug: RUN_TASK,
    label: 'AI copilot: run automation',
    retries: 2,
    inputSchema: [{ name: 'runId', type: 'text', required: true }],
    handler: async ({ input, req }: { input: { runId: string }; req: { payload: any } }) => {
      const run = await executeRun(req.payload, input.runId, { services: getAI(req.payload), defaultApprovalRole: opts.defaultApprovalRole })
      return { output: { status: run.status } }
    },
  } as TaskConfig<any>,
  {
    slug: DISPATCH_TASK,
    label: 'AI copilot: dispatch scheduled automations',
    retries: 1,
    // Payload's scheduler takes 6-field cron with leading seconds: every 5 minutes.
    schedule: [{ cron: '0 */5 * * * *', queue: 'default' }],
    handler: async ({ req }: { req: { payload: any } }) => {
      const r = await dispatchScheduled(req.payload, { tenantField: opts.tenantField, services: getAI(req.payload) })
      return { output: r }
    },
  } as TaskConfig<any>,
]

/** Admin copilot (staff chat, bulk-edit previews) and AI automations with approval steps. */
export const aiCopilot =
  (options: AiCopilotOptions = {}): Plugin =>
  (incoming: Config): Config => {
    const opts = resolveOptions(incoming, options)
    const tools = buildCopilotTools(opts)
    return createAIModulePlugin({
      slug: 'copilot',
      collections: opts.automations ? [changesetsCollection, automationsCollection, runsCollection] : [changesetsCollection],
      tools,
      endpoints: buildEndpoints(opts, tools),
      tasks: opts.automations ? buildTasks(opts) : [],
      extendConfig: (config) => {
        let next = config
        if (opts.automations) next = { ...next, collections: attachAutomationHooks(next.collections ?? [], opts.collections, opts.tenantField) }
        if (opts.adminPanel) {
          const providers = next.admin?.components?.providers ?? []
          next = {
            ...next,
            admin: {
              ...next.admin,
              components: {
                ...next.admin?.components,
                providers: providers.includes(COPILOT_PROVIDER_PATH) ? providers : [...providers, COPILOT_PROVIDER_PATH],
              },
            },
          }
        }
        return next
      },
    })(incoming) as Config // createAIModulePlugin is synchronous
  }
