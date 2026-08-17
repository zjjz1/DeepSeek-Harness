/** `ui-startup-launch` namespace dictionaries. */

export const zh = {
  'startup.title': '开机自启动',
  'startup.description': '登录 Windows 时是否自动启动本程序（需桌面端）',
  'startup.off': '开机不启动',
  'startup.on': '开机启动',
  'startup.background': '静默启动',
  'startup.backgroundHint': '开机后后台运行，不弹出主窗口（可从托盘恢复）',
  'startup.unavailable': '此选项仅在桌面端可用',
  'startup.saved': '已保存',
} satisfies Record<string, string>

export type StartupLaunchKey = keyof typeof zh

export const en = {
  'startup.title': 'Launch at startup',
  'startup.description': 'Start this app automatically when Windows signs in (desktop app)',
  'startup.off': 'Do not launch at startup',
  'startup.on': 'Launch at startup',
  'startup.background': 'Launch silently',
  'startup.backgroundHint': 'Run in the background at sign-in without showing the window (restore from the tray)',
  'startup.unavailable': 'Available in the desktop app only',
  'startup.saved': 'Saved',
} satisfies Record<StartupLaunchKey, string>

export const NS = 'ui-startup-launch'
