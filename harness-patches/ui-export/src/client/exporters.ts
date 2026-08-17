/**
 * Pure transcript exporters: conversation nodes → Markdown, self-contained
 * HTML, and a downloadable SVG image. No DOM, no dependencies — every function
 * is a pure mapping so the menu handlers stay one-liners.
 */
import type { ConversationNode } from '@deepseek-ai/dsh-client-runtime/client'

/** One exported transcript line (role-labeled). */
export interface ExportRow {
  role: 'user' | 'assistant' | 'tool' | 'notice'
  text: string
  time: number | undefined
}

/** Plain-text projection of content blocks (user/steering/context/tool share the shape). */
function contentText(content: readonly unknown[] | undefined): string {
  if (!Array.isArray(content)) return ''
  return content
    .filter((block): block is { text: string } =>
      typeof block === 'object' && block !== null && typeof (block as { text?: unknown }).text === 'string')
    .map(block => (block as { text: string }).text)
    .join(' ')
    .trim()
}

/** Plain-text projection of assistant blocks (text/reasoning). */
function blockText(blocks: readonly { kind?: string; text?: unknown }[] | undefined): string {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .filter(block => (block.kind === 'text' || block.kind === 'reasoning') && typeof block.text === 'string')
    .map(block => block.text as string)
    .join(' ')
    .trim()
}

/** Map one conversation node to an export row; skips non-transcript kinds. */
export function nodeToRow(node: ConversationNode): ExportRow | null {
  switch (node.kind) {
    case 'user':
    case 'steering':
    case 'context':
      return { role: 'user', text: contentText(node.content), time: node.time }
    case 'assistant':
      return { role: 'assistant', text: blockText(node.blocks), time: node.time }
    case 'tool-result': {
      const head = node.call?.name ?? 'tool'
      const body = contentText(node.content)
      return {
        role: 'tool',
        text: body === '' ? `[${head}]` : `[${head}] ${body}`,
        time: node.time,
      }
    }
    case 'command':
      return {
        role: 'notice',
        text: `/${node.name ?? 'command'}${node.args === null ? '' : ` ${node.args.trim()}`}`.trimEnd(),
        time: node.time,
      }
    case 'turn-error':
      return { role: 'notice', text: `⚠️ 错误：${node.message}`, time: node.time }
    case 'compaction':
      return { role: 'notice', text: '（历史已压缩）', time: node.time }
    default:
      return null
  }
}

/** Fold a conversation snapshot into export rows (empty text dropped). */
export function nodesToRows(nodes: readonly ConversationNode[]): ExportRow[] {
  const rows: ExportRow[] = []
  for (const node of nodes) {
    const row = nodeToRow(node)
    if (row !== null && row.text !== '') rows.push(row)
  }
  return rows
}

