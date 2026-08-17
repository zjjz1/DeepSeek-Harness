/**
 * Reminder header utility: folds the durable schedule/change log into a live
 * list (create/delete/dispatch), offers quick-add and per-row delete by
 * submitting an ordinary user message through the composer (the host
 * schedule tools do the durable work), and shows a friendly hint. A minute
 * ticker keeps the overdue labels fresh while the popover is open.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChecklistOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ScheduleSnapshot } from './contract.ts'
import type { ScheduleKey } from './locales.ts'
import css from './ReminderAction.module.css'

/** Full component props: the utilities seat's runtime share + locale seat. */
export type ReminderActionProps = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<'ui-schedule'>

/** Compact local clock label for a target time. */
function clockLabel(time: number): string {
  const date = new Date(time)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Render the Reminders header utility and its popover.
 * @param props - session kit + locale.
 * @returns the reminder button and popover.
 */
export function ReminderAction({ useSession, inputActions, t }: ReminderActionProps) {
  const snapshot = useSession(s => s.views.get('schedule')) as ScheduleSnapshot | undefined
  const reminders = snapshot?.reminders ?? []
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [time, setTime] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)

  // Minute ticker while open keeps overdue labels current.
  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => { setNow(Date.now()) }, 30_000)
    return () => { clearInterval(timer) }
  }, [open])

  // Outside click + Escape close the popover.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (rootRef.current?.contains(event.target as Node) === true) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const toggle = (): void => {
    setOpen(previous => {
      const next = !previous
      if (next) setRect(rootRef.current?.getBoundingClientRect() ?? null)
      return next
    })
  }

  /** Submit one ordinary user message through the composer. */
  const ask = useCallback((text: string): void => {
    inputActions.setDraft(text)
    inputActions.submit()
  }, [inputActions])

  const addReminder = (): void => {
    const content = prompt.trim()
    if (content === '') return
    const timePart = time === ''
      ? ''
      : `，目标时间（本地）${time}`
    ask(`请创建提醒：${content}${timePart}（用 schedule_create 工具）`)
    setPrompt('')
    setTime('')
    setOpen(false)
  }

  const deleteReminder = (id: string): void => {
    ask(`请删除提醒 ${id}（用 schedule_delete 工具）`)
    setOpen(false)
  }

  const rows = useMemo(() => reminders.map(reminder => {
    const overdue = reminder.target < now
    const kindKey: ScheduleKey = reminder.kind === 'after'
      ? 'panel.kindAfter' : reminder.kind === 'at' ? 'panel.kindAt' : 'panel.kindEvery'
    return {
      id: reminder.id,
      prompt: reminder.prompt,
      kind: t(kindKey),
      label: `${clockLabel(reminder.target)}${overdue ? ` · ${t('panel.overdue')}` : ''}`,
      overdue,
    }
  }), [reminders, now, t])

  return (
    <span ref={rootRef} className={css.root}>
      <button
        type="button"
        className={css.reminderButton}
        aria-label={t('action.label')}
        aria-expanded={open}
        onClick={toggle}
      >
        {t('action.label')}
        {reminders.length > 0 && <span className={css.count}>{reminders.length}</span>}
        <IconChecklistOutline14 />
      </button>
      {open && rect !== null && (
        <div className={css.popover} style={{ right: Math.max(8, window.innerWidth - rect.right), top: rect.bottom + 6 }}>
          <div className={css.head}>
            <span className={css.title}>{t('panel.title')}</span>
            <span className={css.subtitle}>{rows.length}</span>
          </div>
          <div className={css.list}>
            {rows.length === 0
              ? <div className={css.empty}>{t('panel.empty')}</div>
              : rows.map(row => (
                <div key={row.id} className={css.row}>
                  <div className={css.rowText}>
                    <div className={css.rowPrompt} title={row.prompt}>{row.prompt}</div>
                    <div className={css.rowMeta}>
                      <span className={row.overdue ? css.overdue : css.pending}>{row.label}</span>
                      <span className={css.kind}>{row.kind}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={css.delete}
                    aria-label={`${t('panel.delete')} ${row.prompt}`}
                    onClick={() => { deleteReminder(row.id) }}
                  >
                    {t('panel.delete')}
                  </button>
                </div>
              ))}
          </div>
          <div className={css.form}>
            <div className={css.formTitle}>{t('panel.addTitle')}</div>
            <input
              className={css.input}
              type="text"
              value={prompt}
              placeholder={t('panel.prompt')}
              onChange={(event) => { setPrompt(event.target.value) }}
              onKeyDown={(event) => { if (event.key === 'Enter') addReminder() }}
            />
            <div className={css.formRow}>
              <input
                className={css.inputTime}
                type="datetime-local"
                value={time}
                aria-label={t('panel.time')}
                onChange={(event) => { setTime(event.target.value) }}
              />
              <button
                type="button"
                className={css.add}
                disabled={prompt.trim() === ''}
                onClick={addReminder}
              >
                {t('panel.add')}
              </button>
            </div>
          </div>
          <div className={css.hint}>{t('panel.hint')}</div>
        </div>
      )}
    </span>
  )
}
