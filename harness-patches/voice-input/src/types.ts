/**
 * Voice-input durable settings vocabulary. The desktop shell bridge reads
 * these fields when transcribing a recorded clip; nothing here is model-visible.
 */
import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the voice-input plugin. */
export const VOICE_INPUT_NAMESPACE = 'voice-input'

/** Durable voice-input settings (Volcengine speech credentials). */
export interface VoiceInputSettings {
  /** Whether hold-space recording is enabled. */
  enabled: boolean
  /** Volcengine speech App ID. */
  appId: string
  /** Volcengine speech Access Token (not displayed in plain text). */
  accessToken: string
  /** Volcengine speech Secret Key (reserved for future streaming use). */
  secretKey: string
  /** Volcengine ASR cluster id (default: volcengine_asr_common). */
  cluster: string
}

/** Settings-boundary schema for the voice-input namespace. */
export const VoiceInputSettingsSchema: z<VoiceInputSettings> = z.object({
  enabled: z.boolean().default(false),
  appId: z.string().default(''),
  accessToken: z.string().default(''),
  secretKey: z.string().default(''),
  cluster: z.string().default('volcengine_asr_common'),
})
