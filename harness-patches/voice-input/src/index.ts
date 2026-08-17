/**
 * Voice-input plugin: registers the durable settings namespace consumed by
 * the desktop shell's transcription bridge (the browser half cannot hold the
 * credentials, and the shell owns the Volcengine HTTP call).
 *
 * @module @deepseek-ai/dsh-voice-input
 */
import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { VOICE_INPUT_NAMESPACE, VoiceInputSettingsSchema } from './types.ts'

/** Services required by the voice-input plugin. */
export const inject = ['settings']

/**
 * Register the voice-input settings namespace.
 * @param ctx - host cordis context.
 */
export function apply(ctx: Context): void {
  ctx.settings.register(settingsNamespace(VOICE_INPUT_NAMESPACE), VoiceInputSettingsSchema)
}
