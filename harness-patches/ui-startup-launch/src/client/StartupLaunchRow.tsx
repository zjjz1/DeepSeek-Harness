/**
 * Startup-launch preference row registered into the General section item
 * slot: a title + description + three-way select (off / on / silent).
 * The preference lives in the desktop shell (Electron `setLoginItemSettings`),
 * reached through the webview preload bridge `window.__dshDesktop__`; when the
 * bridge is absent (plain browser) the row shows a disabled hint instead.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './StartupLaunchRow.module.css'

/** One selectable startup mode, matching the shell's `startupLaunch` setting. */
export type StartupLaunchMode = 'off' | 'on' | 'background'

/** Full component props: runtime share + locale seat. */
export type StartupLaunchRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsLocale<'ui-startup-launch'>

/** Desktop shell bridge exposed by the webview preload (absent in browsers). */
interface DshDesktopBridge {
  getStartupLaunch(): Promise<StartupLaunchMode>
  setStartupLaunch(mode: StartupLaunchMode): Promise<boolean>
}

const MODES: readonly StartupLaunchMode[] = ['off', 'on', 'background']

/** Read the shell bridge, tolerating its absence. */
function desktopBridge(): DshDesktopBridge | undefined {
  const candidate = (globalThis as { __dshDesktop__?: unknown }).__dshDesktop__
  if (candidate !== null && typeof candidate === 'object'
    && typeof (candidate as DshDesktopBridge).getStartupLaunch === 'function'
    && typeof (candidate as DshDesktopBridge).setStartupLaunch === 'function') {
    return candidate as DshDesktopBridge
  }
  return undefined
}

/**
 * Render the startup-launch row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function StartupLaunchRow({ t }: StartupLaunchRowComponentProps) {
  const bridge = desktopBridge()
  const [mode, setMode] = useState<StartupLaunchMode>('off')
  const [saved, setSaved] = useState(false)
  const [ready, setReady] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    let alive = true
    if (bridge === undefined) {
      setReady(true)
      return
    }
    void bridge.getStartupLaunch().then((current) => {
      if (!alive) return
      setMode(current)
      setReady(true)
    }).catch(() => {
      if (!alive) return
      setReady(true)
    })
    return () => {
      alive = false
      if (savedTimer.current !== undefined) clearTimeout(savedTimer.current)
    }
  }, [bridge])

  const change = useCallback((next: StartupLaunchMode) => {
    if (bridge === undefined) return
    setMode(next)
    setSaved(false)
    void bridge.setStartupLaunch(next).then((accepted) => {
      if (!accepted) return
      setSaved(true)
      if (savedTimer.current !== undefined) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => { setSaved(false) }, 1600)
    })
  }, [bridge])

  if (!ready) return null
  if (bridge === undefined) {
    return (
      <div className={css.group}>
        <div className={css.rowText}>
          <div className={css.title}>{t('startup.title')}</div>
          <div className={css.desc}>{t('startup.description')}</div>
        </div>
        <span className={css.unavailable}>{t('startup.unavailable')}</span>
      </div>
    )
  }
  return (
    <div className={css.group}>
      <div className={css.rowText}>
        <div className={css.title}>{t('startup.title')}</div>
        <div className={css.desc}>{t('startup.description')}</div>
        {saved && <div className={css.saved}>{t('startup.saved')}</div>}
      </div>
      <div className={css.modes}>
        {MODES.map((value) => (
          <label key={value} className={css.mode}>
            <input
              type="radio"
              name="startup-launch"
              className={css.input}
              checked={mode === value}
              onChange={() => { change(value) }}
            />
            <span className={css.modeLabel}>{t(value === 'off' ? 'startup.off' : value === 'on' ? 'startup.on' : 'startup.background')}</span>
          </label>
        ))}
      </div>
      {mode === 'background' && <div className={css.hint}>{t('startup.backgroundHint')}</div>}
    </div>
  )
}
