/**
 * Sidebar-foot entry that opens the plugin market modal. Renders the compact
 * 34px row in the wide column and the 36px rail circle when collapsed — the
 * same rhythm as the Settings trigger. Modal open state is component-local
 * viewing state; the panel receives the locale seat, the inventory read face,
 * and the close callback.
 */
import { useCallback, useState } from 'react'
import clsx from 'clsx'
import { IconBrowseOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { PluginMarketPanel } from './PluginMarketPanel.tsx'
import type { PluginMarketInjected } from './index.ts'
import css from './PluginMarketEntry.module.css'

/** Entry props: the sidebar column state, the inventory read, and the locale seat. */
export type PluginMarketEntryProps =
  PropsRuntime<'sidebar.footer.action'> & PluginMarketInjected & PropsLocale<'pluginMarket'>

/**
 * Render the plugin market trigger.
 * @param props - composed slot props.
 * @returns the trigger element tree.
 */
export function PluginMarketEntry({ wide, t, list }: PluginMarketEntryProps) {
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
          <IconBrowseOutline16 className={css.icon} size={wide ? 14 : 18} />
          {wide && <span className={css.triggerLabel}>{t('entry.label')}</span>}
        </button>
      </Tooltip>
      {open && (
        <PluginMarketPanel
          title={t('panel.title')}
          closeLabel={t('panel.close')}
          list={list}
          onClose={close}
          t={t}
        />
      )}
    </>
  )
}
