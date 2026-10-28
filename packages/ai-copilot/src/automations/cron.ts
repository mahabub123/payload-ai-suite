/** Minimal 5-field cron matcher (minute hour day-of-month month day-of-week), UTC. Supports *, n, a-b, a-b/s, *\/s, lists. */
const RANGES: [number, number][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6],
]

const parseField = (expr: string, [min, max]: [number, number]): Set<number> => {
  const out = new Set<number>()
  for (const part of expr.split(',')) {
    const [range, stepStr] = part.split('/')
    const step = stepStr ? Number(stepStr) : 1
    if (!Number.isInteger(step) || step < 1) throw new Error(`Invalid cron step "${part}"`)
    let lo = min
    let hi = max
    if (range !== '*') {
      const [a, b] = range.split('-').map(Number)
      if (!Number.isInteger(a)) throw new Error(`Invalid cron value "${part}"`)
      lo = a
      hi = b === undefined || Number.isNaN(b) ? (stepStr ? max : a) : b
    }
    for (let v = lo; v <= hi; v += step) out.add(v === 7 && max === 6 ? 0 : v)
  }
  return out
}

export const parseCron = (cron: string): Set<number>[] => {
  const parts = cron.trim().split(/\s+/)
  // Accept Payload-style 6-field (leading seconds) by dropping seconds.
  const five = parts.length === 6 ? parts.slice(1) : parts
  if (five.length !== 5) throw new Error(`Cron must have 5 fields: "${cron}"`)
  return five.map((p, i) => parseField(p, RANGES[i]))
}

export const cronMatches = (cron: string, d: Date): boolean => {
  const [m, h, dom, mon, dow] = parseCron(cron)
  return m.has(d.getUTCMinutes()) && h.has(d.getUTCHours()) && dom.has(d.getUTCDate()) && mon.has(d.getUTCMonth() + 1) && dow.has(d.getUTCDay())
}

/** True when the cron fired in (since, now]. Scans at most `maxMinutes` minutes back. */
export const cronDueBetween = (cron: string, since: Date | undefined, now: Date, maxMinutes = 60): boolean => {
  const end = new Date(now)
  end.setUTCSeconds(0, 0)
  const floor = since ? since.getTime() : end.getTime() - 5 * 60_000
  for (let i = 0; i < maxMinutes; i++) {
    const t = new Date(end.getTime() - i * 60_000)
    if (t.getTime() <= floor) break
    if (cronMatches(cron, t)) return true
  }
  return false
}
