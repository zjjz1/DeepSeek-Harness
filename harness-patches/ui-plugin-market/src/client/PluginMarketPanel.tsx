/**
 * Plugin market modal: the centered dialog (same overlay/mask/panel family as
 * the Settings shell) with two tabs — the read-only local plugin inventory
 * (Host Loader snapshot via the pluginInventory Remote) and the online market
 * iframe (GitHub Pages portal, with load / open-in-browser affordances
 * because cross-origin frames cannot report their own failures). "Open in
 * browser" goes through the desktop shell bridge (window.__dshDesktop__.
 * openExternal → shell.openExternal) when present — window.open inside the
 * Electron webview is otherwise a silent no-op — and falls back to a new tab
 * in plain browsers. Close paths: the header button, a mask click, and
 * document-level Escape (mounted only while open, so the listener lifetime is
 * the panel's).
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import type { PluginMarketKey } from './locales.ts'
import css from './PluginMarketPanel.module.css'

/**
 * Default plugin market URL. Points at the zero-dependency static web portal
 * for the awesome-dsh-plugin curated list (discover/filter/one-click install of
 * community plugins). A deployment replaces this constant to point the iframe
 * at its own market (note: on hosts without GitHub reachability, swap in a
 * mirror or a locally served static portal).
 */
export const DEFAULT_PLUGIN_MARKET_URL = 'https://cooljser.github.io/dsh-plugin-portal/'

/** Panel props: chrome strings, the inventory read face, and the close callback. */
export interface PluginMarketPanelProps {
  /** Dialog title text; also the iframe's accessible name. */
  title: string
  /** Close-button accessible label. */
  closeLabel: string
  /** Read a current Host Loader inventory snapshot (local tab). */
  list: () => Promise<PluginInventorySnapshot>
  /** Close the modal. */
  onClose: () => void
  /** Locale seat (tabs, list labels, toolbar copy). */
  t: (key: PluginMarketKey) => string
}

type InventoryEntry = PluginInventorySnapshot['entries'][number]
type InventoryView =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; entries: readonly InventoryEntry[] }

const PHASE_KEYS: Record<string, PluginMarketKey> = {
  pending: 'panel.localPhasePending',
  loading: 'panel.localPhaseLoading',
  active: 'panel.localPhaseActive',
  failed: 'panel.localPhaseFailed',
  unloading: 'panel.localPhaseUnloading',
}

/** Compact a module specifier without guessing whether its Loader id was generated. */
function moduleShortName(moduleName: string): string {
  const unscoped = moduleName.startsWith('@') ? moduleName.slice(moduleName.indexOf('/') + 1) : moduleName
  return unscoped
    .replace(/^cordis:/, '')
    .replace(/^cordis-plugin-/, '')
    .replace(/^dsh-(?:host-|client-)?/, '')
}

/**
 * Open a URL in the system default browser. Inside the desktop shell the
 * webview bridge routes the request through Electron's shell.openExternal
 * (window.open is a silent no-op in the guest); plain browsers fall back to a
 * new tab.
 * @param url - the external http(s) URL to open.
 */
function openInBrowser(url: string): void {
  const bridge = (globalThis as { __dshDesktop__?: { openExternal?: (url: string) => unknown } }).__dshDesktop__
  if (typeof bridge?.openExternal === 'function') {
    void bridge.openExternal(url)
  } else {
    window.open(url, '_blank', 'noopener')
  }
}

/**
 * Render the centered plugin market dialog.
 * @param props - chrome strings, inventory read, and the close callback.
 * @returns the modal element tree.
 */
export function PluginMarketPanel({ title, closeLabel, list, onClose, t }: PluginMarketPanelProps) {
  const titleId = useId()
  const [tab, setTab] = useState<'local' | 'online'>('local')
  const [inventory, setInventory] = useState<InventoryView>({ status: 'loading' })
  const [frameLoading, setFrameLoading] = useState(true)
  const [frameLoaded, setFrameLoaded] = useState(false)

  const reloadInventory = useCallback(() => {
    setInventory({ status: 'loading' })
    void list().then((snapshot) => {
      setInventory({ status: 'ready', entries: snapshot.entries })
    }).catch(() => {
      setInventory({ status: 'error' })
    })
  }, [list])

  useEffect(() => {
    if (tab === 'local' && inventory.status === 'loading') reloadInventory()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the tab switch triggers a (re)load
  }, [tab])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  // Baseline focus management: entering the dialog lands on the close button.
  const closeButton = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { closeButton.current?.focus() }, [])

  return (
    <div className={css.overlay} role="presentation">
      <div className={css.mask} aria-hidden="true" onClick={onClose} />
      <div className={css.panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={css.header}>
          <div className={css.title} id={titleId}>{title}</div>
          <div className={css.tabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'local'}
              className={css.tab}
              onClick={() => { setTab('local') }}
            >
              {t('panel.tabLocal')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'online'}
              className={css.tab}
              onClick={() => { setTab('online') }}
            >
              {t('panel.tabOnline')}
            </button>
          </div>
          <button ref={closeButton} type="button" className={css.close} onClick={onClose}>
            <IconCloseOutline16 size={14} />
            <span className={css.hiddenLabel}>{closeLabel}</span>
          </button>
        </div>
        {tab === 'local' && (
          <div className={css.localBody}>
            {inventory.status === 'loading' && <div className={css.status}>{t('panel.localLoading')}</div>}
            {inventory.status === 'error' && (
              <div className={css.status}>
                <span>{t('panel.localError')}</span>
                <button type="button" className={css.linkButton} onClick={reloadInventory}>
                  {t('panel.localRetry')}
                </button>
              </div>
            )}
            {inventory.status === 'ready' && inventory.entries.length === 0 && (
              <div className={css.status}>{t('panel.localEmpty')}</div>
            )}
            {inventory.status === 'ready' && inventory.entries.length > 0 && (
              <ul className={css.inventory}>
                {inventory.entries.map(entry => (
                  <li key={entry.entryId} className={css.inventoryRow}>
                    <span className={css.inventoryName} title={entry.moduleName}>{moduleShortName(entry.moduleName)}</span>
                    <span className={css.inventoryMeta}>{entry.entryId}</span>
                    <span className={entry.enabled ? css.badgeEnabled : css.badgeDisabled}>
                      {entry.enabled ? t('panel.localEnabled') : t('panel.localDisabled')}
                    </span>
                    <span className={css.phase}>
                      {t(entry.fiberPhase === null ? 'panel.localPhaseUnobserved' : PHASE_KEYS[entry.fiberPhase] ?? 'panel.localPhaseUnobserved')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {tab === 'online' && (
          <div className={css.onlineBody}>
            <div className={css.toolbar}>
              <span className={css.note}>{t('panel.onlineNote')}</span>
              <button
                type="button"
                className={css.linkButton}
                onClick={() => { openInBrowser(DEFAULT_PLUGIN_MARKET_URL) }}
              >
                {t('panel.onlineOpen')}
              </button>
            </div>
            {!frameLoaded && (
              <div className={css.onlineHint}>
                <span>{t('panel.onlineHint')}</span>
                <button
                  type="button"
                  className={css.linkButton}
                  onClick={() => { setFrameLoading(true); setFrameLoaded(true) }}
                >
                  {t('panel.onlineLoad')}
                </button>
              </div>
            )}
            {frameLoaded && frameLoading && <div className={css.status}>{t('panel.onlineLoading')}</div>}
            {frameLoaded && (
              <iframe
                className={css.frame}
                src={DEFAULT_PLUGIN_MARKET_URL}
                title={title}
                onLoad={() => { setFrameLoading(false) }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
