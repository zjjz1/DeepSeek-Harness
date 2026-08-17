/**
 * Sidebar-foot entry that opens the statistics modal. Renders the compact row
 * in the wide column and the rail circle when collapsed — the same rhythm as
 * the Settings trigger and the sibling plugin-market entry. Modal open state is
 * component-local viewing state.
 */
import { useCallback, useState } from 'react'
import clsx from 'clsx'
import { IconDataOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { StatisticsPanel } from './StatisticsPanel.tsx'
import type { StatisticsEntryInjected } from './index.ts'
import css from './StatisticsEntry.module.css'

/** Entry props: the sidebar column state, the wire face, and the locale seat. */
export type StatisticsEntryProps =
  PropsRuntime<'sidebar.footer.action'> & StatisticsEntryInjected & PropsLocale<'statistics'>

/**
 * Render the statistics trigger.
 * @param props - composed slot props.
 * @returns the trigger element tree.
 */
export function StatisticsEntry({ wide, t, api, useSessions }: StatisticsEntryProps) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => { setOpen(false) }, [])
  return (
    <>
      <Tooltip label={t('entry.tooltip')} delayMs={500} disabled={wide}>
        <button
          type="button"
          className={clsx(css.trigger, !wide && css.rail)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={t('entry.label')}
          onClick={() => { setOpen(true) }}
        >
          <IconDataOutline16 className={css.icon} size={wide ? 14 : 18} />
          {wide && <span className={css.triggerLabel}>{t('entry.label')}</span>}
        </button>
      </Tooltip>
      {open && (
        <StatisticsPanel
          title={t('panel.title')}
          closeLabel={t('panel.close')}
          api={api}
          useSessions={useSessions}
          t={t}
          onClose={close}
        />
      )}
    </>
  )
}
