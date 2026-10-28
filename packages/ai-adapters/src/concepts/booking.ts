import type { AdapterContext, BookingAdapter, Slot } from 'payload-ai-core'
import { AIError } from 'payload-ai-core'
import type { Where } from 'payload'
import { and, create, find, findOne, ownerId } from '../local'
import type { Doc } from '../mapping/values'
import { getPath, relId, setPath, toNum, toStr } from '../mapping/values'
import type { Resolution, ResolveEnv, ResolvedTarget } from '../resolve'
import type { BookingConfig, Weekday, WeeklyHours } from '../types'
import { orNull } from './common'

const DAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DEFAULT_HOURS: WeeklyHours = {
  mon: [['09:00', '17:00']],
  tue: [['09:00', '17:00']],
  wed: [['09:00', '17:00']],
  thu: [['09:00', '17:00']],
  fri: [['09:00', '17:00']],
  sat: [['09:00', '17:00']],
}
const MIN = 60_000
const DAY = 24 * 60 * MIN

const toMinutes = (hhmm: string): number | undefined => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined
}

/** `[{ day: 'monday' | 'mon', open: '09:00', close: '17:00' }]` -> WeeklyHours. */
export const hoursFromRows = (rows: unknown): WeeklyHours | undefined => {
  if (!Array.isArray(rows)) return undefined
  const out: WeeklyHours = {}
  for (const row of rows as Doc[]) {
    const day = toStr(row.day ?? row.weekday)?.slice(0, 3).toLowerCase() as Weekday | undefined
    const open = toStr(row.open ?? row.opens ?? row.from)
    const close = toStr(row.close ?? row.closes ?? row.to)
    if (day && DAYS.includes(day) && open && close) (out[day] ??= []).push([open, close])
  }
  return Object.keys(out).length ? out : undefined
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd

export const createBookingAdapter = (env: ResolveEnv, r: Resolution): BookingAdapter => {
  const t = r.main!
  const f = t.fields
  const o = r.options as BookingConfig
  const services = r.extra.services
  const staffT = r.extra.staff
  const locT = r.extra.locations
  const offset = o.utcOffsetMinutes ?? 0
  const freeStatuses = new Set(o.freeStatuses ?? ['cancelled', 'canceled', 'rejected'])
  const tentative = o.tentativeStatus ?? 'tentative'

  /**
   * Busy-time reads (bookings, staff roster) run with system access: shoppers can't read other people's
   * bookings, but availability must see them. Only times/ids are used; nothing is returned to the caller.
   */
  const busyCtx = (ctx: AdapterContext): AdapterContext => ({ payload: ctx.payload, tenant: ctx.tenant, system: true })

  const durationOf = async (offeringId: string, ctx: AdapterContext): Promise<number> => {
    const def = o.services?.defaultDurationMinutes ?? 60
    if (!services) return def
    const doc = await orNull(findOne(services, offeringId, ctx, { publishedOnly: true, depth: 0 }))
    if (!doc) throw new AIError('not_found', 'Service not found')
    const d = services.fields.durationField ? toNum(getPath(doc, services.fields.durationField)) : undefined
    return d && d > 0 ? d : def
  }

  const hoursFor = async (locationId: string | undefined, ctx: AdapterContext): Promise<WeeklyHours> => {
    if (locationId && locT?.fields.hoursField) {
      const loc = await orNull(findOne(locT, locationId, ctx, { depth: 0 }))
      const h = loc && hoursFromRows(getPath(loc, locT.fields.hoursField))
      if (h) return h
    }
    return o.openingHours ?? DEFAULT_HOURS
  }

  const qualifiedStaff = async (offeringId: string, locationId: string | undefined, ctx: AdapterContext): Promise<string[] | null> => {
    if (!staffT) return null
    const where = and(
      staffT.fields.servicesField ? { [staffT.fields.servicesField]: { in: [offeringId] } } : undefined,
      locationId && staffT.fields.locationField ? { [staffT.fields.locationField]: { in: [locationId] } } : undefined,
    )
    const res = await find(staffT, busyCtx(ctx), { where, limit: 200, depth: 0 })
    return res.docs.map((d) => String(d.id))
  }

  const busy = async (
    from: number,
    to: number,
    durationMin: number,
    offeringId: string,
    staffIds: string[] | null,
    locationId: string | undefined,
    ctx: AdapterContext,
  ) => {
    const scope: Where | undefined =
      staffIds && f.staff
        ? { [f.staff]: { in: staffIds } }
        : and({ [f.service]: { equals: offeringId } }, locationId && f.location ? { [f.location]: { equals: locationId } } : undefined)
    const res = await find(t, busyCtx(ctx), {
      where: and(scope, {
        [f.start]: { greater_than_equal: new Date(from - DAY).toISOString(), less_than: new Date(to).toISOString() },
      }),
      limit: 1000,
      depth: 0,
    })
    return res.docs
      .filter((d) => !freeStatuses.has(String(f.status ? getPath(d, f.status) : '')))
      .map((d) => {
        const start = new Date(String(getPath(d, f.start))).getTime()
        const endRaw = f.end ? getPath(d, f.end) : undefined
        const end = endRaw ? new Date(String(endRaw)).getTime() : start + durationMin * MIN
        return { start, end, staffId: f.staff ? relId(getPath(d, f.staff)) : undefined }
      })
      .filter((b) => Number.isFinite(b.start) && b.end > from)
  }

  const adapter: BookingAdapter = {
    collection: t.collection,
    fields: { ...f },

    async availability(input, ctx) {
      const from = Math.max(input.from.getTime(), Date.now())
      const to = input.to.getTime()
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return []
      if (to - from > 62 * DAY) throw new AIError('validation', 'Availability window is limited to 62 days')
      const duration = await durationOf(input.offeringId, ctx)
      const step = (o.slotStepMinutes ?? duration) * MIN
      const hours = await hoursFor(input.locationId, ctx)
      const staffIds = await qualifiedStaff(input.offeringId, input.locationId, ctx)
      if (staffIds && staffIds.length === 0) return []
      const booked = await busy(from, to + duration * MIN, duration, input.offeringId, staffIds, input.locationId, ctx)
      const max = o.maxSlots ?? 50
      const slots: Slot[] = []
      const offMs = offset * MIN
      for (let day = Math.floor((from + offMs) / DAY) * DAY; day < to + offMs && slots.length < max; day += DAY) {
        const weekday = DAYS[new Date(day).getUTCDay()]
        for (const [open, close] of hours[weekday] ?? []) {
          const a = toMinutes(open)
          const b = toMinutes(close)
          if (a === undefined || b === undefined) continue
          for (let s = day + a * MIN - offMs; s + duration * MIN <= day + b * MIN - offMs && slots.length < max; s += step) {
            const e = s + duration * MIN
            if (s < from || e > to + duration * MIN || s >= to) continue
            const clash = (sid?: string) => booked.some((bk) => (sid === undefined || bk.staffId === sid) && overlaps(s, e, bk.start, bk.end))
            const staffId = staffIds ? staffIds.find((sid) => !clash(sid)) : undefined
            if (staffIds ? !staffId : clash()) continue
            slots.push({
              start: new Date(s).toISOString(),
              end: new Date(e).toISOString(),
              ...(staffId ? { staffId } : {}),
              ...(input.locationId ? { locationId: input.locationId } : {}),
            })
          }
        }
      }
      return slots
    },

    async bookTentative(input, ctx) {
      const start = new Date(input.slot.start)
      const end = new Date(input.slot.end)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start)
        throw new AIError('validation', 'Invalid slot')
      const free = await adapter.availability(
        { offeringId: input.offeringId, from: new Date(start.getTime() - MIN), to: end, locationId: input.slot.locationId },
        ctx,
      )
      const slot = free.find(
        (s) => s.start === start.toISOString() && (!input.slot.staffId || !s.staffId || s.staffId === input.slot.staffId),
      )
      if (!slot) throw new AIError('conflict', 'That time is no longer available')
      const values: Record<string, unknown> = {
        service: input.offeringId,
        start: slot.start,
        end: slot.end,
        staff: input.slot.staffId ?? slot.staffId,
        location: slot.locationId,
        status: tentative,
        name: input.name,
        email: input.email,
        phone: input.phone,
        notes: input.notes,
        customer: ownerId(ctx),
      }
      const data: Doc = {}
      for (const [key, path] of Object.entries(f)) if (values[key] !== undefined) setPath(data, path, values[key])
      const doc = await create(t as ResolvedTarget, data, ctx)
      return { id: String(doc.id), status: 'tentative' }
    },
  }
  return adapter
}
