/** Browser plugin owning the read-aloud assistant action. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { SpeakAction } from './SpeakAction.tsx'
import { en, NS, zh, type SpeechKey } from './locales.ts'

export type { SpeechKey } from './locales.ts'
export type { SpeakActionProps } from './SpeakAction.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The read-aloud action copy. */
    'ui-speech': SpeechKey
  }
}

/** Services required by the speech action. */
export const inject = ['slots', 'locale']

/**
 * Register the read-aloud action into the assistant-message action strip.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-speech: dictionaries')

  ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions',
    id: 'speak',
    order: 20,
    locale: NS,
    inject: (): Record<string, never> => ({}),
  }, SpeakAction))
}
