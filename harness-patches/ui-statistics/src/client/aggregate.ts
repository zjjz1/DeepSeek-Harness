/**
 * Pure statistics aggregation over session history events: request counts,
 * token usage (with the cache-hit split), and per-request cost at the DeepSeek
 * rate tier of the request's own moment (peak hours ×2). No DOM, no deps.
 * Buckets support day ('YYYY-MM-DD'), hour ('YYYY-MM-DD HH:00'), and month
 * ('YYYY-MM') granularities.
 *
 * The rate card mirrors ui-conversation's `chat/pricing.ts` — keep both in
 * sync (cross-package value imports are forbidden by the client purity gate).
 */

/** Off-peak per-million-token CNY rates (DeepSeek V4 tiered pricing, 2025-08-17). */
const PRICES: Readonly<Record<string, { prompt: number; cached: number; output: number }>> = {
  'deepseek-chat': { prompt: 1.5, cached: 0.05, output: 4.5 },
  'deepseek-reasoner': { prompt: 4.5, cached: 0.15, output: 13.5 },
}

/** Default rate key for the aggregate (deepseek-chat / V4 flash). */
const DEFAULT_PRICE_KEY = 'deepseek-chat'

/** Peak hours (Beijing 09:00–12:00, 14:00–18:00) bill at twice the off-peak rate. */
export const PEAK_MULTIPLIER = 2

/** Whether a moment falls inside DeepSeek peak hours (Beijing time, UTC+8). */
export function isPeakHour(at: Date): boolean {
  const hour = (at.getUTCHours() + 8) % 24
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18)
}

/** Effective rate buckets for one moment. */
function priceAt(at: Date): { prompt: number; cached: number; output: number } {
  const price = PRICES[DEFAULT_PRICE_KEY]!
  if (!isPeakHour(at)) return price
  return {
    prompt: price.prompt * PEAK_MULTIPLIER,
    cached: price.cached * PEAK_MULTIPLIER,
    output: price.output * PEAK_MULTIPLIER,
  }
}

/** Cost of one usage breakdown at one moment (CNY), null when nothing billed. */
export function computeCostAt(
  usage: { uncachedInput: number; cacheRead: number; cacheWrite: number; output: number },
  at: Date,
): number | null {
  const price = priceAt(at)
  const inputBilled = usage.uncachedInput + usage.cacheWrite
  const total = inputBilled * price.prompt / 1_000_000
    + usage.cacheRead * price.cached / 1_000_000
    + usage.output * price.output / 1_000_000
  if ((inputBilled + usage.cacheRead + usage.output) === 0) return null
  return total
}

/** Token-usage breakdown of one model request. */
export interface UsageBreakdown {
  uncachedInput: number
  cacheRead: number
  cacheWrite: number
  output: number
}

/**
 * Extract the usage breakdown from an `assistant/message` event payload.
 * The harness-normalized usage record rides on the event's `data` root
 * (TokenUsage: `inputTokens` / `outputTokens` / `cacheReadTokens` /
 * `cacheWriteTokens`), NOT the DeepSeek API's raw `prompt_tokens` naming.
 * @param data - the event's `data` object.
 * @returns the breakdown, or null when no usage is present.
 */
export function usageOf(data: unknown): UsageBreakdown | null {
  if (typeof data !== 'object' || data === null) return null
  const usage = (data as { usage?: unknown }).usage
  if (typeof usage !== 'object' || usage === null) return null
  const record = usage as {
    inputTokens?: unknown
    outputTokens?: unknown
    cacheReadTokens?: unknown
    cacheWriteTokens?: unknown
  }
  const inputTokens = typeof record.inputTokens === 'number' ? record.inputTokens : 0
  return {
    uncachedInput: inputTokens,
    cacheRead: typeof record.cacheReadTokens === 'number' ? record.cacheReadTokens : 0,
    cacheWrite: typeof record.cacheWriteTokens === 'number' ? record.cacheWriteTokens : 0,
    output: typeof record.outputTokens === 'number' ? record.outputTokens : 0,
  }
}

/** One bucket of the aggregate (a day, an hour, or a month). */
export interface BucketStats {
  requests: number
  input: number
  cacheRead: number
  output: number
  cost: number
}

/** One session's totals. */
export interface SessionStats extends BucketStats {
  sessionId: string
  title: string
}

/** The complete aggregate. */
export interface StatisticsAggregate {
  totals: BucketStats
  /** Buckets keyed by local calendar label ('YYYY-MM-DD' or 'YYYY-MM'). */
  buckets: ReadonlyMap<string, BucketStats>
  /** Bucket keys in ascending order. */
  bucketKeys: readonly string[]
  /** Per-session totals, sorted by cost descending. */
  sessions: readonly SessionStats[]
}

/**
 * Local calendar key for one moment.
 * @param at - the moment to bucket.
 * @param granularity - 'day' → 'YYYY-MM-DD', 'hour' → 'YYYY-MM-DD HH:00',
 * 'month' → 'YYYY-MM'.
 */
