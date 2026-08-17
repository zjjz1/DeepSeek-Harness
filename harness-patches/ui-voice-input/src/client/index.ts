/** Browser plugin owning the voice-input settings row and composer hint. */

import type { Context } from '@deepseek-ai/cordis'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: locale Context merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the 'settings.general.item' SlotMap row and ctx.settingsScope
// Context merge live in ui-settings; the dock slot lives in ui-conversation.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { VoiceInputRow, type VoiceInputRowInjected, type VoiceInputView } from './VoiceInputRow.tsx'
import { VoiceInputHint, type VoiceInputHintInjected } from './VoiceInputHint.tsx'
import { createVoiceInputStore } from './voice-input-store.ts'
import { en, NS, zh, type VoiceInputKey } from './locales.ts'

export type { VoiceInputKey } from './locales.ts'
export type { VoiceInputView } from './VoiceInputRow.tsx'
export type { VoiceInputRowInjected, VoiceInputRowProps } from './VoiceInputRow.tsx'
export type { VoiceInputHintInjected, VoiceInputHintProps } from './VoiceInputHint.tsx'
export type { VoiceInputStoreState } from './voice-input-store.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The voice-input settings row + hint copy. */
    'ui-voice-input': VoiceInputKey
  }
}

/** Services required by the voice-input plugin. */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

/** The empty cluster default when the field is unset. */
const DEFAULT_CLUSTER = 'volcengine_asr_common'

/**
 * Register the voice-input settings row and composer dock hint.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-voice-input: dictionaries')

  const host = ctx.settingsScope.bind<VoiceInputView>({ namespace: 'voice-input' })

  // One store handle per slot scope: the settings row lives in the root scope
  // and the composer dock in the session scope, and the framework mounts one
  // handle under exactly one scope ("one handle, one scope"). Both handles
  // mirror the same durable settings; the scope listener syncs both.
  const rowStore = createVoiceInputStore()
  const dockStore = createVoiceInputStore()
  let rowBound: BoundActions<typeof rowStore> | undefined
  let dockBound: BoundActions<typeof dockStore> | undefined
  let rowSeq = -1
  let dockSeq = -1

  const syncFromSettings = (): void => {
    const section = host.getSnapshot().value
    const view: VoiceInputView = {
      enabled: section?.enabled ?? false,
      appId: section?.appId ?? '',
      accessToken: section?.accessToken ?? '',
      secretKey: section?.secretKey ?? '',
      cluster: section?.cluster ?? DEFAULT_CLUSTER,
    }
    rowBound?.sync(view, ++rowSeq)
    dockBound?.sync(view, ++dockSeq)
  }

  ctx.effect(() => host.subscribe(syncFromSettings), 'ui-voice-input: settings adoption')

  const setField = (field: keyof VoiceInputView, value: string | boolean): void => {
    if (value === '') {
      void host.unset(field).catch((error: unknown) => {
        console.error('[ui-voice-input] unset failed', field, error)
      })
    } else {
      void host.set(field, value).catch((error: unknown) => {
        console.error('[ui-voice-input] set failed', field, error)
      })
    }
  }

  const rowInjected = (actions: BoundActions<typeof rowStore>): VoiceInputRowInjected => {
    if (rowBound === undefined) {
      rowBound = actions
      syncFromSettings()
    }
    return { setField }
  }

  const dockInjected = (_sessionId: string, actions: BoundActions<typeof dockStore>): VoiceInputHintInjected => {
    if (dockBound === undefined) {
      dockBound = actions
      syncFromSettings()
    }
    return {}
  }

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'voice-input',
    order: 70,
    store: rowStore,
    locale: NS,
    inject: rowInjected,
  }, VoiceInputRow))

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'voice-input',
    order: 10,
    store: dockStore,
    locale: NS,
    inject: dockInjected,
  }, VoiceInputHint))
}