/** Compact clock time for row labels. */
export function clockTime(time: number | undefined): string {
  if (time === undefined) return ''
  const date = new Date(time)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Timestamped base filename (no extension). */
export function exportStem(now = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `对话-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
}

/** Escape text for HTML and XML (shared by the html and svg exporters). */
export function escapeMarkup(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** Role label colors shared by the html/svg exporters. */
export const ROLE_COLORS: Record<ExportRow['role'], string> = {
  user: '#2563eb',
  assistant: '#059669',
  tool: '#7c3aed',
  notice: '#94a3b8',
}

/** One transcript as Markdown. */
export function rowsToMarkdown(rows: readonly ExportRow[], title = '对话记录'): string {
  const lines: string[] = [`# ${title}`, '']
  for (const row of rows) {
    const label = row.role === 'user' ? '你' : row.role === 'assistant' ? '助手' : row.role === 'tool' ? '工具' : '系统'
    const time = clockTime(row.time)
    lines.push(`## ${label}${time === '' ? '' : ` · ${time}`}`, '', row.text, '')
  }
  return lines.join('\n').trimEnd() + '\n'
}

/** Minimal markdown → html for the self-contained page (fences, headings, bold, inline code, lists, links, quotes). */
export function markdownToHtml(markdown: string): string {
  const out: string[] = []
  const lines = markdown.split('\n')
  let inFence = false
  let listStack: string[] = []
  const closeLists = (): void => {
    while (listStack.length > 0) out.push(`</${listStack.pop()}>`)
  }
  const inline = (text: string): string => {
    const escaped = escapeMarkup(text)
    return escaped
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>')
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line.startsWith('```')) {
      if (inFence) {
        out.push('</code></pre>')
        inFence = false
      } else {
        closeLists()
        out.push('<pre><code>')
        inFence = true
      }
      continue
    }
    if (inFence) {
      out.push(escapeMarkup(line))
      continue
    }
    if (line === '') {
      closeLists()
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading !== null) {
      closeLists()
      const level = heading[1]!.length
      out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`)
      continue
    }
    const quote = /^>\s?(.*)$/.exec(line)
    if (quote !== null) {
      closeLists()
      out.push(`<blockquote>${inline(quote[1]!)}</blockquote>`)
      continue
    }
    const unordered = /^[-*]\s+(.*)$/.exec(line)
    if (unordered !== null) {
      if (listStack[listStack.length - 1] !== 'ul') {
        closeLists()
        out.push('<ul>')
        listStack.push('ul')
      }
      out.push(`<li>${inline(unordered[1]!)}</li>`)
      continue
    }
    const ordered = /^\d+\.\s+(.*)$/.exec(line)
    if (ordered !== null) {
      if (listStack[listStack.length - 1] !== 'ol') {
        closeLists()
        out.push('<ol>')
        listStack.push('ol')
      }
      out.push(`<li>${inline(ordered[1]!)}</li>`)
      continue
    }
    closeLists()
    out.push(`<p>${inline(line)}</p>`)
  }
  closeLists()
  if (inFence) out.push('</code></pre>')
  return out.join('\n')
}

/** One transcript as a self-contained HTML document. */
export function rowsToHtml(rows: readonly ExportRow[], title = '对话记录'): string {
  const body = rows.map((row) => {
    const label = row.role === 'user' ? '你' : row.role === 'assistant' ? '助手' : row.role === 'tool' ? '工具' : '系统'
    const color = ROLE_COLORS[row.role]
    const time = clockTime(row.time)
    const markdown = `## ${label}${time === '' ? '' : ` · ${time}`}\n\n${row.text}`
    return `<article class="row" data-role="${row.role}">
  <header><span class="role" style="color:${color}">${escapeMarkup(label)}</span>${time === '' ? '' : `<span class="time">${escapeMarkup(time)}</span>`}</header>
  <div class="content">${markdownToHtml(markdown)}</div>
</article>`
  }).join('\n')
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeMarkup(title)}</title>
<style>
  body { margin: 0; padding: 32px 24px; background: #ffffff; color: #1f2937;
    font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; line-height: 1.7; }
  h1 { font-size: 20px; margin: 0 0 24px; }
  article.row { margin-bottom: 20px; }
  article.row header { display: flex; gap: 10px; align-items: baseline; margin-bottom: 4px; }
  article.row .role { font-weight: 600; font-size: 13px; }
  article.row .time { font-size: 12px; color: #9ca3af; }
  article.row .content { font-size: 14px; overflow-wrap: anywhere; }
  article.row[data-role="tool"] .content, article.row[data-role="notice"] .content { color: #6b7280; font-size: 13px; }
  pre { background: #f3f4f6; border-radius: 8px; padding: 12px; overflow-x: auto; font-size: 12.5px; }
  code { background: #f3f4f6; border-radius: 4px; padding: 1px 5px; font-size: 12.5px; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 0; padding-left: 12px; border-left: 3px solid #e5e7eb; color: #6b7280; }
  a { color: #2563eb; }
  h2 { font-size: 13px; margin: 0; }
  .content h2 { display: none; }
</style>
</head>
<body>
<h1>${escapeMarkup(title)}</h1>
${body}
</body>
</html>
`
}

/** Wrap text into lines of at most `width` px for a 13px font (CJK ≈ 13px, ASCII ≈ 6.5px). */
function wrapLines(text: string, width: number): string[] {
  const lines: string[] = []
  let current = ''
  let currentWidth = 0
  for (const char of text) {
    const w = char.charCodeAt(0) > 0xff ? 13 : 6.5
    if (currentWidth + w > width && current !== '') {
      lines.push(current)
      current = char
      currentWidth = w
    } else {
      current += char
      currentWidth += w
    }
  }
  if (current !== '') lines.push(current)
  return lines
}

/** One transcript as a downloadable SVG image (light theme, role-colored labels). */
export function rowsToSvg(rows: readonly ExportRow[], title = '对话记录'): string {
  const width = 860
  const padding = 28
  const lineHeight = 22
  const maxWidth = width - padding * 2
  const pieces: string[] = []
  let y = padding + 16
  pieces.push(`<text x="${padding}" y="${y}" font-size="18" font-weight="600" fill="#111827">${escapeMarkup(title)}</text>`)
  y += 26
  for (const row of rows) {
    const label = row.role === 'user' ? '你' : row.role === 'assistant' ? '助手' : row.role === 'tool' ? '工具' : '系统'
    const color = ROLE_COLORS[row.role]
    const time = clockTime(row.time)
    y += 12
    pieces.push(`<text x="${padding}" y="${y}" font-size="13" font-weight="600" fill="${color}">${escapeMarkup(label)}${time === '' ? '' : `  ${escapeMarkup(time)}`}</text>`)
    y += 18
    const isMuted = row.role === 'tool' || row.role === 'notice'
    for (const line of wrapLines(row.text, maxWidth)) {
      pieces.push(`<text x="${padding}" y="${y}" font-size="13" fill="${isMuted ? '#6b7280' : '#1f2937'}">${escapeMarkup(line)}</text>`)
      y += lineHeight
    }
  }
  const height = y + padding
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="#ffffff"/>
${pieces.join('\n')}
</svg>
`
}
