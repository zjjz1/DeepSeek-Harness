/**
 * Knowledge-base settings row: a title + description + configure button
 * opening a modal that edits the durable knowledge-base namespace (one
 * document directory per line). Every change writes through the settings
 * scope immediately.
 */
import { useMemo, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './KnowledgeBaseRow.module.css'

/** Injected business face: settings writes. */
export interface KnowledgeBaseRowInjected {
  /** Replace the whole directory list. */
  setDirs: (dirs: string[]) => void
  /** Current directory list (snapshot from the settings scope). */
  dirs: readonly string[]
}

/** Full component props: runtime share + injected face + locale seat. */
export type KnowledgeBaseRowProps = PropsRuntime<'settings.general.item'> & KnowledgeBaseRowInjected & PropsLocale<'ui-knowledge-base'>

/**
 * Render the knowledge-base row and its directory editor.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function KnowledgeBaseRow({ t, dirs, setDirs }: KnowledgeBaseRowProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')

  const openModal = (): void => {
    setDraft(dirs.join('\n'))
    setOpen(true)
  }

  const save = (): void => {
    const next = draft.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '')
    setDirs(next)
    setOpen(false)
  }

  const count = useMemo(() => dirs.length, [dirs])

  return (
    <div className={css.group}>
      <div className={css.rowText}>
        <div className={css.title}>{t('settings.title')}</div>
        <div className={css.desc}>{t('settings.description')}</div>
      </div>
      <button type="button" className={css.configure} onClick={openModal}>
        {t('settings.configure')}{count > 0 ? `（${count} ${t('settings.count')}）` : ''}
      </button>
      <Modal
        open={open}
        onClose={() => { setOpen(false) }}
        title={t('settings.title')}
        closeLabel={t('settings.close')}
        className={css.dialog as string}
      >
        <label className={css.dirsLabel}>{t('settings.dirs')}</label>
        <textarea
          className={css.dirs}
          value={draft}
          rows={8}
          spellCheck={false}
          placeholder={'C:\\Users\\me\\docs'}
          onChange={(event) => { setDraft(event.target.value) }}
        />
        <div className={css.hint}>{t('settings.hint')}</div>
        <div className={css.footer}>
          <button type="button" className={css.save} onClick={save}>
            {t('settings.configure')}
          </button>
        </div>
      </Modal>
    </div>
  )
}
