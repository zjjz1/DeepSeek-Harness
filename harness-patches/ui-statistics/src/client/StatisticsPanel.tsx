/**
 * Statistics modal: the centered dialog aggregating every session's history
 * into request/token/cost statistics with a time-range switcher, a token
 * trend bar chart (pure divs, no deps), and a per-session table. Costs are
 * estimated per request at the DeepSeek rate tier of the request's own moment
 * (peak hours ×2); the strip note states the estimate nature. The chart
 * buckets by hour for today (00:00 through the current hour) and by day for
 * every other range (7d / 30d / all). Hovering a bar spawns a tooltip pinned
 * at that bar's right-top corner (it does NOT follow the cursor) and its
 * vertical anchor follows the bar's ACTUAL top, so tall bars raise the
 * tooltip and short/empty bars lower it. Activating another bar glides the
 * tooltip to the new bar via a CSS left/top transition while the content
 * swaps instantly (no cross-fade — the fade was dropped at the user's request
 * to cut per-move cost). The tooltip never unmounts mid-gesture.
 * Close paths: the header button, a mask click, and document-level Escape
 * (mounted only while open).
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import {
  aggregateStatistics, bucketKey, cacheHitPercent, emptyBucketStats, formatCost, formatTokens,
  type BucketStats, type StatisticsAggregate,
} from './aggregate.ts'
import type { StatisticsKey } from './locales.ts'
import css from './StatisticsPanel.module.css'

/** Panel props: chrome strings, the wire face, session list, and close callback. */
export interface StatisticsPanelProps {
  /** Dialog title text. */
  title: string
  /** Close-button accessible label. */
  closeLabel: string
  /** Wire face for session histories. */
  api: ConnectionHandle['api']
  /** Session list snapshot selector (global seat). */
  useSessions: (selector: (state: { byId: Record<string, unknown> }) => unknown) => unknown
  /** Locale seat. */
  t: (key: StatisticsKey, params?: Record<string, unknown>) => string
  /** Close the modal. */
  onClose: () => void
}

/** One loaded session's history. */
interface LoadedSession {
  sessionId: string
  title: string
  events: readonly { type: string; time: number; data: unknown }[]
}

type Range = 'today' | '7d' | '30d' | 'all'
type ViewState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; sessions: readonly LoadedSession[] }

const RANGES: readonly Range[] = ['today', '7d', '30d', 'all']
const PARALLEL_FETCH = 4

/** Local-midnight epoch-ms lower bound for a range (today/7d/30d include today). */
function windowStartFor(range: Exclude<Range, 'all'>): number {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - (range === 'today' ? 0 : range === '7d' ? 6 : 29))
  return date.getTime()
}

/** Short bucket label for the chart axis. */
function shortLabel(key: string, granularity: 'hour' | 'day' | 'month'): string {
  if (granularity === 'month') return key
  if (granularity === 'hour') return key.slice(11) // HH:00
  return key.slice(5) // MM-DD
}

/** Tooltip gap from the bar and viewport margin, in px. */
const TIP_GAP = 6
const TIP_MARGIN = 8

/**
 * Read the active bar column's viewport geometry, including barTop — the
 * ACTUAL top of the rendered bar stack (the input segment's top, i.e. the
 * column top minus the empty space below the tallest possible bar). Anchoring
 * to barTop makes tall bars raise the tooltip and short/empty bars lower it.
 * @param bar - the bar column element (its first child is the stack; the
 * stack's first child is the input segment that tops the bar — output sits
 * at the bottom).
 * @returns the column rect plus the bar's actual top.
 */
function readBarRect(bar: HTMLElement): { left: number; right: number; top: number; bottom: number; barTop: number } {
  const rect = bar.getBoundingClientRect()
  let barTop = rect.top
  const stack = bar.firstElementChild
  if (stack !== null && stack.firstElementChild instanceof HTMLElement) {
    barTop = stack.firstElementChild.getBoundingClientRect().top
  }
  return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, barTop }
}

