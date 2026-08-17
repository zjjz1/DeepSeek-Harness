/**
 * Voice-input composer dock: hold-Space recording, Doubao-desktop style.
 * While the composer textarea is focused, holding Space past the threshold
 * replaces the composer area with a full voice-input overlay (mic icon, state
 * text, cancel hint); releasing stops and transcribes through the desktop
 * shell bridge, then submits the text (prefixed with whatever was already
 * typed) as the next message. Esc or a second tap of Space cancels; the
 * 60-second cap auto-sends.
 *
 * Interaction contract:
 * - A quick tap (< threshold) is an ordinary space: nothing renders, no
 *   recording — the composer simply receives its space character.
 * - The overlay appears ONLY once recording actually begins (after the hold
 *   threshold AND the microphone is live), never during the silent hold
 *   window, so typing with spaces is never disturbed.
 * - Every keyup resets the hold state (and aborts a still-initializing
 *   recording), so the gesture always starts fresh on the next press.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { VoiceRecorder } from './record.ts'
import type { createVoiceInputStore } from './voice-input-store.ts'
import css from './VoiceInputHint.module.css'

/** Hold threshold before recording starts (ms). */
const HOLD_THRESHOLD_MS = 500
/** Hard recording cap (seconds). */
const MAX_SECONDS = 60
/** Notice lifetime (ms). */
const NOTICE_MS = 4000

/** Empty injected face: the dock row only reads the shared store. */
export interface VoiceInputHintInjected {}

/** Full component props: the dock seat + shared store + locale + (empty) injected face. */
export type VoiceInputHintProps =
  PropsRuntime<'conversation.input.dock'> & PropsStore<ReturnType<typeof createVoiceInputStore>>
  & PropsLocale<'ui-voice-input'> & VoiceInputHintInjected

type Phase = 'idle' | 'recording' | 'transcribing'

/** Whether the given element is inside the composer's textarea (the active input surface). */
function isComposerTarget(target: Element | null): boolean {
  if (target === null) return false
  if (target.tagName === 'TEXTAREA') return true
  return target.closest('[data-composer-card]') !== null
    || target.closest('[data-composer-seat]') !== null
}

/**
 * Render the voice-input dock and drive the hold-space lifecycle.
 * @param props - dock seat + shared store + locale.
 * @returns the dock row (hidden while idle).
 */
