# @payload-ai-suite/ai-insights

Ask-your-data, scheduled briefings and anomaly alerts for Payload CMS v3 (design doc §10.6). The model **never writes SQL**: it can only call typed, read-only metric tools whose numbers are computed in code and are tenant-scoped. Every number in an answer is checked against the tool outputs.

## Install

```ts
import { aiCore } from '@payload-ai-suite/ai-core'
import { aiInsights } from '@payload-ai-suite/ai-insights'

plugins: [
  aiCore({ /* providers, routes, adapters … */ }),
  aiInsights({
    briefings: { daily: '0 0 7 * * *', weekly: '0 0 7 * * 1', emailTo: ['owner@shop.com'] },
    anomalies: { metrics: ['revenue', 'orders', 'aov', 'conversion'], sensitivity: 3 },
  }),
]
```

Or through `aiSuite({ modules: { insights: { … } } })`.

### `AiInsightsOptions`

| option | default | |
|---|---|---|
| `briefings.daily` | `'0 0 7 * * *'` | Cron for the daily briefing (yesterday vs the day before). `false` disables it. |
| `briefings.weekly` | `'0 0 7 * * 1'` | Cron for the weekly briefing (last 7 days vs the 7 before). `false` disables it. |
| `briefings.emailTo` | `[]` | Recipients, sent with `payload.sendEmail`. |
| `anomalies.metrics` | `['revenue','orders','aov']` | Any of `revenue`, `orders`, `aov`, `conversion`, `zeroResultSearches`, `aiCost`. |
| `anomalies.sensitivity` | `3` | Band width k. |
| `anomalies.cron` | `'0 0 6 * * *'` | |
| `anomalies.emailTo` | `briefings.emailTo` | |
| `adminUI` | `true` | Adds the admin view, nav link and dashboard panel. |
| `excludedOrderStatuses` | cancelled, refunded, failed, void | Statuses left out of revenue. |

Crons use Payload's job scheduler (6 fields, seconds first). Scheduled jobs only run when your app enables `jobs.autoRun` or runs the jobs worker.

## Metric tools

All tools are tier `read` and **available only to staff with the `manager` or `store-admin` role** (super-admin always passes). They return compact numbers (money in integer minor units plus a formatted string) and a `chart` card.

| tool | input | needs |
|---|---|---|
| `revenue` | `period`, `groupBy: day\|week\|month\|category\|offering` | order concept |
| `topProducts` | `period`, `limit`, `by: revenue\|units` | order |
| `repeatRate` | `period` | order |
| `cartAbandonment` | `period` | cart |
| `searchZeroResults` | `period` | `ai-search-events` (otherwise returns `unavailable`) |
| `aiImpact` | `period` | `ai-usage`, `ai-conversations`, `ai-generations` (each section only if it exists) |

`period` is a preset (`today`, `yesterday`, `last7d`, `last28d`, `last30d`, `last90d`, `thisWeek`, `lastWeek`, `thisMonth`, `lastMonth`, `thisYear`, `lastYear`) or `{ from, to }`. All dates are UTC. Ranges are half-open, and a date-only `to` is inclusive.

Definitions:
- **Revenue.** Order totals per currency. `changePct` compares against the previous period of equal length. The category and offering groupings use line items (unit price × qty), and each line counts toward its offering's first category.
- **Repeat rate.** Of the identified customers who ordered in the period (customer id, or email when there is no id), the share with at least 2 orders up to the end of the period.
- **Cart abandonment.** Abandoned carts ÷ (abandoned carts + orders) in the period. A cart counts as abandoned once it has been idle for 1 hour.

Data access: business data comes from the concept adapters' `iterate`/`listAbandoned` using the caller's `adapterCtx`, which carries access and tenant. Suite collections are read with the Local API (read-only, `depth: 0`) and filtered on the tenant field.

## API

`POST /api/ai/insights/ask` (manager; SSE) takes `{ question, period? }` and streams `meta`, `tool`, `text` and `card` (chart) events, then `done { messageId: reportId, outcome }`.

How a request is handled:
1. The agent runs (task `reason`) with only the metric tools available.
2. **Number check.** The answer goes through `guardrails.checkOutput` and the package's own numeric matcher. The matcher accepts thousands grouping, decimals, k/M/lakh/crore, %, Bangla digits, minor↔major units and rounding to the precision shown. Numbers may come from the tool outputs, the tool inputs or the question.
3. If a number doesn't match, the answer is regenerated once and streamed as a `Correction` (`outcome: 'corrected'`). Numbers still unsupported after that are replaced by `[unverified]` (`outcome: 'stripped'`).
4. The result is saved to `ai-insight-reports` with the question, metric calls (inputs and outputs), answer, charts, period, kind and `createdBy`.

## Jobs

- `ai-insights-briefing` (input `{ kind: 'daily'|'weekly' }`) computes the key metrics vs the previous period. The summary text is written by code, not the model. The job saves a `briefing` report and emails it.
- `ai-insights-anomalies` (daily) builds daily series for the configured metrics over the trailing 28 days plus yesterday. Yesterday is flagged when it falls outside median ± k·1.4826·MAD; when MAD is 0 the job uses mean ± k·sd instead. A minimum spread stops near-flat series from alerting. Flagged days get an `anomaly` report (with band charts) and an email.

Both jobs are idempotent: one report per period and tenant (`dedupeKey`), and an email is sent once (`emailedAt`). When the Multi-Tenant plugin is configured, they run once per tenant with a tenant-scoped system context.

## Admin UI

Exported from `@payload-ai-suite/ai-insights/client`:
- `InsightsView`: the "Ask your data" view at `/admin/ai-insights`. It has a question box, a period picker, the streaming answer, SVG charts and recent reports.
- `InsightsNavLink`: added to `afterNavLinks`.
- `InsightsDashboardPanel`: added to `afterDashboard`. It shows the latest briefing and anomalies, and only appears for users who can read reports.
- `Chart`: a dependency-free SVG line/bar/pie/table chart for `chart` cards.

Existing admin components and views are kept.

## Access

`ai-insight-reports` can be read by managers, store admins and super admins. Only the system creates reports. Updates and deletes are limited to admins.
