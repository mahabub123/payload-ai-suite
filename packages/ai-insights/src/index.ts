export { aiInsights, buildInsightsTasks, INSIGHTS_VIEW_PATH, INSIGHTS_NAV_PATH, INSIGHTS_PANEL_PATH } from './plugin'
export type { AiInsightsOptions, AnomalyMetric } from './options'
export { resolveInsightsOptions } from './options'
export { buildMetricTools, isInsightsActor, METRIC_TOOL_NAMES } from './metrics/tools'
export * from './metrics/math'
export {
  revenueMetric,
  topProductsMetric,
  repeatRateMetric,
  cartAbandonmentMetric,
  searchZeroResultsMetric,
  aiImpactMetric,
  type MetricCtx,
  type MetricOutput,
} from './metrics/compute'
export { askInsights, askEndpoint, askInputSchema, verifyAnswer, insightsPrompts, type AskInput, type MetricCall } from './ask'
export { checkNumbers, extractNumbers, collectEvidence, stripNumbers } from './numbers'
export { detectAnomaly, normalBand } from './anomaly'
export { runBriefing, briefingLines, BRIEFING_TASK } from './jobs/briefing'
export { runAnomalies, dailySeries, evaluateSeries, ANOMALY_TASK } from './jobs/anomalies'
export { periodSchema, resolvePeriod, previousPeriod, PRESETS, type PeriodInput, type ResolvedPeriod } from './period'
export { REPORTS as INSIGHT_REPORTS_SLUG } from './collections'