/**
 * Anchor the tooltip at the bar's right-top corner: its top-left corner sits
 * TIP_GAP px right of and above the bar's actual top (barTop), so taller bars
 * put the tooltip higher. When the right edge would leave the viewport the
 * tooltip flips to the bar's left; when the top edge would leave it flips
 * below the bar. The final position is clamped into the viewport so the
 * tooltip is never clipped.
 * @param rect - the active bar's viewport geometry (see {@link readBarRect}).
 * @param width - tooltip width.
 * @param height - tooltip height.
 * @returns the tooltip's fixed left/top position.
 */
function anchorToBar(rect: { left: number; right: number; top: number; bottom: number; barTop: number }, width: number, height: number): { left: number; top: number } {
  let left = rect.right + TIP_GAP
  let top = rect.barTop - TIP_GAP
  if (left + width > window.innerWidth - TIP_MARGIN) left = rect.left - width - TIP_GAP
  if (top < TIP_MARGIN) top = rect.bottom + TIP_GAP
  left = Math.min(Math.max(left, TIP_MARGIN), window.innerWidth - width - TIP_MARGIN)
  top = Math.min(Math.max(top, TIP_MARGIN), window.innerHeight - height - TIP_MARGIN)
  return { left: Math.round(left), top: Math.round(top) }
}

/** Human-facing period label for one bucket key. */
function periodLabel(key: string): string {
  if (key.length >= 16) {
    // 'YYYY-MM-DD HH:00' → 'MM-DD HH:00–HH:00'（下一个整点）
    const date = key.slice(5, 10)
    const hour = Number(key.slice(11, 13))
    const next = String((hour + 1) % 24).padStart(2, '0')
    return `${date} ${key.slice(11, 16)}–${next}:00`
  }
  return key
}

/**
 * Render the centered statistics dialog.
 * @param props - chrome strings, wire face, session list, locale, close.
 * @returns the modal element tree.
 */
