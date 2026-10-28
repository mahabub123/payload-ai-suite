import { z } from 'zod'

export const PRESETS = [
  'today',
  'yesterday',
  'last7d',
  'last28d',
  'last30d',
  'last90d',
  'thisWeek',
  'lastWeek',
  'thisMonth',
  'lastMonth',
  'thisYear',
  'lastYear',
] as const

export type PeriodPreset = (typeof PRESETS)[number]

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date')

/** Either a preset name or an explicit { from, to } range (ISO dates; `to` inclusive when date-only). */
export const periodSchema = z.union([
  z.enum(PRESETS),
  z.object({ preset: z.enum(PRESETS) }),
  z.object({ from: isoDate, to: isoDate }),
])

export type PeriodInput = z.infer<typeof periodSchema>

export interface ResolvedPeriod {
  /** Inclusive start. */
  from: Date
  /** Exclusive end. */
  to: Date
  label: string
}

const DAY = 86_400_000

const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY)
/** Monday-based week start (UTC). */
export const startOfWeek = (d: Date) => {
  const s = startOfDay(d)
  return addDays(s, -((s.getUTCDay() + 6) % 7))
}
const startOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))

const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

/** Resolve a period to a half-open UTC range [from, to). */
export const resolvePeriod = (p: PeriodInput | undefined, now: Date = new Date()): ResolvedPeriod => {
  const input = p ?? 'last28d'
  if (typeof input === 'object' && 'from' in input) {
    const from = new Date(input.from)
    const to = isDateOnly(input.to) ? addDays(new Date(input.to), 1) : new Date(input.to)
    if (to <= from) throw new Error('Period end must be after start')
    return { from, to, label: `${input.from} – ${input.to}` }
  }
  const preset = typeof input === 'string' ? input : input.preset
  const today = startOfDay(now)
  const tomorrow = addDays(today, 1)
  switch (preset) {
    case 'today':
      return { from: today, to: tomorrow, label: 'today' }
    case 'yesterday':
      return { from: addDays(today, -1), to: today, label: 'yesterday' }
    case 'last7d':
      return { from: addDays(today, -7), to: today, label: 'last 7 days' }
    case 'last28d':
      return { from: addDays(today, -28), to: today, label: 'last 28 days' }
    case 'last30d':
      return { from: addDays(today, -30), to: today, label: 'last 30 days' }
    case 'last90d':
      return { from: addDays(today, -90), to: today, label: 'last 90 days' }
    case 'thisWeek':
      return { from: startOfWeek(now), to: tomorrow, label: 'this week' }
    case 'lastWeek': {
      const w = startOfWeek(now)
      return { from: addDays(w, -7), to: w, label: 'last week' }
    }
    case 'thisMonth':
      return { from: startOfMonth(now), to: tomorrow, label: 'this month' }
    case 'lastMonth': {
      const m = startOfMonth(now)
      return { from: new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() - 1, 1)), to: m, label: 'last month' }
    }
    case 'thisYear':
      return { from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), to: tomorrow, label: 'this year' }
    case 'lastYear':
      return {
        from: new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1)),
        to: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)),
        label: 'last year',
      }
  }
}

/** The equally long period immediately before `p`. */
export const previousPeriod = (p: ResolvedPeriod): ResolvedPeriod => {
  const len = p.to.getTime() - p.from.getTime()
  return { from: new Date(p.from.getTime() - len), to: new Date(p.from), label: `previous ${p.label}` }
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/** Bucket key for a date at day/week/month granularity (UTC). */
export const bucketKey = (d: Date, g: 'day' | 'week' | 'month'): string =>
  g === 'day' ? isoDay(d) : g === 'week' ? isoDay(startOfWeek(d)) : d.toISOString().slice(0, 7)

/** All bucket keys in [from, to), so empty days/weeks/months show as zero. */
export const bucketKeys = (p: ResolvedPeriod, g: 'day' | 'week' | 'month'): string[] => {
  const keys: string[] = []
  const seen = new Set<string>()
  for (let t = startOfDay(p.from).getTime(); t < p.to.getTime(); t += DAY) {
    const k = bucketKey(new Date(t), g)
    if (!seen.has(k)) {
      seen.add(k)
      keys.push(k)
    }
  }
  return keys
}

export const periodJSON = (p: ResolvedPeriod) => ({ from: p.from.toISOString(), to: p.to.toISOString(), label: p.label })
