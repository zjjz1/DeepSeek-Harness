/**
 * Recording + transcription plumbing: MediaRecorder capture, WebM→16kHz
 * mono WAV conversion (no deps), and the desktop-shell bridge call. All pure
 * helpers are exported for tests; the bridge is a best-effort platform seam.
 */

/** Desktop shell bridge exposed by the webview preload (absent in browsers). */
export interface DesktopBridge {
  transcribeAudio(payload: {
    appId: string
    accessToken: string
    secretKey: string
    cluster: string
    data: string
  }): Promise<{ ok: true; text: string } | { ok: false; error: string }>
}

/** Resolve the shell bridge, tolerating its absence. */
export function desktopBridge(): DesktopBridge | undefined {
  const candidate = (globalThis as { __dshDesktop__?: unknown }).__dshDesktop__
  if (candidate !== null && typeof candidate === 'object'
    && typeof (candidate as DesktopBridge).transcribeAudio === 'function') {
    return candidate as DesktopBridge
  }
  return undefined
}

/** Resolve a 16 kHz mono WAV buffer from an audio blob (WebM/any decodable format). */
export async function blobToWavBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer()
  const AudioContextCtor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext
    ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (AudioContextCtor === undefined) throw new Error('no AudioContext')
  // Decode in an offline context (no playback), then resample to 16 kHz mono.
  const decoded = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(arrayBuffer)
  const sampleCount = Math.ceil(decoded.duration * 16000)
  const offline = new OfflineAudioContext(1, sampleCount, 16000)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  const rendered = await offline.startRendering()
  const channel = rendered.getChannelData(0)

  const pcm = new Int16Array(channel.length)
  for (let index = 0; index < channel.length; index++) {
    const sample = Math.max(-1, Math.min(1, channel[index]!))
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }

  const buffer = new ArrayBuffer(44 + pcm.length * 2)
  const view = new DataView(buffer)
  const writeString = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index++) view.setUint8(offset + index, text.charCodeAt(index))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + pcm.length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 16000, true)
  view.setUint32(28, 16000 * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, pcm.length * 2, true)
  new Int16Array(buffer, 44).set(pcm)

  const bytes = new Uint8Array(buffer)
  let binary = ''
  const CHUNK = 0x8000
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK))
  }
  return btoa(binary)
}

/** One full recording lifecycle owned by the hint component. */
export interface RecorderCallbacks {
  onState: (state: 'recording' | 'transcribing' | 'cancelled' | 'max-duration') => void
  onText: (text: string) => void
  onError: (message: string) => void
}

/** Live recorder: start captures the mic, stop produces the WAV and transcribes. */
export class VoiceRecorder {
  private stream: MediaStream | null = null
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private maxTimer: ReturnType<typeof setTimeout> | undefined

  /**
   * @param credentials - Xunfei speech credentials (AppID/APIKey/APISecret) for the bridge call.
   * @param maxSeconds - hard recording cap; reaching it auto-stops and sends.
   * @param callbacks - lifecycle notifications.
   */
  constructor(
    private readonly credentials: { appId: string; accessToken: string; secretKey: string; cluster: string },
    private readonly maxSeconds: number,
    private readonly callbacks: RecorderCallbacks,
  ) {}

  /** Whether a recording is in progress. */
  get active(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state === 'recording'
  }

  /** Start capturing the microphone. */
  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.chunks = []
    this.mediaRecorder = new MediaRecorder(this.stream)
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data)
    }
    this.mediaRecorder.onstop = () => { void this.finish() }
    this.mediaRecorder.start()
    this.maxTimer = setTimeout(() => {
      this.callbacks.onState('max-duration')
      this.stop()
    }, this.maxSeconds * 1000)
  }

  /** Stop recording and transcribe (or drop when cancelled). */
  stop(): void {
    if (this.maxTimer !== undefined) {
      clearTimeout(this.maxTimer)
      this.maxTimer = undefined
    }
    const recorder = this.mediaRecorder
    this.mediaRecorder = null
    if (recorder !== null && recorder.state !== 'inactive') recorder.stop()
    this.stream?.getTracks().forEach(track => track.stop())
    this.stream = null
  }

  /** Abort the recording without transcribing. */
  cancel(): void {
    if (this.maxTimer !== undefined) {
      clearTimeout(this.maxTimer)
      this.maxTimer = undefined
    }
    const recorder = this.mediaRecorder
    this.mediaRecorder = null
    if (recorder !== null && recorder.state !== 'inactive') recorder.stop()
    this.stream?.getTracks().forEach(track => track.stop())
    this.stream = null
    this.callbacks.onState('cancelled')
  }

  private async finish(): Promise<void> {
    const blob = new Blob(this.chunks, { type: this.mediaRecorder?.mimeType ?? 'audio/webm' })
    if (blob.size === 0) {
      this.callbacks.onError('录音为空')
      return
    }
    this.callbacks.onState('transcribing')
    const bridge = desktopBridge()
    if (bridge === undefined) {
      this.callbacks.onError('语音输入仅在桌面端可用')
      return
    }
    try {
      const data = await blobToWavBase64(blob)
      const result = await bridge.transcribeAudio({ ...this.credentials, data })
      if (result.ok) {
        this.callbacks.onText(result.text)
      } else {
        this.callbacks.onError(result.error)
      }
    } catch (cause: unknown) {
      this.callbacks.onError(cause instanceof Error ? cause.message : String(cause))
    }
  }
}
