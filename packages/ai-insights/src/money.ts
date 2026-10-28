const digitsCache = new Map<string, number>()

/** Minor-unit exponent for an ISO currency (2 for USD/BDT, 0 for JPY, 3 for KWD). */
export const minorDigits = (currency: string): number => {
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

export const toMajor = (minor: number, currency: string): number => minor / 10 ** minorDigits(currency)

export const formatMoney = (minor: number, currency: string, locale = 'en'): string => {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: currency.toUpperCase() }).format(toMajor(minor, currency))
  } catch {
    return `${toMajor(minor, currency).toFixed(minorDigits(currency))} ${currency}`
  }
}

/** Percentage with one decimal, e.g. 0.12345 -> 12.3. */
export const pct = (num: number, den: number): number => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0)

/** Relative change in percent with one decimal; null when the base is zero. */
export const changePct = (current: number, previous: number): number | null =>
  previous === 0 ? null : Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10
