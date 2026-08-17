/** `ui-export` namespace dictionaries. */

export const zh = {
  'action.label': '导出',
  'action.exportMarkdown': '导出 Markdown',
  'action.exportHtml': '导出 HTML 网页',
  'action.exportSvg': '导出 SVG 图片',
  'action.copyMarkdown': '复制 Markdown',
  'action.copied': '已复制',
  'role.user': '你',
  'role.assistant': '助手',
  'role.tool': '工具',
  'role.notice': '系统',
} satisfies Record<string, string>

export type ExportKey = keyof typeof zh

export const en = {
  'action.label': 'Export',
  'action.exportMarkdown': 'Export Markdown',
  'action.exportHtml': 'Export HTML',
  'action.exportSvg': 'Export SVG image',
  'action.copyMarkdown': 'Copy Markdown',
  'action.copied': 'Copied',
  'role.user': 'You',
  'role.assistant': 'Assistant',
  'role.tool': 'Tool',
  'role.notice': 'System',
} satisfies Record<ExportKey, string>

export const NS = 'ui-export'
