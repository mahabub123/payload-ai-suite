export interface AiInsightsOptions {
  briefings?: {
    /** Cron for the daily briefing (Payload cron, 5 or 6 fields). Omit to disable. Default '0 0 7 * * *'. */
    daily?: string | false
    /** Cron for the weekly briefing. Omit to disable. Default '0 0 7 * * 1' (Mondays). */
    weekly?: string | false
    /** Recipients of briefing (and, unless overridden, anomaly) emails. */
    emailTo?: string[]
  }
  anomalies?: {
    /** Metric series to watch. Default ['revenue', 'orders', 'aov']. */
    metrics: AnomalyMetric[] | string[]
    /** Band width k (z-score / robust z-score). Default 3. */
    sensitivity?: number
    /** Cron for the anomaly job. Default daily at 06:00 ('0 0 6 * * *'). */
    cron?: string | false
    /** Recipients of anomaly alerts. Defaults to briefings.emailTo. */
    emailTo?: string[]
  }
  /** Register the "Ask your data" admin view, nav link and dashboard panel. Default true. */
  adminUI?: boolean
  /** Order statuses excluded from revenue. Default cancelled/refunded/failed/void. */
  excludedOrderStatuses?: string[]
}

export type AnomalyMetric = 'revenue' | 'orders' | 'aov' | 'conversion' | 'zeroResultSearches' | 'aiCost'

export interface ResolvedInsightsOptions {
  daily: string | false
  weekly: string | false
  emailTo: string[]
  anomalyMetrics: AnomalyMetric[]
  sensitivity: number
  anomalyCron: string | false
  anomalyEmailTo: string[]
  adminUI: boolean
  excludedStatuses: Set<string>
}

const KNOWN: AnomalyMetric[] = ['revenue', 'orders', 'aov', 'conversion', 'zeroResultSearches', 'aiCost']

export const DEFAULT_EXCLUDED_STATUSES = ['cancelled', 'canceled', 'refunded', 'failed', 'void', 'voided']

export const resolveInsightsOptions = (o: AiInsightsOptions = {}): ResolvedInsightsOptions => {
  const metrics = (o.anomalies?.metrics ?? ['revenue', 'orders', 'aov']) as string[]
  const unknown = metrics.filter((m) => !KNOWN.includes(m as AnomalyMetric))
  if (unknown.length) throw new Error(`[ai-insights] Unknown anomaly metrics: ${unknown.join(', ')}. Known: ${KNOWN.join(', ')}`)
  const emailTo = o.briefings?.emailTo ?? []
  return {
    daily: o.briefings?.daily === undefined ? '0 0 7 * * *' : o.briefings.daily,
    weekly: o.briefings?.weekly === undefined ? '0 0 7 * * 1' : o.briefings.weekly,
    emailTo,
    anomalyMetrics: metrics as AnomalyMetric[],
    sensitivity: o.anomalies?.sensitivity ?? 3,
    anomalyCron: o.anomalies?.cron === undefined ? '0 0 6 * * *' : o.anomalies.cron,
    anomalyEmailTo: o.anomalies?.emailTo ?? emailTo,
    adminUI: o.adminUI ?? true,
    excludedStatuses: new Set((o.excludedOrderStatuses ?? DEFAULT_EXCLUDED_STATUSES).map((s) => s.toLowerCase())),
  }
}
