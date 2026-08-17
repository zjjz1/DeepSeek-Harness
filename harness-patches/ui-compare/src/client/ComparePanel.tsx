/**
 * Compare & merge panel: the sidebar-foot entry opening a modal that lists
 * every session, fetches selected histories over the read-only wire face, and
 * either renders them side by side or merges them into a downloadable
 * Markdown document.
 */
import { useCallback, useMemo, useState } from 'react'
import clsx from 'clsx'
import { IconAgentPresetOutline16, MarkdownText, Modal, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConnectionHandle, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import { eventsToRows, sessionsToMergedMarkdown, type CompareRow, type CompareSession } from './history.ts'
import css from './ComparePanel.module.css'

/** Injected business face: the wire face for session histories. */
export interface ComparePanelInjected {
  api: ConnectionHandle['api']
}

/** Full component props: the sidebar-foot seat's runtime share + injected face + locale seat. */
export type ComparePanelProps = PropsRuntime<'sidebar.footer.action'> & ComparePanelInjected & PropsLocale<'ui-compare'>

/** Compact relative time label. */
function timeLabel(time: number): string {
  const date = new Date(time)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Trigger a browser download of generated text. */
function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => { URL.revokeObjectURL(url) }, 10_000)
}

/** One bubble row, mirroring the default chat rhythm. */
function CompareRowView({ row }: { row: CompareRow }) {
  return (
    <div className={css.message} data-role={row.role}>
      <div className={css.bubble}>
        <MarkdownText text={row.text} />
      </div>
    </div>
  )
}

/** Structural read of one list row (the wire view varies by assembly). */
interface SessionRowView {
  blank?: boolean
  updatedAt?: number
  agentPreset?: string
  projections?: { values?: { title?: string } }
}

/**
 * Render the compare entry and modal.
 * @param props - sidebar seat + wire face + locale.
 * @returns the entry trigger and the compare/merge panel.
 */
export function ComparePanel({ useSessions, api, t, wide }: ComparePanelProps) {
  const byId = useSessions(s => s.byId)
  const sessions = useMemo(
    () => Object.entries(byId)
      .map(([sessionId, raw]) => {
        const item = raw as unknown as SessionRowView
        const title = item.projections?.values?.title ?? ''
        return {
          sessionId,
          title: title === '' ? `会话 ${sessionId.slice(0, 8)}` : title,
          updatedAt: item.updatedAt ?? 0,
          agentPreset: item.agentPreset,
          blank: item.blank === true,
        }
      })
      .filter(item => !item.blank),
    [byId],
  )
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [compared, setCompared] = useState<readonly CompareSession[] | null>(null)

  const toggle = (sessionId: string): void => {
    setCompared(null)
    setError(null)
    setSelected(previous => {
      const next = new Set(previous)
      if (!next.delete(sessionId)) {
        if (next.size >= 4) return previous
        next.add(sessionId)
      }
      return next
    })
  }

  const fetchSelected = useCallback(async (): Promise<readonly CompareSession[]> => {
    const chosen = sessions.filter(item => selected.has(item.sessionId))
    const fetched = await Promise.all(chosen.map(async (item) => {
      const response = await api.sessions.history({ sessionId: item.sessionId as SessionId, maxMessages: 300 })
      if (!response.result.ok) throw new Error(response.result.error.message)
      const events = response.result.value.events.map(entry => entry.event)
      return {
        sessionId: item.sessionId,
        title: item.title,
        rows: eventsToRows(events),
      }
    }))
    return fetched
  }, [api, selected, sessions])

  const runCompare = (): void => {
    if (selected.size < 2) return
    setLoading(true)
    setError(null)
    setCompared(null)
    void fetchSelected().then((result) => {
      setCompared(result)
      setLoading(false)
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause))
      setLoading(false)
    })
  }

  const runMerge = (): void => {
    if (selected.size < 2) return
    setLoading(true)
    setError(null)
    void fetchSelected().then((result) => {
      const stem = `合并-${new Date().toISOString().slice(0, 10)}`
      downloadText(`${stem}.md`, sessionsToMergedMarkdown(result), 'text/markdown;charset=utf-8')
      setLoading(false)
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause))
      setLoading(false)
    })
  }

  return (
    <>
      <Tooltip label={t('entry.label')} delayMs={500} disabled={wide}>
        <button
          type="button"
          className={clsx(css.entry, !wide && css.rail)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={t('entry.label')}
          onClick={() => { setOpen(true) }}
        >
          <IconAgentPresetOutline16 className={css.icon} size={wide ? 14 : 18} />
          {wide && <span className={css.entryLabel}>{t('entry.label')}</span>}
        </button>
      </Tooltip>
      <Modal
        open={open}
        onClose={() => { setOpen(false) }}
        title={t('panel.title')}
        closeLabel={t('panel.close')}
        className={css.dialog as string}
      >
        <div className={css.hint}>{t('panel.hint')}</div>
        <div className={css.list}>
          {sessions.length === 0 && <div className={css.empty}>{t('panel.empty')}</div>}
          {sessions.map(item => (
            <label key={item.sessionId} className={css.row}>
              <input
                type="checkbox"
                className={css.check}
                checked={selected.has(item.sessionId)}
                onChange={() => { toggle(item.sessionId) }}
              />
              <span className={css.rowText}>
                <span className={css.rowTitle}>{item.title}</span>
                <span className={css.rowMeta}>
                  {t('panel.updated')} {timeLabel(item.updatedAt)}
                  {item.agentPreset !== undefined && <span className={css.preset}>{item.agentPreset}</span>}
                </span>
              </span>
            </label>
          ))}
        </div>
        {compared !== null && (
          <div className={css.columns}>
            {compared.map(session => (
              <div key={session.sessionId} className={css.column}>
                <div className={css.columnHead}>{session.title}</div>
                <div className={css.columnBody}>
                  {session.rows.length === 0
                    ? <div className={css.empty}>{t('panel.empty')}</div>
                    : session.rows.map((row, index) => (
                      <CompareRowView key={index} row={row} />
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {loading && <div className={css.status}>{t('panel.loading')}</div>}
        {error !== null && <div className={css.error}>{t('panel.error')}: {error}</div>}
        <div className={css.footer}>
          <button
            type="button"
            className={css.action}
            disabled={selected.size < 2 || loading}
            title={selected.size < 2 ? t('panel.needTwo') : undefined}
            onClick={runCompare}
          >
            {t('panel.compare')}
          </button>
          <button
            type="button"
            className={css.action}
            disabled={selected.size < 2 || loading}
            title={selected.size < 2 ? t('panel.needTwo') : undefined}
            onClick={runMerge}
          >
            {t('panel.merge')}
          </button>
        </div>
      </Modal>
    </>
  )
}
