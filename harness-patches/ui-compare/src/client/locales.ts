/** `ui-compare` namespace dictionaries. */

export const zh = {
  'entry.label': '会话对比',
  'panel.title': '多会话对比与合并',
  'panel.hint': '选择 2-4 个会话，可并排对比或合并导出为 Markdown。',
  'panel.empty': '暂无会话',
  'panel.compare': '并排对比',
  'panel.merge': '合并导出 Markdown',
  'panel.loading': '加载中…',
  'panel.error': '加载失败',
  'panel.close': '关闭',
  'panel.needTwo': '请至少选择 2 个会话',
  'panel.tooMany': '最多选择 4 个会话',
  'panel.updated': '更新',
  'role.user': '你',
  'role.assistant': '助手',
  'role.tool': '工具',
  'role.notice': '系统',
} satisfies Record<string, string>

export type CompareKey = keyof typeof zh

export const en = {
  'entry.label': 'Compare',
  'panel.title': 'Compare & merge sessions',
  'panel.hint': 'Pick 2-4 sessions to compare side by side or merge into Markdown.',
  'panel.empty': 'No sessions',
  'panel.compare': 'Compare',
  'panel.merge': 'Merge to Markdown',
  'panel.loading': 'Loading…',
  'panel.error': 'Load failed',
  'panel.close': 'Close',
  'panel.needTwo': 'Select at least 2 sessions',
  'panel.tooMany': 'Select at most 4 sessions',
  'panel.updated': 'Updated',
  'role.user': 'You',
  'role.assistant': 'Assistant',
  'role.tool': 'Tool',
  'role.notice': 'System',
} satisfies Record<CompareKey, string>

export const NS = 'ui-compare'
