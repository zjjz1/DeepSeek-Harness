/**
 * Voice-input rows slot store: a mirror of the durable voice-input namespace
 * (enable switch + Xunfei speed-transcription credentials). The plugin's
 * apply-world settings-scope listener is the only writer; the settings row and
 * the composer dock hint read via their respective props.useStore. One shared
 * handle serves both registrations so they never drift out of phase.
 */
import { defineStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { VoiceInputView } from './VoiceInputRow.tsx'

/** Store state mirrored from the settings snapshot. */
export interface VoiceInputStoreState {
  /** Whether hold-space recording is enabled. */
  enabled: boolean
  /** Xunfei speech App ID. */
  appId: string
  /** Xunfei APIKey (stored under the legacy field name). */
  accessToken: string
  /** Xunfei APISecret (stored under the legacy field name). */
  secretKey: string
  /** Legacy Volcengine cluster id; ignored by the Xunfei backend. */
  cluster: string
  /** Service revision; -1 until first sync so revision 0 lands as a change. */
  revision: number
}

/**
 * Declares the voice-input rows' shared state and write surface.
 * @returns the store handle.
 */
export function createVoiceInputStore() {
  return defineStore({
    init: (): VoiceInputStoreState => ({
      enabled: false,
      appId: '',
      accessToken: '',
      secretKey: '',
      cluster: '',
      revision: -1,
    }),
    actions: {
      sync: (d, view: VoiceInputView, revision: number) => {
        if (revision <= d.revision) return
        d.enabled = view.enabled
        d.appId = view.appId
        d.accessToken = view.accessToken
        d.secretKey = view.secretKey
        d.cluster = view.cluster
        d.revision = revision
      },
    },
  })
}
