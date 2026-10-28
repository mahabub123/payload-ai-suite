/**
 * Eval runner (design doc §13 quality loop, §14 testing).
 *
 *   pnpm evals                                   # mock mode: offline, deterministic (CI)
 *   pnpm evals --mode live --target http://localhost:3000 --route anthropic:claude-sonnet-5-5 --record out.json
 *   pnpm evals --mode replay --recording out.json --route anthropic:claude-sonnet-5-5
 *   pnpm evals --update-baseline                 # accept current metrics as the baseline for this route
 *
 * Options: --suites assistant,search,content  --baseline <file>  --report <file.json>  --concurrency N
 * Exit code 1 when a metric is below its threshold or regressed vs the baseline for the route.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { createHttpDriver } from './drivers/http'
import { createMockDriver } from './drivers/mock'
import { createReplayDriver, type Recording } from './drivers/replay'
import { judge, type BaselineFile } from './lib/baseline'
import { productBySlug } from './lib/fixtures'
import { mean, percentile, scoreAssistant, scoreContent, scoreSearch } from './lib/scoring'
import type { AssistantCase, CaseResult, ContentCase, Driver, SearchCase, SuiteReport } from './lib/types'

const here = path.dirname(fileURLToPath(import.meta.url))
const golden = async <T>(name: string): Promise<T[]> => JSON.parse(await readFile(path.join(here, 'golden', name), 'utf8')) as T[]

const pool = async <T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> => {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.max(1, n) }, async () => {
      while (i < items.length) {
        const idx = i++
        out[idx] = await fn(items[idx])
      }
    }),
  )
  return out
}

const passRate = (cs: CaseResult[]) => (cs.length ? cs.filter((c) => c.pass).length / cs.length : 1)
const latency = (cs: CaseResult[]) => percentile(cs.map((c) => c.latencyMs ?? 0), 95)

export interface RunOptions {
  driver: Driver
  suites: string[]
  concurrency: number
  record?: Recording
}

export const runSuites = async ({ driver, suites, concurrency, record }: RunOptions): Promise<SuiteReport[]> => {
  const reports: SuiteReport[] = []
  if (suites.includes('assistant')) {
    for (const [name, file] of [
      ['assistant.en', 'assistant.en.json'],
      ['assistant.bn', 'assistant.bn.json'],
      ['assistant.security', 'assistant.security.json'],
    ] as const) {
      const cases = await golden<AssistantCase>(file)
      const cs = await pool(cases, concurrency, async (c) => {
        const o = await driver.assistant(c)
        if (record) record.assistant[c.id] = o
        return scoreAssistant(c, o)
      })
      reports.push({ suite: name, cases: cs, metrics: { [`${name}.passRate`]: passRate(cs), [`${name}.score`]: mean(cs.map((c) => c.score)), [`${name}.latencyP95Ms`]: latency(cs) } })
    }
  }
  if (suites.includes('search')) {
    const all = await golden<SearchCase>('search.json')
    for (const locale of ['en', 'bn'] as const) {
      const cases = all.filter((c) => c.locale === locale)
      const cs = await pool(cases, concurrency, async (c) => {
        const o = await driver.search(c)
        if (record) record.search[c.id] = o
        return scoreSearch(c, o)
      })
      const name = `search.${locale}`
      reports.push({
        suite: name,
        cases: cs,
        metrics: {
          [`${name}.recallAt5`]: mean(cs.map((c) => c.recall)),
          [`${name}.mrr`]: mean(cs.map((c) => c.rr)),
          [`${name}.passRate`]: passRate(cs),
          [`${name}.latencyP95Ms`]: latency(cs),
        },
      })
    }
  }
  if (suites.includes('content')) {
    const all = await golden<ContentCase>('content.json')
    for (const locale of ['en', 'bn'] as const) {
      const cases = all.filter((c) => c.locale === locale)
      const cs = await pool(cases, concurrency, async (c) => {
        const o = await driver.content(c)
        if (record) record.content[c.id] = o
        return scoreContent(c, o, productBySlug(c.product)?.price)
      })
      const name = `content.${locale}`
      reports.push({ suite: name, cases: cs, metrics: { [`${name}.passRate`]: passRate(cs), [`${name}.score`]: mean(cs.map((c) => c.score)), [`${name}.latencyP95Ms`]: latency(cs) } })
    }
  }
  return reports
}

const main = async () => {
  const { values } = parseArgs({
    options: {
      mode: { type: 'string', default: process.env.EVAL_MODE ?? 'mock' },
      target: { type: 'string', default: process.env.EVAL_TARGET ?? 'http://localhost:3000' },
      route: { type: 'string', default: process.env.EVAL_ROUTE },
      suites: { type: 'string', default: 'assistant,search,content' },
      baseline: { type: 'string', default: path.join(here, 'baseline.json') },
      'update-baseline': { type: 'boolean', default: false },
      record: { type: 'string' },
      recording: { type: 'string' },
      report: { type: 'string' },
      concurrency: { type: 'string', default: '4' },
      verbose: { type: 'boolean', short: 'v', default: false },
    },
  })
  const mode = values.mode!
  let driver: Driver
  if (mode === 'mock') driver = createMockDriver()
  else if (mode === 'live') driver = createHttpDriver({ target: values.target! })
  else if (mode === 'replay') {
    if (!values.recording) throw new Error('--recording <file> is required in replay mode')
    driver = await createReplayDriver(values.recording)
  } else throw new Error(`unknown --mode ${mode} (mock | live | replay)`)

  const route = values.route ?? (mode === 'mock' ? 'mock' : mode === 'replay' ? (driver as Awaited<ReturnType<typeof createReplayDriver>>).recording.route : 'live')
  const record: Recording | undefined = values.record ? { route, recordedAt: new Date().toISOString(), assistant: {}, search: {}, content: {} } : undefined

  console.log(`\nPayload AI Suite evals — mode=${mode} route=${route} driver=${driver.name}\n`)
  const reports = await runSuites({ driver, suites: values.suites!.split(','), concurrency: Number(values.concurrency), record })
  await driver.close?.()

  const metrics = Object.assign({}, ...reports.map((r) => r.metrics)) as Record<string, number>
  for (const r of reports) {
    const failed = r.cases.filter((c) => !c.pass)
    console.log(`■ ${r.suite.padEnd(20)} ${r.cases.length - failed.length}/${r.cases.length} passed`)
    for (const c of values.verbose ? r.cases : failed) console.log(`   ${c.pass ? '✓' : '✗'} ${c.id}${c.reasons.length ? ` — ${c.reasons.join('; ')}` : ''}`)
  }

  let baselineFile: BaselineFile = {}
  try {
    baselineFile = JSON.parse(await readFile(values.baseline!, 'utf8')) as BaselineFile
  } catch {
    // first run
  }
  const verdicts = judge(metrics, baselineFile[route]?.metrics)
  console.log('\nmetric'.padEnd(36) + 'value'.padStart(8) + 'min'.padStart(8) + 'base'.padStart(8))
  for (const v of verdicts) {
    const f = (n?: number) => (n === undefined ? '—' : n.toFixed(3)).padStart(8)
    console.log(`${v.ok ? ' ok ' : 'FAIL'} ${v.metric.padEnd(31)}${f(v.value)}${f(v.threshold)}${f(v.baseline)}${v.why ? `  ← ${v.why}` : ''}`)
  }

  if (values.record && record) {
    await writeFile(values.record, JSON.stringify(record, null, 2))
    console.log(`\nrecorded outputs → ${values.record}`)
  }
  if (values.report) await writeFile(values.report, JSON.stringify({ route, mode, metrics, verdicts, reports }, null, 2))

  const failed = verdicts.filter((v) => !v.ok)
  if (values['update-baseline']) {
    if (failed.some((v) => v.threshold !== undefined && v.value < v.threshold)) {
      console.error('\nRefusing to update the baseline: some metrics are below their absolute thresholds.')
      process.exit(1)
    }
    baselineFile[route] = { updatedAt: new Date().toISOString(), metrics: Object.fromEntries(Object.entries(metrics).filter(([k]) => !k.includes('latency'))) }
    await writeFile(values.baseline!, JSON.stringify(baselineFile, null, 2) + '\n')
    console.log(`\nbaseline updated for route "${route}" → ${values.baseline}`)
    return
  }
  if (failed.length) {
    console.error(`\n${failed.length} metric(s) failed — see above.`)
    process.exit(1)
  }
  console.log('\nAll eval thresholds met, no regression vs baseline.')
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((e) => {
    console.error(e)
    process.exit(2)
  })
}
