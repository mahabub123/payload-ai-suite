import type { ModelInfoInput, Usage } from '../contracts'

/** Fraction of the input price charged for cached input tokens when the model has no explicit cached price. */
export const DEFAULT_CACHED_INPUT_RATIO = 0.5

/**
 * Cost of one call in integer micro-USD. A gateway-reported cost always wins over the price table.
 * `inputTokens` includes cached tokens (AI SDK convention); cached tokens are billed at the cached rate.
 */
export const computeCostMicros = (
  usage: Usage,
  model?: Pick<ModelInfoInput, 'inputPriceMicrosPerM' | 'outputPriceMicrosPerM' | 'cachedInputPriceMicrosPerM' | 'imagePriceMicros'>,
  extra: { images?: number } = {},
): number => {
  if (usage.reportedCostMicros != null && Number.isFinite(usage.reportedCostMicros)) {
    return Math.max(0, Math.round(usage.reportedCostMicros))
  }
  if (!model) return 0
  const inPrice = model.inputPriceMicrosPerM ?? 0
  const outPrice = model.outputPriceMicrosPerM ?? 0
  const cachedPrice = model.cachedInputPriceMicrosPerM ?? inPrice * DEFAULT_CACHED_INPUT_RATIO
  const cached = Math.min(Math.max(0, usage.cachedInputTokens ?? 0), Math.max(0, usage.inputTokens))
  const uncached = Math.max(0, usage.inputTokens - cached)
  const tokens = (uncached * inPrice + cached * cachedPrice + Math.max(0, usage.outputTokens) * outPrice) / 1_000_000
  const images = (extra.images ?? 0) * (model.imagePriceMicros ?? 0)
  return Math.round(tokens + images)
}

/** USD (float) -> micro-USD integer. */
export const usdToMicros = (usd: number): number => Math.round(usd * 1_000_000)