export function bucketKey(at: Date, granularity: 'day' | 'hour' | 'month'): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  if (granularity === 'hour') {
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:00`
  }
  if (granularity === 'day') {
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
  }
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}`
}

/** A zeroed bucket (also the display row for empty hours in the today view). */
export function emptyBucketStats(): BucketStats {
  return { requests: 0, input: 0, cacheRead: 0, output: 0, cost: 0 }
}

/**
 * Fold one session's events into the aggregate.
 * @param sessionId - the session's stable id (row identity; titles may repeat).
 * @param events - the session's history events.
 * @param granularity - bucket granularity.
 * @param windowStart - epoch-ms lower bound; events before it are ignored
 * (range filtering), or undefined for the full history.
 * @param target - the running aggregate (mutated in place).
 */
export function foldSession(
  sessionId: string,
  events: readonly { type: string; time: number; data: unknown }[],
  granularity: 'day' | 'hour' | 'month',
  windowStart: number | undefined,
  target: { totals: BucketStats; buckets: Map<string, BucketStats>; bySession: Map<string, BucketStats> },
): void {
  const session = emptyBucketStats()
  for (const event of events) {
    if (windowStart !== undefined && event.time < windowStart) continue
    if (event.type === 'step/start') {
      target.totals.requests += 1
      session.requests += 1
      const key = bucketKey(new Date(event.time), granularity)
      const bucket = target.buckets.get(key) ?? emptyBucketStats()
      bucket.requests += 1
      target.buckets.set(key, bucket)
      continue
    }
    if (event.type !== 'assistant/message') continue
    const usage = usageOf(event.data)
    if (usage === null) continue
    const at = new Date(event.time)
    const cost = computeCostAt(usage, at) ?? 0
    target.totals.input += usage.uncachedInput + usage.cacheWrite
    target.totals.cacheRead += usage.cacheRead
    target.totals.output += usage.output
    target.totals.cost += cost
    session.input += usage.uncachedInput + usage.cacheWrite
    session.cacheRead += usage.cacheRead
    session.output += usage.output
    session.cost += cost
    const key = bucketKey(at, granularity)
    const bucket = target.buckets.get(key) ?? emptyBucketStats()
    bucket.input += usage.uncachedInput + usage.cacheWrite
    bucket.cacheRead += usage.cacheRead
    bucket.output += usage.output
    bucket.cost += cost
    target.buckets.set(key, bucket)
  }
  // Sessions with no activity in the window stay out of the table: the range
  // view must never list other days' (or archived) conversations.
  if (session.requests > 0 || session.input + session.output > 0) {
    target.bySession.set(sessionId, session)
  }
}

/**
 * Aggregate every session's events into totals, calendar buckets, and a
 * per-session table.
 * @param sessions - session id + title + events triples.
 * @param granularity - 'hour' for the today view, 'day' for ranges up to a
 * month or the full history, 'month' for coarse year-scale views.
 * @param windowStart - epoch-ms lower bound for range views, or undefined for
 * the full history (see {@link foldSession}).
 * @returns the complete aggregate.
 */
export function aggregateStatistics(
  sessions: readonly { sessionId: string; title: string; events: readonly { type: string; time: number; data: unknown }[] }[],
  granularity: 'day' | 'hour' | 'month',
  windowStart?: number,
): StatisticsAggregate {
  const totals = emptyBucketStats()
  const buckets = new Map<string, BucketStats>()
  const bySession = new Map<string, BucketStats>()
  const titles = new Map(sessions.map(session => [session.sessionId, session.title]))
  for (const session of sessions) {
    foldSession(session.sessionId, session.events, granularity, windowStart, { totals, buckets, bySession })
  }
  const bucketKeys = [...buckets.keys()].sort()
  const sessionRows: SessionStats[] = [...bySession.entries()].map(([sessionId, stats]) => ({
    sessionId,
    title: titles.get(sessionId) ?? sessionId,
    ...stats,
  }))
  sessionRows.sort((a, b) => b.cost - a.cost || b.requests - a.requests)
  return { totals, buckets, bucketKeys, sessions: sessionRows }
}

/** Compact token count: 517 / 12.2K / 517K / 1.2M. */
export function formatTokens(n: number): string {
  const scaled = (v: number): string =>
    v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${scaled(n / 1_000)}K`
  return `${scaled(n / 1_000_000)}M`
}

/** Compact CNY cost. */
export function formatCost(cost: number): string {
  if (cost < 0.01) return '¥<0.01'
  if (cost < 10) return `¥${cost.toFixed(2)}`
  if (cost < 100) return `¥${cost.toFixed(1)}`
  return `¥${Math.round(cost)}`
}

/** Cache-hit share of prompt-side input (percent, rounded), null when none. */
export function cacheHitPercent(totals: BucketStats): number | null {
  const billed = totals.input + totals.cacheRead
  return billed === 0 ? null : Math.round(totals.cacheRead / billed * 100)
}
