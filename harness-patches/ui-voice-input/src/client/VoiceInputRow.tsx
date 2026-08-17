/**
 * Voice-input settings row: a title + description + configure button opening
 * a modal that edits the durable voice-input namespace (enable switch and the
 * Xunfei speed-transcription credentials). Secret fields render as password
 * inputs.
 *
 * Inputs buffer in local state and commit through the injected write callback
 * (the settings write is async over the wire; a fully store-controlled input
 * would swallow fast typing until the round trip lands). The committed values
 * mirror back from the shared store so external changes still surface.
 */
import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { createVoiceInputStore } from './voice-input-store.ts'
import css from './VoiceInputRow.module.css'

/** Mirrored voice-input settings view. */
export interface VoiceInputView {
  enabled: boolean
  appId: string
  accessToken: string
  secretKey: string
  cluster: string
}

/** Injected business face: settings writes. */
export interface VoiceInputRowInjected {
  /** Write one field. */
  setField: (field: keyof VoiceInputView, value: string | boolean) => void
}

/** Full component props: runtime share + shared store + locale seat + injected face. */
export type VoiceInputRowProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createVoiceInputStore>>
  & PropsLocale<'ui-voice-input'> & VoiceInputRowInjected

/** The default cluster when the field is empty. */
const DEFAULT_CLUSTER = 'volcengine_asr_common'

/**
 * Render the voice-input row and its credential editor.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function VoiceInputRow({ t, useStore, setField }: VoiceInputRowProps) {
  const [open, setOpen] = useState(false)
  const enabled = useStore(s => s.enabled)
  const appId = useStore(s => s.appId)
  const accessToken = useStore(s => s.accessToken)
  const secretKey = useStore(s => s.secretKey)
  const cluster = useStore(s => s.cluster)

  // Local input buffers: initialized from the store when the modal opens and
  // whenever the store value changes underneath (external edits), but never
  // clobbered mid-typing by the async write echo.
  const [draftEnabled, setDraftEnabled] = useState(false)
  const [draftAppId, setDraftAppId] = useState('')
  const [draftAccessToken, setDraftAccessToken] = useState('')
  const [draftSecretKey, setDraftSecretKey] = useState('')
  const [draftCluster, setDraftCluster] = useState('')

  useEffect(() => {
    if (!open) return
    setDraftEnabled(enabled)
    setDraftAppId(appId)
    setDraftAccessToken(accessToken)
    setDraftSecretKey(secretKey)
    setDraftCluster(cluster)
  }, [open, enabled, appId, accessToken, secretKey, cluster])

  // Xunfei speed transcription needs all three credentials (AppID/APIKey/APISecret).
  const configured = draftAppId.trim() !== '' && draftAccessToken.trim() !== '' && draftSecretKey.trim() !== ''

  const commit = (field: keyof VoiceInputView, value: string | boolean): void => {
    setField(field, value)
  }

  return (
    <div className={css.group}>
      <div className={css.rowText}>
        <div className={css.title}>{t('settings.title')}</div>
        <div className={css.desc}>{t('settings.description')}</div>
      </div>
      <button type="button" className={css.configure} onClick={() => { setOpen(true) }}>
        {t('settings.configure')}{enabled ? ' · ✓' : ''}
      </button>
      <Modal
        open={open}
        onClose={() => { setOpen(false) }}
        title={t('settings.title')}
        closeLabel={t('settings.close')}
        className={css.dialog as string}
      >
        <label className={css.switchRow}>
          <input
            type="checkbox"
            className={css.switch}
            checked={draftEnabled}
            onChange={(event) => {
              const next = event.target.checked
              setDraftEnabled(next)
              commit('enabled', next)
            }}
          />
          <span>{t('settings.enabled')}</span>
        </label>
        <label className={css.field}>
          <span className={css.fieldLabel}>{t('settings.appId')}</span>
          <input
            className={css.input}
            type="text"
            value={draftAppId}
            spellCheck={false}
            onChange={(event) => {
              const next = event.target.value
              setDraftAppId(next)
              commit('appId', next)
            }}
          />
        </label>
        <label className={css.field}>
          <span className={css.fieldLabel}>{t('settings.accessToken')}</span>
          <input
            className={css.input}
            type="password"
            value={draftAccessToken}
            spellCheck={false}
            onChange={(event) => {
              const next = event.target.value
              setDraftAccessToken(next)
              commit('accessToken', next)
            }}
          />
        </label>
        <label className={css.field}>
          <span className={css.fieldLabel}>{t('settings.secretKey')}</span>
          <input
            className={css.input}
            type="password"
            value={draftSecretKey}
            spellCheck={false}
            onChange={(event) => {
              const next = event.target.value
              setDraftSecretKey(next)
              commit('secretKey', next)
            }}
          />
        </label>
        <label className={css.field}>
          <span className={css.fieldLabel}>{t('settings.cluster')}</span>
          <input
            className={css.input}
            type="text"
            value={draftCluster}
            placeholder={DEFAULT_CLUSTER}
            spellCheck={false}
            onChange={(event) => {
              const next = event.target.value
              setDraftCluster(next)
              commit('cluster', next)
            }}
          />
          <span className={css.fieldHint}>{t('settings.clusterHint')}</span>
        </label>
        <div className={css.hint}>{t('settings.hint')}</div>
        {configured && draftEnabled && <div className={css.ready}>✓</div>}
      </Modal>
    </div>
  )
}
