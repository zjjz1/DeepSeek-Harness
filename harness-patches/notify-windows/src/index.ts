/**
 * Windows desktop notification plugin: raises a native toast when an agent
 * turn completes or a scheduled reminder fires, so a backgrounded session
 * still surfaces "X completed task Y in Z seconds" and "reminder: ...". The
 * Windows host shell (powershell.exe + the WinRT toast API) is the only
 * delivery channel; on a non-Windows host the plugin is inert.
 *
 * Toast branding (the QQ-style app avatar) comes from a Start-Menu shortcut
 * registered under the plugin's AUMID: WinRT shows the shortcut's icon on
 * the toast left edge for unpackaged apps. The shortcut target is the app's
 * own exe, handed over by the desktop shell via `DSH_APP_EXE` (fallback:
 * the Program Files install path; none found → plain text toast without the
 * shortcut step).
 *
 * The plugin subscribes to the session/event firehose and watches for:
 * - `turn/end` with `reason.kind === 'completed'` → "title · 助手已完成任务（用时 X 秒）";
 * - `schedule/change` with `operation === 'dispatch'` → the reminder prompt
 *   (replayed from the log) under the session title.
 * It owns no persistence and emits no events — pure presentation-telemetry.
 *
 * @module @deepseek-ai/dsh-notify-windows
 */
import { spawn } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'

/** Entry AUMID the toast registers under; a plain non-empty string is enough on Windows 10+. */
const APP_ID = 'DeepSeek Harness'

/** Powershell fragment: register the branded Start-Menu shortcut + AUMID once. */
const ENSURE_SHORTCUT_SCRIPT = `
$exe = $env:DSH_APP_EXE
if (-not $exe -or -not (Test-Path $exe)) {
  $candidate = Join-Path $env:ProgramFiles 'DeepSeek Harness\\DeepSeek Harness.exe'
  if (Test-Path $candidate) { $exe = $candidate }
}
if ($exe) {
  $marker = Join-Path $env:TEMP 'dsh-toast-aumid.txt'
  $current = if (Test-Path $marker) { Get-Content $marker -Raw } else { '' }
  if ($current -ne $exe) {
    $lnk = Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs\\DeepSeek Harness.lnk'
    $ws = New-Object -ComObject WScript.Shell
    $sc = $ws.CreateShortcut($lnk)
    $sc.TargetPath = $exe
    $sc.IconLocation = "$exe,0"
    $sc.Save()
    New-Item -Path 'HKCU:\\Software\\Classes\\AppUserModelId\\DeepSeek Harness' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\\Software\\Classes\\AppUserModelId\\DeepSeek Harness' -Name 'DisplayName' -Value 'DeepSeek Harness'
    Set-Content -Path $marker -Value $exe
  }
}
`.trim()