export function StatisticsPanel({ title, closeLabel, api, useSessions, t, onClose }: StatisticsPanelProps) {
  const titleId = useId()
  const [range, setRange] = useState<Range>('30d')
  const [view, setView] = useState<ViewState>({ status: 'loading' })
  const [reloadTick, setReloadTick] = useState(0)

  const byId = useSessions(state => state.byId) as Record<string, {
    blank?: boolean
    /** Session-list metadata: later of creation and latest human prompt. */
    updatedAt?: number
    title?: string
    displayTitle?: string
    projectionValues?: { title?: string }
  }>

  const load = useCallback(() => {
    setView({ status: 'loading' })
    // Range-scoped session reads: only fetch sessions that can carry activity
    // inside the window (updatedAt >= window start; a session last touched
    // before the window cannot have consumed tokens in it). "All" keeps every
    // session. A missing timestamp keeps the session (never drop rows on
    // absent metadata). Event-level window filtering below still cuts each
    // fetched session's own history to the window, so the panel loads only
    // what the selected range needs.
    const windowStart = range === 'all' ? undefined : windowStartFor(range)
    const rows = Object.entries(byId)
      .filter(([, item]) => item?.blank !== true)
      .filter(([, item]) => windowStart === undefined || (item?.updatedAt ?? Number.MAX_SAFE_INTEGER) >= windowStart)
      .map(([sessionId, item]) => ({
        sessionId,
        // displayTitle is the same human-facing label the sidebar shows
        // (durable title → project basename → session id); prefer it so the
        // table reads like the conversation list, not raw ids.
        title: item?.displayTitle
          ?? item?.title
          ?? item?.projectionValues?.title
          ?? `会话 ${sessionId.slice(0, 8)}`,
      }))
    const fetchOne = async (row: { sessionId: string; title: string }): Promise<LoadedSession> => {
      const response = await api.sessions.history({ sessionId: row.sessionId as never, maxMessages: 500 })
      if (!response.result.ok) throw new Error(response.result.error.message)
      return {
        sessionId: row.sessionId,
        title: row.title,
        events: response.result.value.events.map(entry => entry.event as { type: string; time: number; data: unknown }),
      }
    }
    void (async () => {
      const sessions: LoadedSession[] = []
      try {
        for (let index = 0; index < rows.length; index += PARALLEL_FETCH) {
          const chunk = rows.slice(index, index + PARALLEL_FETCH)
          const settled = await Promise.allSettled(chunk.map(fetchOne))
          for (const result of settled) {
            if (result.status === 'fulfilled') sessions.push(result.value)
          }
        }
        setView({ status: 'ready', sessions })
      } catch {
        setView({ status: 'error' })
      }
    })()
    // range drives which sessions get fetched, so a range switch re-loads.
  }, [api, byId, range])

  useEffect(() => { load() }, [load, reloadTick])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  const closeButton = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { closeButton.current?.focus() }, [])

  // Aggregate with the range's granularity and time window: the window is
  // enforced inside the fold, so totals/buckets/sessions all describe exactly
  // the selected range (other days and archived conversations never surface).
  // Today buckets by hour; every other range (7d / 30d / all) buckets by day.
  const granularity: 'hour' | 'day' = range === 'today' ? 'hour' : 'day'
  const aggregate = useMemo<StatisticsAggregate | null>(() => {
    if (view.status !== 'ready') return null
    return range === 'today'
      ? aggregateStatistics(view.sessions, 'hour', windowStartFor('today'))
      : range === 'all'
        ? aggregateStatistics(view.sessions, 'day')
        : aggregateStatistics(view.sessions, 'day', windowStartFor(range))
  }, [view, range])

  // Chart columns: for today, every hour from 00:00 up to the current hour
  // (zero-filled so the whole day-so-far timeline shows); otherwise the
  // buckets the aggregate produced, in ascending order.
  const displayKeys = useMemo(() => {
    if (aggregate === null) return []
    if (range !== 'today') return aggregate.bucketKeys
    const today = bucketKey(new Date(), 'day')
    const pad = (value: number): string => String(value).padStart(2, '0')
    const nowHour = new Date().getHours()
    const keys: string[] = []
    for (let hour = 0; hour <= nowHour; hour++) keys.push(`${today} ${pad(hour)}:00`)
    return keys
  }, [aggregate, range])

  const chartMax = useMemo(() => {
    if (aggregate === null) return 1
    let max = 1
    for (const key of displayKeys) {
      const bucket = aggregate.buckets.get(key)
      if (bucket !== undefined) max = Math.max(max, bucket.input + bucket.output)
    }
    return max
  }, [aggregate, displayKeys])

  // Hover tooltip pinned to the ACTIVE bar (its right-top corner, vertical
  // anchor = the bar's ACTUAL top so tall bars raise it), not the cursor:
  // entering a bar spawns it there directly; while the cursor travels between
  // bars the tooltip stays put; entering another bar glides it to the new bar
  // via a CSS left/top transition while the content swaps instantly. It never
  // unmounts mid-gesture. Position transitions activate only after the first
  // placement so a fresh spawn never slides in from a corner. Chart/body
  // scrolling re-anchors the tooltip imperatively.
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [contentKey, setContentKey] = useState<string | null>(null)
  const barElRef = useRef<HTMLDivElement | null>(null)
  const barRectRef = useRef<{ left: number; right: number; top: number; bottom: number; barTop: number } | null>(null)
  const tipElRef = useRef<HTMLDivElement | null>(null)
  const tipSizeRef = useRef({ w: 0, h: 0 })
  const tipSettledRef = useRef(false)

  useLayoutEffect(() => {
    const el = tipElRef.current
    if (!hoverKey || !el) return
    // Re-measure on every key change: the content (and therefore the tooltip
    // size) may differ between bars.
    tipSizeRef.current = { w: el.offsetWidth, h: el.offsetHeight }
    const rect = barRectRef.current
    if (!rect) return
    const pos = anchorToBar(rect, tipSizeRef.current.w, tipSizeRef.current.h)
    el.style.left = `${pos.left}px`
    el.style.top = `${pos.top}px`
    if (!tipSettledRef.current && css.tipSettled) {
      tipSettledRef.current = true
      el.classList.add(css.tipSettled)
    }
  }, [hoverKey, contentKey])

  const enterBar = (key: string, bar: HTMLDivElement): void => {
    barElRef.current = bar
    barRectRef.current = readBarRect(bar)
    if (hoverKey === null) {
      // First activation: spawn the tooltip at the bar directly, content
      // immediate — no flight.
      setContentKey(key)
      setHoverKey(key)
      return
    }
    if (hoverKey === key) return
    if (contentKey === key) {
      // Content already shown: only glide the position.
      setHoverKey(key)
      return
    }
    // Switching bars: glide the position while the content swaps instantly.
    setContentKey(key)
    setHoverKey(key)
  }
  const leaveChart = (): void => {
    barElRef.current = null
    barRectRef.current = null
    tipSettledRef.current = false
    setHoverKey(null)
    setContentKey(null)
  }
  // Scrolling the chart/body moves the bars under a pinned tooltip; re-anchor
  // it from the active bar's live geometry without a React re-render.
  const repositionForScroll = (): void => {
    const el = tipElRef.current
    const bar = barElRef.current
    if (!el || !bar) return
    barRectRef.current = readBarRect(bar)
    const pos = anchorToBar(barRectRef.current, tipSizeRef.current.w, tipSizeRef.current.h)
    el.style.left = `${pos.left}px`
    el.style.top = `${pos.top}px`
  }

  // The tooltip shows the activated bar's data (contentKey); switching bars
  // replaces the content immediately while the position glides over.
  const tipData = contentKey === null || aggregate === null
    ? null
    : { key: contentKey, bucket: aggregate.buckets.get(contentKey) ?? emptyBucketStats() }

  /** One tooltip face's rows (period label + request/token breakdown). */
  const renderFace = (data: { key: string; bucket: BucketStats }): ReactNode => (
    <>
      <div className={css.tipTitle}>{periodLabel(data.key)}</div>
      <div className={css.tipRow}><span>{t('panel.cardRequests')}</span><b>{data.bucket.requests}</b></div>
      <div className={css.tipRow}><span>{t('panel.cardInput')}</span><b>{formatTokens(data.bucket.input)}</b></div>
      <div className={css.tipRow}><span>{t('panel.cardOutput')}</span><b>{formatTokens(data.bucket.output)}</b></div>
      <div className={css.tipRow}><span>{t('panel.tipTotal')}</span><b>{formatTokens(data.bucket.input + data.bucket.output)}</b></div>
    </>
  )

  const hitPercent = aggregate === null ? null : cacheHitPercent(aggregate.totals)

  return (
    <div className={css.overlay} role="presentation">
      <div className={css.mask} aria-hidden="true" onClick={onClose} />
      <div className={css.panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={css.header}>
          <div className={css.title} id={titleId}>{title}</div>
          <div className={css.ranges} role="tablist">
            {RANGES.map(value => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={range === value}
                className={css.range}
                onClick={() => { setRange(value) }}
              >
                {t(`panel.range${value === 'today' ? 'Today' : value === '7d' ? '7d' : value === '30d' ? '30d' : 'All'}` as StatisticsKey)}
              </button>
            ))}
          </div>
          <button ref={closeButton} type="button" className={css.close} onClick={onClose}>
            <IconCloseOutline16 size={14} />
            <span className={css.hiddenLabel}>{closeLabel}</span>
          </button>
        </div>
        <div className={css.body} onScroll={repositionForScroll}>
          {view.status === 'loading' && <div className={css.status}>{t('panel.loading')}</div>}
          {view.status === 'error' && (
            <div className={css.status}>
              <span>{t('panel.error')}</span>
              <button type="button" className={css.retry} onClick={() => { setReloadTick(tick => tick + 1) }}>
                {t('panel.retry')}
              </button>
            </div>
          )}
          {view.status === 'ready' && aggregate !== null && (
            <>
              {aggregate.totals.requests === 0 && aggregate.totals.input === 0 && aggregate.totals.output === 0 ? (
                <div className={css.status}>{t('panel.empty')}</div>
              ) : (
                <div className={css.content}>
                  <div className={css.cards}>
                    <div className={css.card}><span className={css.cardValue}>{aggregate.totals.requests}</span><span className={css.cardLabel}>{t('panel.cardRequests')}</span></div>
                    <div className={css.card}><span className={css.cardValue}>{formatTokens(aggregate.totals.input)}</span><span className={css.cardLabel}>{t('panel.cardInput')}</span></div>
                    <div className={css.card}><span className={css.cardValue}>{formatTokens(aggregate.totals.output)}</span><span className={css.cardLabel}>{t('panel.cardOutput')}</span></div>
                    <div className={css.card}><span className={css.cardValue}>{hitPercent === null ? '—' : `${hitPercent}%`}</span><span className={css.cardLabel}>{t('panel.cardCacheHit')}</span></div>
                    <div className={css.card}><span className={css.cardValue}>{formatCost(aggregate.totals.cost)}</span><span className={css.cardLabel}>{t('panel.cardCost')}</span></div>
                  </div>
                  <div className={css.chartHead}>
                    <span className={css.chartTitle}>{t('panel.chartTitle')}</span>
                    <span className={css.chartPeak}>{t('panel.chartPeak', { value: formatTokens(chartMax) })}</span>
                    <span className={css.chartLegend}>
                      <span className={`${css.legendDot} ${css.legendInput}`} />{t('panel.chartLegendInput')}
                      <span className={`${css.legendDot} ${css.legendOutput}`} />{t('panel.chartLegendOutput')}
                    </span>
                  </div>
                  <div className={css.chart} onMouseLeave={leaveChart} onScroll={repositionForScroll}>
                    {displayKeys.map(key => {
                      const bucket = aggregate.buckets.get(key) ?? emptyBucketStats()
                      const inputHeight = Math.max(2, bucket.input / chartMax * 100)
                      const outputHeight = Math.max(2, bucket.output / chartMax * 100)
                      return (
                        <div
                          key={key}
                          className={css.barCol}
                          onMouseEnter={(e) => enterBar(key, e.currentTarget)}
                        >
                          <div className={css.barStack}>
                            {/* 输入在上、输出在下（flex column 自顶向下排布，整组贴底）：
                               用户要求避免"头重脚轻" */}
                            <div className={`${css.bar} ${css.barInput}`} style={{ height: `${inputHeight}%` }} />
                            <div className={`${css.bar} ${css.barOutput}`} style={{ height: `${outputHeight}%` }} />
                          </div>
                          <span className={css.barLabel}>{shortLabel(key, granularity)}</span>
                        </div>
                      )
                    })}
                  </div>
                  {hoverKey !== null && tipData !== null && (
                    <div ref={tipElRef} className={css.tip} style={{ left: 0, top: 0 }}>
                      {renderFace(tipData)}
                    </div>
                  )}
                  <div className={css.sessionsHead}>
                    <span className={css.chartTitle}>{t('panel.sessionsTitle')}</span>
                    <span className={css.peakHint}>{t('panel.peakHint')}</span>
                  </div>
                  <div className={css.table}>
                    <div className={`${css.tableRow} ${css.tableHead}`}>
                      <span className={css.colSession}>{t('panel.colSession')}</span>
                      <span className={css.colNum}>{t('panel.colRequests')}</span>
                      <span className={css.colNum}>{t('panel.colInput')}</span>
                      <span className={css.colNum}>{t('panel.colOutput')}</span>
                      <span className={css.colNum}>{t('panel.colCost')}</span>
                    </div>
                    {aggregate.sessions.length === 0 && <div className={css.status}>{t('panel.empty')}</div>}
                    {aggregate.sessions.map(session => (
                      <div key={session.sessionId} className={css.tableRow}>
                        <span className={css.colSession} title={session.title}>{session.title}</span>
                        <span className={css.colNum}>{session.requests}</span>
                        <span className={css.colNum}>{formatTokens(session.input)}</span>
                        <span className={css.colNum}>{formatTokens(session.output)}</span>
                        <span className={css.colNum}>{formatCost(session.cost)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
