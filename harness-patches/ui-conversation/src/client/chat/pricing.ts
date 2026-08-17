/**
 * DeepSeek official per-million-token pricing, in CNY — an estimate for the
 * composer stats strip's "current cost" figure and the statistics panel's
 * per-request billing, NOT a billing input.
 *
 * Prices change independently of this repo; keep this table in sync with the
 * official rate card: https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
 *
 * Values are per 1,000,000 tokens (¥ / MTok), OFF-PEAK (空闲时段) rates.
 * Peak hours (北京时间 09:00–12:00 and 14:00–18:00) bill at exactly twice the
 * off-peak rate (DeepSeek V4 tiered pricing, effective 2025-08-17).
 *
 * Values are per 1,000,000 tokens (¥ / MTok).
 */

/** Peak hours are billed at twice the off-peak rate. */
export const PEAK_MULTIPLIER = 2

/** Beijing (UTC+8, no DST) hour is peak within these closed ranges. */
const PEAK_RANGES: readonly (readonly [number, number])[] = [
  [9, 12],
  [14, 18],
]

/**
 * Whether a moment falls inside DeepSeek peak hours (Beijing time).
 * @param at - the moment to classify; defaults to now.
 * @returns true during 09:00–12:00 / 14:00–18:00 (Asia/Shanghai).
 */
export function isPeakHour(at: Date = new Date()): boolean {
  const beijingHour = (at.getUTCHours() + 8) % 24
  return PEAK_RANGES.some(([start, end]) => beijingHour >= start && beijingHour < end)
}

/**
 * One model's per-million-token price buckets (off-peak rates).
 * `prompt` is uncached (cache-miss) input, `cached` is cache-read input,
 * `output` is generated output. Cache-write input is billed as `prompt`.
 */
export interface DeepSeekPrice {
  prompt: number
  cached: number
  output: number
}

/**
 * Durable pricing table. The stats surface prices against the `deepseek-chat`
 * (V4 flash) rate as the default; a deployment can extend this map with other
 * model ids and select a key. Fields are CNY per million tokens, off-peak.
 */
export const DEEPSEEK_PRICES: Readonly<Record<string, DeepSeekPrice>> = Object.freeze({
  'deepseek-chat': Object.freeze({ prompt: 1.5, cached: 0.05, output: 4.5 }),
  'deepseek-reasoner': Object.freeze({ prompt: 4.5, cached: 0.15, output: 13.5 }),
})

/** Default price used by the stats surface. */
export const DEFAULT_PRICE_KEY = 'deepseek-chat'

/**
 * The effective price buckets for one moment: off-peak rates, or twice that
 * during peak hours.
 * @param price - the off-peak rate card.
 * @param at - the moment to bill at; defaults to now.
 * @returns the effective (possibly doubled) buckets.
 */
export function priceAt(price: DeepSeekPrice, at: Date = new Date()): DeepSeekPrice {
  if (!isPeakHour(at)) return price
  return {
    prompt: price.prompt * PEAK_MULTIPLIER,
    cached: price.cached * PEAK_MULTIPLIER,
    output: price.output * PEAK_MULTIPLIER,
  }
}

/**
 * Compute the cumulative cost in CNY for a token-usage projection at one
 * moment's rate tier, or null when no tokens were billed.
 * @param price - the off-peak price buckets.
 * @param usage - the session's token-usage projection.
 * @param at - the moment whose rate tier applies; defaults to now.
 * @returns total cost in CNY (float), or null when input and output are both 0.
 */
export function computeCost(
  price: DeepSeekPrice,
  usage: { uncachedInputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number },
  at: Date = new Date(),
): number | null {
  const effective = priceAt(price, at)
  const inputBilled = usage.uncachedInputTokens + usage.cacheWriteTokens
  const total = inputBilled * effective.prompt / 1_000_000
    + usage.cacheReadTokens * effective.cached / 1_000_000
    + usage.outputTokens * effective.output / 1_000_000
  if ((inputBilled + usage.cacheReadTokens + usage.outputTokens) === 0) return null
  return total
}

/**
 * Format a CNY cost compactly: ¥0.01 for sub-cent everytime, then ¥1.23, then
 * ¥12.3, then ¥123 (no more than three significant figures).
 * @param cost - cost in CNY from {@link computeCost}.
 * @returns display string with no locale-specific grouping.
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) return '¥<0.01'
  if (cost < 10) return `¥${cost.toFixed(2)}`
  if (cost < 100) return `¥${cost.toFixed(1)}`
  return `¥${Math.round(cost)}`
}
