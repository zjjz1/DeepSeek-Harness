/** `ui-speech` namespace dictionaries. */

export const zh = {
  'action.speak': '朗读',
  'action.stop': '停止',
} satisfies Record<string, string>

export type SpeechKey = keyof typeof zh

export const en = {
  'action.speak': 'Read aloud',
  'action.stop': 'Stop',
} satisfies Record<SpeechKey, string>

export const NS = 'ui-speech'
