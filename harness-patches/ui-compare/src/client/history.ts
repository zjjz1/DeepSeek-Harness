/**
 * Pure history projections for the compare/merge panel: raw session events →
 * transcript rows → merged Markdown. No DOM, no dependencies.
 */

/** Wire event shape used by the projection (structural mirror of SessionEvent). */
export interface WireEvent {
  type: string
  seq: number
  data: unknown
}

/** One transcript row. */
export interface CompareRow {
  role: 'user' | 'assistant' | 'tool' | 'notice'
  text: string
}

/** Plain-text projection of content blocks (user/steering/tool share the shape). */
function contentText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .filter((block): block is { text: string } =>
      typeof block === 'object' && block !== null && typeof (block as { text?: unknown }).text === 'string')
    .map(block => (block as { text: string }).text)
    .join(' ')
    .trim()
}

/** Plain-text projection of assistant blocks (wire blocks use `type`, client blocks use `kind`). */
function blockText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .filter((block): block is { type?: string; kind?: string; text: string } => {
      if (typeof block !== 'object' || block === null) return false
      const record = block as { type?: unknown; kind?: unknown; text?: unknown }
      const family = record.type === 'text' || record.type === 'reasoning'
        || record.kind === 'text' || record.kind === 'reasoning'
      return family && typeof record.text === 'string'
    })
    .map(block => block.text)
    .join(' ')
    .trim()
}

/** Map one event to a transcript row; skips non-transcript kinds. */
export function eventToRow(event: WireEvent): CompareRow | null {
  const data = event.data
  if (typeof data !== 'object' || data === null) return null
  const record = data as { content?: unknown; message?: { content?: unknown; text?: unknown }; name?: unknown }
  if (event.type === 'user/message') {
    const text = contentText(record.content)
    return text === '' ? null : { role: 'user', text }
  }
  if (event.type === 'assistant/message') {
    const text = blockText(record.message?.content)
    return text === '' ? null : { role: 'assistant', text }
  }
  if (event.type === 'tool/result') {
    const text = contentText(record.message?.content)
    const name = typeof record.name === 'string' ? record.name : 'tool'
    return text === '' ? null : { role: 'tool', text: `[${name}] ${text}` }
  }
  if (event.type === 'turn-error') {
    const text = typeof record.message?.text === 'string' ? record.message.text : ''
    return text === '' ? null : { role: 'notice', text: `⚠️ 错误：${text}` }
  }
  return null
}

/** Fold a session's events into transcript rows (empty text dropped). */
export function eventsToRows(events: readonly WireEvent[]): CompareRow[] {
  const rows: CompareRow[] = []
  for (const event of events) {
    const row = eventToRow(event)
    if (row !== null) rows.push(row)
  }
  return rows
}

/** One session's transcript, ready for compare or merge. */
export interface CompareSession {
  sessionId: string
  title: string
  rows: readonly CompareRow[]
}

/** Role label map for markdown headings. */
const ROLE_HEADINGS: Record<CompareRow['role'], string> = {
  user: '你',
  assistant: '助手',
  tool: '工具',
  notice: '系统',
}

/** One transcript as Markdown (title + role-headed rows). */
export function rowsToMarkdown(rows: readonly CompareRow[], title = '对话记录'): string {
  const lines: string[] = [`# ${title}`, '']
  for (const row of rows) {
    lines.push(`## ${ROLE_HEADINGS[row.role]}`, '', row.text, '')
  }
  return lines.join('\n').trimEnd() + '\n'
}

/** Several transcripts merged into one Markdown document. */
export function sessionsToMergedMarkdown(sessions: readonly CompareSession[]): string {
  const parts: string[] = ['# 多会话合并', '']
  for (const session of sessions) {
    parts.push(`## ${session.title}`, '', ...rowsToMarkdown(session.rows, '').split('\n').filter(line => line !== ''), '')
  }
  return parts.join('\n').trimEnd() + '\n'
}
