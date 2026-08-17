/** `ui-schedule` namespace dictionaries. */

export const zh = {
  'action.label': '提醒',
  'panel.title': '提醒',
  'panel.empty': '暂无提醒',
  'panel.hint': '也可以直接告诉 AI：例如「30 分钟后提醒我喝水」。',
  'panel.addTitle': '新建提醒',
  'panel.prompt': '内容',
  'panel.time': '时间',
  'panel.add': '添加',
  'panel.delete': '删除',
  'panel.kindAfter': '延时',
  'panel.kindAt': '定时',
  'panel.kindEvery': '循环',
  'panel.overdue': '已过时',
  'panel.firing': '触发中',
  'panel.closed': '已触发',
} satisfies Record<string, string>

export type ScheduleKey = keyof typeof zh

export const en = {
  'action.label': 'Reminders',
  'panel.title': 'Reminders',
  'panel.empty': 'No reminders',
  'panel.hint': 'Or just tell the AI — e.g. "remind me to drink water in 30 minutes".',
  'panel.addTitle': 'New reminder',
  'panel.prompt': 'Content',
  'panel.time': 'Time',
  'panel.add': 'Add',
  'panel.delete': 'Delete',
  'panel.kindAfter': 'Delay',
  'panel.kindAt': 'At',
  'panel.kindEvery': 'Every',
  'panel.overdue': 'Overdue',
  'panel.firing': 'Firing',
  'panel.closed': 'Done',
} satisfies Record<ScheduleKey, string>

export const NS = 'ui-schedule'
