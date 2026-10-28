import type { Money } from '@payload-ai-suite/ai-core/wire'

const digitsCache = new Map<string, number>()

/** Fraction digits of a currency's minor unit (BDT/USD 2, JPY 0, KWD 3). */
export const minorUnitDigits = (currency: string): number => {
  const c = currency.toUpperCase()
  let d = digitsCache.get(c)
  if (d === undefined) {
    try {
      d = new Intl.NumberFormat('en', { style: 'currency', currency: c }).resolvedOptions().maximumFractionDigits ?? 2
    } catch {
      d = 2
    }
    digitsCache.set(c, d)
  }
  return d
}

/** Format integer minor units with Intl.NumberFormat. */
export const formatMoney = (money: Money | undefined | null, locale = 'en'): string => {
  if (!money || !Number.isFinite(money.amount)) return ''
  const digits = minorUnitDigits(money.currency)
  const value = money.amount / 10 ** digits
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency.toUpperCase() }).format(value)
  } catch {
    return `${value.toFixed(digits)} ${money.currency}`
  }
}

export const formatDateTime = (iso: string, locale = 'en', opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  try {
    return new Intl.DateTimeFormat(locale, opts).format(d)
  } catch {
    return d.toISOString()
  }
}