/** Powershell fragment: raise one two-line toast (title + body). */
const TOAST_SCRIPT = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.Data.Xml.Dom.XmlDocument, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$text = $template.GetElementsByTagName("text")
$text.Item(0).AppendChild($template.CreateTextNode(@@TITLE@@)) | Out-Null
$text.Item(1).AppendChild($template.CreateTextNode(@@BODY@@)) | Out-Null
$toast = [Windows.UI.Notifications.ToastNotification]::new($template)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier(@@APPID@@).Show($toast)
`.trim()

/** Escape a payload value for the PowerShell command-line as a single-quoted literal. */
function psQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

/**
 * Resolve the session title for the notification body. Reads the latest
 * `session/title` event from the log (owned by the base-bundle session-title
 * row, whose type extends SessionEventMap in that package); the lookup is typed
 * loosely here to keep this package free of a session-title dependency. Falls
 * back to "DeepSeek Harness" when no title exists yet.
 * @param session - the session whose title to read.
 * @returns a non-empty title string.
 */
function sessionTitle(session: Session): string {
  const events = session.events as readonly { type: string; data?: { title?: unknown } }[]
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event?.type === 'session/title' && typeof event.data?.title === 'string') {
      return event.data.title
    }
  }
  return 'DeepSeek Harness'
}

/**
 * Replay the reminder prompt for one dispatched schedule id from the session
 * log: the nearest `schedule/change` create record carrying that id.
 * @param session - the session whose log to replay.
 * @param dispatchId - the schedule id from a dispatch record.
 * @returns the reminder prompt, or null when no matching create record exists.
 */
export function reminderPrompt(session: Session, dispatchId: string): string | null {
  const events = session.events as readonly {
    type: string
    data?: { operation?: unknown; schedule?: { id?: unknown; prompt?: unknown } }
  }[]
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event?.type !== 'schedule/change') continue
    const data = event.data
    if (data?.operation === 'create' && data.schedule?.id === dispatchId) {
      const prompt = typeof data.schedule.prompt === 'string' ? data.schedule.prompt.trim() : ''
      return prompt === '' ? null : prompt
    }
  }
  return null
}

/**
 * Compute the turn's wall time in whole seconds from the log: the matching
 * `turn/start` timestamp subtracted from the `turn/end` timestamp. Returns null
 * when the start marker is absent (forward-compatible logs).
 * @param session - the session containing the turn markers.
 * @param turn - the turn number closed by the observed `turn/end`.
 * @param endTime - the `turn/end` timestamp (ms).
 * @returns the duration in seconds, or null when unavailable.
 */
function turnDuration(session: Session, turn: number, endTime: number): number | null {
  for (let i = session.events.length - 1; i >= 0; i--) {
    const event = session.events[i]
    if (event?.type === 'turn/start' && (event.data as { turn?: unknown }).turn === turn) {
      const ms = endTime - event.time
      return Math.max(0, Math.round(ms / 1000))
    }
  }
  return null
}

/**
 * Dispatch one toast through powershell.exe's WinRT API. Spawned detached so
 * the agent loop never waits on the shell; failures are logged and swallowed —
 * a missing shell must not fail the turn it is announcing.
 * @param title - toast title.
 * @param body - toast body.
 */
function showToast(title: string, body: string): void {
  if (process.platform !== 'win32') return
  const script = [
    ENSURE_SHORTCUT_SCRIPT,
    TOAST_SCRIPT
      .replace('@@TITLE@@', psQuote(title))
      .replace('@@BODY@@', psQuote(body))
      .replace('@@APPID@@', psQuote(APP_ID)),
  ].join('; ')
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    stdio: 'ignore',
    windowsHide: true,
    detached: true,
  })
  child.on('error', () => { /* shell unavailable — notification is best-effort */ })
  child.unref()
}

/**
 * Register the turn-completion and reminder-dispatch toast listeners.
 * @param ctx - host cordis context carrying the session/event firehose.
 */
export function apply(ctx: Context): void {
  if (process.platform !== 'win32') return
  ctx.on('session/event', (session: Session, event: SessionEvent) => {
    if (event.type === 'turn/end') {
      const reason = event.data.reason as { kind?: unknown }
      if (reason?.kind !== 'completed') return
      const title = sessionTitle(session)
      const turn = (event.data as { turn?: unknown }).turn as number
      const duration = turnDuration(session, turn, event.time)
      const body = duration === null
        ? '任务完成'
        : `任务完成（用时 ${duration} 秒）`
      showToast(`${title} · 助手已完成任务`, body)
      return
    }
    // schedule/change is declared by the schedule package; view the event
    // loosely here to keep this package free of that dependency.
    const raw = event as unknown as { type: string; data?: { operation?: unknown; id?: unknown } }
    if (raw.type !== 'schedule/change') return
    const data = raw.data
    if (data?.operation !== 'dispatch' || typeof data.id !== 'string') return
    const prompt = reminderPrompt(session, data.id)
    if (prompt === null) return
    // QQ-style reminder toast: session title on top, the reminder below.
    showToast(sessionTitle(session), `提醒：${prompt}`)
  })
}
