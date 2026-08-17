# @deepseek-ai/dsh-notify-windows

Windows desktop notification plugin: raises a native toast when an agent turn completes, so a backgrounded session still surfaces "«title» · 助手已完成任务 (用时 N 秒)".

## Model Experience

No model-visible surface: the plugin observes the `session/event` firehose but writes no session events, tools, or prompt content.

## Known Limitations and Deferred Work

- Delivery is Windows-only and best-effort: it shells out to `powershell.exe` with the WinRT toast API; a missing/blocked shell silences the notification without failing the turn.
- The notification title reads the latest `session/title`; before the base-bundle title row produces one, the fallback "DeepSeek Harness" is used.
