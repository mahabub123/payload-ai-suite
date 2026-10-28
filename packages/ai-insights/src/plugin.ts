import type { Config, Plugin, TaskConfig } from 'payload'

type ScheduleConfig = NonNullable<TaskConfig['schedule']>[number]
import { createAIModulePlugin, getAI } from '@payload-ai-suite/ai-core'
import { askEndpoint, insightsPrompts } from './ask'
import { reportsCollection } from './collections'
import { ANOMALY_TASK, runAnomalies } from './jobs/anomalies'
import { BRIEFING_TASK, runBriefing } from './jobs/briefing'
import { buildMetricTools } from './metrics/tools'
import { resolveInsightsOptions, type AiInsightsOptions, type ResolvedInsightsOptions } from './options'

export const INSIGHTS_VIEW_PATH = '@payload-ai-suite/ai-insights/client#InsightsView'
export const INSIGHTS_NAV_PATH = '@payload-ai-suite/ai-insights/client#InsightsNavLink'
export const INSIGHTS_PANEL_PATH = '@payload-ai-suite/ai-insights/client#InsightsDashboardPanel'

/** Each schedule passes its briefing kind as job input; runs are idempotent per period (dedupeKey). */
const briefingSchedule = (cron: string, kind: 'daily' | 'weekly'): ScheduleConfig => ({
  cron,
  queue: 'default',
  hooks: { beforeSchedule: async () => ({ shouldSchedule: true, input: { kind } }) },
})

export const buildInsightsTasks = (opts: ResolvedInsightsOptions): TaskConfig<any>[] => {
  const briefingSchedules = [
    ...(opts.daily ? [briefingSchedule(opts.daily, 'daily')] : []),
    ...(opts.weekly ? [briefingSchedule(opts.weekly, 'weekly')] : []),
  ]
  return [
    {
      slug: BRIEFING_TASK,
      label: 'AI insights: briefing',
      retries: 3,
      inputSchema: [{ name: 'kind', type: 'select', options: ['daily', 'weekly'], required: true }],
      ...(briefingSchedules.length ? { schedule: briefingSchedules } : {}),
      handler: async ({ input, req }: { input: { kind?: 'daily' | 'weekly' }; req: { payload: any } }) => {
        const r = await runBriefing(req.payload, getAI(req.payload), input?.kind === 'weekly' ? 'weekly' : 'daily', opts)
        return { output: { reports: r.length } }
      },
    } as TaskConfig<any>,
    {
      slug: ANOMALY_TASK,
      label: 'AI insights: anomaly alerts',
      retries: 3,
      ...(opts.anomalyCron ? { schedule: [{ cron: opts.anomalyCron, queue: 'default' }] } : {}),
      handler: async ({ req }: { req: { payload: any } }) => {
        const r = await runAnomalies(req.payload, getAI(req.payload), opts)
        return { output: { flagged: r.reduce((s, x) => s + x.flagged, 0) } }
      },
    } as TaskConfig<any>,
  ]
}

const withAdminUI = (config: Config): Config => {
  const components = config.admin?.components ?? {}
  const add = <T,>(list: T[] | undefined, item: T) => (list?.includes(item) ? list : [...(list ?? []), item])
  return {
    ...config,
    admin: {
      ...config.admin,
      components: {
        ...components,
        views: {
          ...components.views,
          aiInsights: { Component: INSIGHTS_VIEW_PATH, path: '/ai-insights', exact: true, meta: { title: 'Ask your data' } },
        },
        afterNavLinks: add(components.afterNavLinks as string[] | undefined, INSIGHTS_NAV_PATH),
        afterDashboard: add(components.afterDashboard as string[] | undefined, INSIGHTS_PANEL_PATH),
      },
    },
  }
}

/** AI Insights: ask-your-data over typed metric tools, scheduled briefings and anomaly alerts (§10.6). */
export const aiInsights =
  (options: AiInsightsOptions = {}): Plugin =>
  (incoming: Config): Config => {
    const opts = resolveInsightsOptions(options)
    const tools = buildMetricTools(opts)
    const staffCollection = incoming.admin?.user ?? 'users'
    return createAIModulePlugin({
      slug: 'insights',
      requires: ['order'],
      collections: [reportsCollection(staffCollection)],
      tools,
      prompts: insightsPrompts,
      endpoints: [askEndpoint(tools)],
      tasks: buildInsightsTasks(opts),
      extendConfig: opts.adminUI ? withAdminUI : undefined,
    })(incoming) as Config
  }