export function VoiceInputHint({ inputActions, useStore, useInput, t }: VoiceInputHintProps) {
  const enabled = useStore(s => s.enabled)
  const appId = useStore(s => s.appId)
  const accessToken = useStore(s => s.accessToken)
  const secretKey = useStore(s => s.secretKey)
  const cluster = useStore(s => s.cluster)
  const draft = useInput(s => s.draft)
  const [phase, setPhase] = useState<Phase>('idle')
  const [notice, setNotice] = useState<string | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const recorderRef = useRef<VoiceRecorder | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const spaceHeldRef = useRef(false)
  /** Set when the user releases before the mic is live; beginRecording honors it. */
  const abortedRef = useRef(false)
  /** Draft at the moment Space went down (restored when recording starts, then
   *  prefixed onto the transcript on send). */
  const prefixRef = useRef('')

  // Xunfei speed transcription needs all three credentials (AppID/APIKey/APISecret).
  const configured = enabled && appId.trim() !== '' && accessToken.trim() !== '' && secretKey.trim() !== ''

  const showNotice = useCallback((message: string) => {
    setNotice(message)
    if (noticeTimer.current !== undefined) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => { setNotice(null) }, NOTICE_MS)
  }, [])

  const clearHoldTimer = useCallback(() => {
    if (holdTimer.current !== undefined) {
      clearTimeout(holdTimer.current)
      holdTimer.current = undefined
    }
  }, [])

  const resetAll = useCallback(() => {
    clearHoldTimer()
    recorderRef.current?.cancel()
    recorderRef.current = null
    spaceHeldRef.current = false
    abortedRef.current = false
    setPhase('idle')
  }, [clearHoldTimer])

  const cancelWithNotice = useCallback(() => {
    resetAll()
    showNotice(t('hint.cancelled'))
  }, [resetAll, showNotice, t])

  const beginRecording = useCallback(async (): Promise<void> => {
    // The user may have released during mic initialization.
    if (abortedRef.current || !spaceHeldRef.current) {
      setPhase('idle')
      return
    }
    if (!configured) {
      showNotice(t('hint.unconfigured'))
      setPhase('idle')
      return
    }
    if (typeof navigator === 'undefined' || navigator.mediaDevices?.getUserMedia === undefined) {
      showNotice(t('hint.micDenied'))
      setPhase('idle')
      return
    }
    // Restore the pre-press draft (drop the space the hold produced).
    inputActions.setDraft(prefixRef.current)
    const recorder = new VoiceRecorder(
      {
        appId: appId.trim(),
        accessToken: accessToken.trim(),
        secretKey: secretKey.trim(),
        cluster: cluster.trim() || 'volcengine_asr_common',
      },
      MAX_SECONDS,
      {
        onState: (state) => {
          if (state === 'max-duration') showNotice(t('hint.maxDuration'))
          if (state === 'cancelled') {
            setPhase('idle')
            showNotice(t('hint.cancelled'))
          }
        },
        onText: (text) => {
          setPhase('idle')
          const cleaned = text.trim()
          if (cleaned === '') {
            showNotice(t('hint.error', { message: '空文本' }))
            return
          }
          // 拼接：先前输入的文字 + 空格 + 语音识别文本，一起发送
          const prefix = prefixRef.current.trimEnd()
          const combined = prefix === '' ? cleaned : `${prefix} ${cleaned}`
          inputActions.setDraft(combined)
          inputActions.submit()
        },
        onError: (message) => {
          setPhase('idle')
          showNotice(t('hint.error', { message }))
        },
      },
    )
    recorderRef.current = recorder
    try {
      await recorder.start()
    } catch {
      recorderRef.current = null
      setPhase('idle')
      showNotice(t('hint.micDenied'))
      return
    }
    // Mic is live: only now show the overlay. (If the user released while
    // getUserMedia was pending, stop immediately.)
    if (abortedRef.current || !spaceHeldRef.current) {
      recorder.cancel()
      recorderRef.current = null
      setPhase('idle')
      return
    }
    setPhase('recording')
  }, [configured, inputActions, showNotice, appId, accessToken, secretKey, cluster, t])

  // Capture phase: runs before InputBar's own key handling.
  const onCaptureKeyDown = useCallback((event: KeyboardEvent): void => {
    if (event.code !== 'Space') return
    // Recording: a fresh (non-repeat) Space press cancels; repeats swallowed.
    if (recorderRef.current?.active === true) {
      event.preventDefault()
      event.stopPropagation()
      if (!event.repeat) cancelWithNotice()
      return
    }
    // Space is held (hold window or recording): swallow auto-repeat so the
    // composer never accumulates spaces while the gesture is active.
    if (spaceHeldRef.current) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (event.repeat) return
    // Only when the composer is the focus target and the feature is set up.
    if (!isComposerTarget(document.activeElement)) return
    if (!configured) return
    // First press: silent hold window. Nothing renders yet — a quick tap is
    // an ordinary space. Record the prefix and arm the threshold timer.
    spaceHeldRef.current = true
    abortedRef.current = false
    prefixRef.current = draft
    clearHoldTimer()
    holdTimer.current = setTimeout(() => {
      holdTimer.current = undefined
      void beginRecording()
    }, HOLD_THRESHOLD_MS)
  }, [beginRecording, cancelWithNotice, clearHoldTimer, configured, draft])

  const onCaptureKeyUp = useCallback((event: KeyboardEvent): void => {
    if (event.code !== 'Space') return
    spaceHeldRef.current = false
    if (holdTimer.current !== undefined) {
      // Below the threshold: an ordinary space press; its keydown already
      // produced the space character. Stay completely silent.
      clearHoldTimer()
      setPhase('idle')
      return
    }
    if (recorderRef.current?.active === true) {
      event.preventDefault()
      event.stopPropagation()
      recorderRef.current.stop()
      recorderRef.current = null
      setPhase('transcribing')
      return
    }
    if (recorderRef.current !== null || phase !== 'idle') {
      // Released while the mic was still initializing: abort the pending
      // recording (beginRecording checks abortedRef after getUserMedia).
      abortedRef.current = true
      if (recorderRef.current !== null) {
        recorderRef.current.cancel()
        recorderRef.current = null
      }
      setPhase('idle')
      return
    }
  }, [clearHoldTimer, phase])

  const onCaptureEscape = useCallback((event: KeyboardEvent): void => {
    if (event.code === 'Escape' && recorderRef.current?.active === true) {
      event.preventDefault()
      event.stopPropagation()
      cancelWithNotice()
    }
  }, [cancelWithNotice])

  // Handlers live behind a ref so the document listeners bind ONCE (empty
  // deps). Rebinding on every render would tear the listeners down mid-gesture
  // and clear the hold timer (a draft change from the very space keypress
  // triggers a re-render), silently killing the hold→record transition.
  const handlersRef = useRef({
    keyDown: (_event: KeyboardEvent) => {},
    keyUp: (_event: KeyboardEvent) => {},
    escape: (_event: KeyboardEvent) => {},
  })
  handlersRef.current.keyDown = onCaptureKeyDown
  handlersRef.current.keyUp = onCaptureKeyUp
  handlersRef.current.escape = onCaptureEscape

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => { handlersRef.current.keyDown(event) }
    const keyUp = (event: KeyboardEvent) => { handlersRef.current.keyUp(event) }
    const escape = (event: KeyboardEvent) => { handlersRef.current.escape(event) }
    document.addEventListener('keydown', keyDown, true)
    document.addEventListener('keyup', keyUp, true)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('keydown', keyDown, true)
      document.removeEventListener('keyup', keyUp, true)
      document.removeEventListener('keydown', escape, true)
    }
  }, [])

  // Component-unmount cleanup only (never re-run on re-render).
  useEffect(() => () => {
    clearHoldTimer()
    recorderRef.current?.cancel()
    recorderRef.current = null
    if (noticeTimer.current !== undefined) clearTimeout(noticeTimer.current)
  }, [clearHoldTimer])

  if (phase === 'idle' && notice === null) return null

  const active = phase === 'recording' || phase === 'transcribing'
  const hintText = phase === 'recording'
    ? t('hint.recording')
    : phase === 'transcribing'
      ? t('hint.transcribing')
      : notice

  return (
    <div className={css.overlay} data-phase={phase} role="status" aria-live="polite">
      <div className={css.overlayCard}>
        <div className={css.micWrap} data-active={active || undefined}>
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 14.5a2.5 2.5 0 0 0 2.5-2.5V6a2.5 2.5 0 0 0-5 0v6a2.5 2.5 0 0 0 2.5 2.5Zm4.9-2.5a4.9 4.9 0 0 1-9.8 0H5.5a6.5 6.5 0 0 0 5.75 6.46V21.5h1.5v-3.04a6.5 6.5 0 0 0 5.75-6.46h-1.6Z"
            />
          </svg>
        </div>
        <div className={css.state}>{hintText}</div>
        {!configured && phase !== 'transcribing' && (
          <div className={css.hintLine}>{t('hint.unconfigured')}</div>
        )}
        <div className={css.cancelLine}>{t('hint.recording')}</div>
      </div>
    </div>
  )
}
