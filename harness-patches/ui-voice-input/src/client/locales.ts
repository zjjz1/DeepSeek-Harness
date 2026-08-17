/** `ui-voice-input` namespace dictionaries. */

export const zh = {
  'settings.title': '语音输入',
  'settings.description': '长按空格键说话，松开自动识别并发送',
  'settings.configure': '配置',
  'settings.close': '关闭',
  'settings.enabled': '启用语音输入',
  'settings.appId': 'App ID（讯飞）',
  'settings.accessToken': 'APIKey（讯飞）',
  'settings.secretKey': 'APISecret（讯飞）',
  'settings.cluster': 'Cluster（火山遗留）',
  'settings.clusterHint': '讯飞无需填写，可留空',
  'settings.hint': '凭证保存在本地设置中，仅用于向讯飞「录音文件转写极速版」发送请求。',
  'hint.holding': '长按空格键开始语音输入…',
  'hint.recording': '🎙 正在语音输入…松开空格发送 · 按 Esc 或再次轻点空格取消',
  'hint.transcribing': '正在识别…',
  'hint.unconfigured': '语音输入未配置：请先在设置-语音输入中填写 App ID / APIKey / APISecret',
  'hint.desktopOnly': '语音输入仅在桌面端可用',
  'hint.micDenied': '无法访问麦克风：请在系统设置中允许 DeepSeek Harness 使用麦克风',
  'hint.error': '语音识别失败：{message}',
  'hint.cancelled': '已取消语音输入',
  'hint.maxDuration': '已达 60 秒上限，自动发送',
} satisfies Record<string, string>

export type VoiceInputKey = keyof typeof zh

export const en = {
  'settings.title': 'Voice input',
  'settings.description': 'Hold Space to speak; release to transcribe and send',
  'settings.configure': 'Configure',
  'settings.close': 'Close',
  'settings.enabled': 'Enable voice input',
  'settings.appId': 'App ID (iFlytek)',
  'settings.accessToken': 'APIKey (iFlytek)',
  'settings.secretKey': 'APISecret (iFlytek)',
  'settings.cluster': 'Cluster (Volcengine legacy)',
  'settings.clusterHint': 'Not needed by iFlytek; leave empty',
  'settings.hint': 'Credentials are stored locally and only sent to iFlytek speed transcription.',
  'hint.holding': 'Hold Space to start voice input…',
  'hint.recording': '🎙 Listening… release Space to send · Esc or tap Space to cancel',
  'hint.transcribing': 'Transcribing…',
  'hint.unconfigured': 'Voice input is not configured: fill in App ID / APIKey / APISecret in Settings',
  'hint.desktopOnly': 'Voice input is only available in the desktop app',
  'hint.micDenied': 'Microphone unavailable: allow DeepSeek Harness to use the microphone',
  'hint.error': 'Transcription failed: {message}',
  'hint.cancelled': 'Voice input cancelled',
  'hint.maxDuration': '60-second limit reached, sending',
} satisfies Record<VoiceInputKey, string>

export const NS = 'ui-voice-input'
