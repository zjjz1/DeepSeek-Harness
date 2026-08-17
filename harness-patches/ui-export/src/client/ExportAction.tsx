/**
 * Transcript export action: the Session-header utility that downloads the
 * conversation as Markdown / HTML / SVG or copies Markdown to the clipboard.
 * Pure reader of the framework session snapshot — no store, no inject face.
 */
import { useMemo, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconDownloadOutline16, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConversationNode } from '@deepseek-ai/dsh-client-runtime/client'
import {
  exportStem, nodesToRows, rowsToHtml, rowsToMarkdown, rowsToSvg,
} from './exporters.ts'
import css from './ExportAction.module.css'

/** Full component props: the utilities seat's runtime share + locale seat. */
export type ExportActionProps = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<'ui-export'>

/** Trigger a browser download of generated text. */
function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => { URL.revokeObjectURL(url) }, 10_000)
}

/** Copy text to the clipboard, falling back to a hidden textarea. */
async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fall through to the legacy path
    }
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  textarea.remove()
  return ok
}

/**
 * Render the Export header utility and its format menu.
 * @param props - session kit + locale.
 * @returns the export button and dropdown.
 */
export function ExportAction({ useSession, t }: ExportActionProps) {
  const nodes = useSession(s => s.chat.legacy.nodes) as readonly ConversationNode[]
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const entries = useMemo<MenuEntry[]>(() => {
    const items: MenuEntry[] = [
      { id: 'markdown', label: t('action.exportMarkdown') },
      { id: 'html', label: t('action.exportHtml') },
      { id: 'svg', label: t('action.exportSvg') },
      { type: 'separator', id: 'sep-copy' },
      { id: 'copy', label: t('action.copyMarkdown') },
    ]
    return items
  }, [t])

  const run = (id: string): void => {
    setOpen(false)
    const rows = nodesToRows(nodes)
    const stem = exportStem()
    if (id === 'markdown') {
      downloadText(`${stem}.md`, rowsToMarkdown(rows), 'text/markdown;charset=utf-8')
    } else if (id === 'html') {
      downloadText(`${stem}.html`, rowsToHtml(rows), 'text/html;charset=utf-8')
    } else if (id === 'svg') {
      downloadText(`${stem}.svg`, rowsToSvg(rows), 'image/svg+xml')
    } else if (id === 'copy') {
      void copyText(rowsToMarkdown(rows)).then((ok) => {
        if (!ok) return
        setCopied(true)
        setTimeout(() => { setCopied(false) }, 1600)
      })
    }
  }

  return (
    <Menu
      open={open}
      anchor={(
        <button
          type="button"
          className={css.exportButton}
          aria-label={t('action.label')}
          onClick={() => { setOpen(true) }}
        >
          {copied ? t('action.copied') : t('action.label')}
          <IconDownloadOutline16 size={12} />
        </button>
      )}
      items={entries}
      onSelect={run}
      onClose={() => { setOpen(false) }}
      align="end"
      portal
    />
  )
}
