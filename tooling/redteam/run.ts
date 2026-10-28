/**
 * Red-team runner: sends every prompt in prompts.json to a running app and checks the expectations.
 *   tsx redteam/run.ts --target http://localhost:3000 [--category injection]
 * Exit 1 on any failure. Cases with surface 'confirm' are covered by ai-core integration tests and skipped here.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { createHttpDriver } from '../evals/drivers/http'

export interface RedteamCase {
  id: string
  category: string
  surface: 'assistant' | 'search' | 'confirm'
  actor: 'visitor' | 'customerA' | 'customerB'
  input: string | { repeat: string; times: number }
  burst?: number
  expect: { status?: number[]; someStatus?: number[]; mustNotInclude?: string[]; mustNotCallTools?: string[]; mustNotCard?: string[]; maxChars?: number }
}

const here = path.dirname(fileURLToPath(import.meta.url))
export const loadCases = async (): Promise<RedteamCase[]> =>
  (JSON.parse(await readFile(path.join(here, 'prompts.json'), 'utf8')) as { cases: RedteamCase[] }).cases
export const materialize = (input: RedteamCase['input']): string => (typeof input === 'string' ? input : input.repeat.repeat(input.times))

const main = async () => {
  const { values } = parseArgs({ options: { target: { type: 'string', default: 'http://localhost:3000' }, category: { type: 'string' } } })
  const base = values.target!.replace(/\/$/, '')
  const driver = createHttpDriver({ target: base })
  const cases = (await loadCases()).filter((c) => !values.category || c.category === values.category)
  let failures = 0
  for (const c of cases) {
    if (c.surface === 'confirm') {
      console.log(`  skip ${c.id} (covered by ai-core action tests)`)
      continue
    }
    const input = materialize(c.input)
    const problems: string[] = []
    if (c.burst) {
      const statuses = await Promise.all(
        Array.from({ length: c.burst }, () =>
          fetch(`${base}/api/ai/assistant/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: input }) }).then((r) => r.status),
        ),
      )
      if (c.expect.someStatus && !statuses.some((s) => c.expect.someStatus!.includes(s))) problems.push(`no ${c.expect.someStatus} in burst (${[...new Set(statuses)]})`)
    } else if (c.surface === 'search') {
      const r = await fetch(`${base}/api/ai/search?q=${encodeURIComponent(input)}`)
      const body = await r.text()
      if (c.expect.status && !c.expect.status.includes(r.status)) problems.push(`status ${r.status}`)
      for (const s of c.expect.mustNotInclude ?? []) if (body.includes(s)) problems.push(`contains ${s}`)
    } else {
      const o = await driver.assistant({ id: c.id, locale: 'en', actor: c.actor, message: input })
      const status = Number(o.error?.match(/^(\d{3})/)?.[1] ?? 200)
      const all = `${o.text}\n${JSON.stringify(o.cards)}`
      if (c.expect.status && !c.expect.status.includes(status)) problems.push(`status ${status}`)
      for (const s of c.expect.mustNotInclude ?? []) if (all.includes(s)) problems.push(`contains ${s}`)
      for (const t of c.expect.mustNotCallTools ?? []) if (o.tools.includes(t)) problems.push(`called ${t}`)
      for (const t of c.expect.mustNotCard ?? []) if (o.cards.some((x) => x.type === t)) problems.push(`card ${t}`)
      if (c.expect.maxChars && o.text.length > c.expect.maxChars) problems.push(`answer ${o.text.length} chars`)
    }
    if (problems.length) failures++
    console.log(`${problems.length ? 'FAIL' : ' ok '} [${c.category}] ${c.id}${problems.length ? ` — ${problems.join('; ')}` : ''}`)
  }
  console.log(`\n${cases.length - failures}/${cases.length} red-team cases passed`)
  if (failures) process.exit(1)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) void main()
