/** `ui-knowledge-base` namespace dictionaries. */

export const zh = {
  'settings.title': '知识库',
  'settings.description': '配置本地文档目录（kb_search / kb_list 工具检索范围）',
  'settings.configure': '配置',
  'settings.close': '关闭',
  'settings.dirs': '文档目录（每行一个路径）',
  'settings.hint': '支持绝对路径或相对路径；AI 回答涉及本地文档时会自动检索这些目录。',
  'settings.count': '个目录',
} satisfies Record<string, string>

export type KnowledgeBaseKey = keyof typeof zh

export const en = {
  'settings.title': 'Knowledge base',
  'settings.description': 'Local document directories searched by kb_search / kb_list',
  'settings.configure': 'Configure',
  'settings.close': 'Close',
  'settings.dirs': 'Document directories (one path per line)',
  'settings.hint': 'Absolute or process-relative paths; the agent searches these when answering about local documents.',
  'settings.count': 'dirs',
} satisfies Record<KnowledgeBaseKey, string>

export const NS = 'ui-knowledge-base'
