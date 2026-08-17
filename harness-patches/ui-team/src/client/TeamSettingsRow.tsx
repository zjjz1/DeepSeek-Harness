/**
 * Team-settings preference row registered into the General section item slot:
 * a title + description + "configure" button opening a modal that edits the
 * durable team-mode namespace (default member count and per-slot member
 * label/model templates). The team feature owns its own settings surface.
 * Every change writes through the settings scope immediately.
 */
import { useMemo, useState } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { Menu, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TeamMemberConfigView, TeamSettingsView } from './team-contract.ts'
import type { createTeamSettingsRowStore } from './team-settings-store.ts'
import css from './TeamSettingsRow.module.css'

/** One flattened catalog model the member-model menu offers. */
export interface TeamCatalogModel {
  /** Provider route id used for requests. */
  provider: string
  /** Provider display name. */
  providerName: string
  /** Provider-owned model id. */
  model: string
}

/** Injected business face: settings writes plus the advisory model catalog. */
export interface TeamSettingsRowInjected {
  /** Write the default member count (1-5). */
  setDefaultMemberCount: (count: number) => void
  /** Replace one member-slot template. */
  setMemberConfig: (index: number, config: TeamMemberConfigView) => void
  /** Fetch the host model catalog (advisory; callers own the error handling). */
  loadModels: () => Promise<readonly TeamCatalogModel[]>
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type TeamSettingsRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createTeamSettingsRowStore>>
  & PropsLocale<'ui-team'> & TeamSettingsRowInjected

/** The roster never exceeds this bound (mirrors the host MAX_MEMBERS). */
const MAX_MEMBER_SLOTS = 5

/** Menu option id for one catalog model: `provider::model`. */
function modelOptionId(catalog: TeamCatalogModel): string {
  return `${catalog.provider}::${catalog.model}`
}

/** The empty template a slot falls back to. */
function emptyConfig(): TeamMemberConfigView {
  return { label: '', provider: '', model: '', cwd: '' }
}

/**
 * Render the team-settings row and its configuration modal.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function TeamSettingsRow({ t, useStore, setDefaultMemberCount, setMemberConfig, loadModels }: TeamSettingsRowComponentProps) {
  const section = useStore(s => s.section)
  const settings: TeamSettingsView = section ?? { defaultMemberCount: 1, members: [] }
  const [open, setOpen] = useState(false)
  const [catalog, setCatalog] = useState<readonly TeamCatalogModel[] | null>(null)
  const [catalogFailed, setCatalogFailed] = useState(false)
  const [modelMenu, setModelMenu] = useState<number | null>(null)

  const openModal = (): void => {
    setOpen(true)
    if (catalog === null) {
      setCatalogFailed(false)
      void loadModels().then((models) => {
        setCatalog(models)
      }).catch(() => {
        setCatalogFailed(true)
        setCatalog([])
      })
    }
  }

  const retryCatalog = (): void => {
    setCatalogFailed(false)
    void loadModels().then((models) => {
      setCatalog(models)
    }).catch(() => {
      setCatalogFailed(true)
      setCatalog([])
    })
  }

  const slotAt = (index: number): TeamMemberConfigView => settings.members[index] ?? emptyConfig()

  const changeSlot = (index: number, next: TeamMemberConfigView): void => {
    setMemberConfig(index, next)
  }

  const changeLabel = (index: number, label: string): void => {
    changeSlot(index, { ...slotAt(index), label })
  }

  const changeModel = (index: number, optionId: string): void => {
    setModelMenu(null)
    const slot = slotAt(index)
    if (optionId === '') {
      changeSlot(index, { ...slot, provider: '', model: '' })
      return
    }
    const separator = optionId.indexOf('::')
    if (separator <= 0) return
    changeSlot(index, {
      ...slot,
      provider: optionId.slice(0, separator),
      model: optionId.slice(separator + 2),
    })
  }

  const count = Math.min(MAX_MEMBER_SLOTS, Math.max(1, Math.round(settings.defaultMemberCount)))

  const modelEntries = useMemo<MenuEntry[]>(() => {
    const list: MenuEntry[] = [{ id: '', label: t('settings.inherit') }]
    if (catalog === null) return list
    const groups = new Map<string, TeamCatalogModel[]>()
    for (const entry of catalog) {
      const bucket = groups.get(entry.provider)
      if (bucket === undefined) groups.set(entry.provider, [entry])
      else bucket.push(entry)
    }
    for (const [provider, entries] of groups) {
      list.push({ type: 'separator', id: `sep-${provider}` })
      list.push({ type: 'label', id: `label-${provider}`, text: entries[0]?.providerName ?? provider })
      for (const entry of entries) {
        list.push({ id: modelOptionId(entry), label: entry.model })
      }
    }
    return list
  }, [catalog, t])

  return (
    <div className={css.group}>
      <div className={css.rowText}>
        <div className={css.title}>{t('settings.title')}</div>
        <div className={css.desc}>{t('settings.description')}</div>
      </div>
      <button type="button" className={css.configure} onClick={openModal}>
        {t('settings.configure')}
      </button>
      <Modal
        open={open}
        onClose={() => { setOpen(false) }}
        title={t('settings.title')}
        closeLabel={t('settings.close')}
        description={t('settings.description')}
        className={css.dialog as string}
      >
        <div className={css.countRow}>
          <div className={css.countText}>
            <div className={css.countTitle}>{t('settings.count')}</div>
            <div className={css.countHint}>{t('settings.countHint')}</div>
          </div>
          <div className={css.stepper}>
            <button
              type="button"
              className={css.step}
              aria-label="−"
              disabled={count <= 1}
              onClick={() => { setDefaultMemberCount(count - 1) }}
            >
              −
            </button>
            <span className={css.countValue}>{count}</span>
            <button
              type="button"
              className={css.step}
              aria-label="+"
              disabled={count >= MAX_MEMBER_SLOTS}
              onClick={() => { setDefaultMemberCount(count + 1) }}
            >
              +
            </button>
          </div>
        </div>
        <div className={css.slots}>
          {Array.from({ length: MAX_MEMBER_SLOTS }, (_unused, index) => {
            const slot = slotAt(index)
            return (
              <div key={index} className={css.slot}>
                <span className={css.slotIndex}>{t('settings.member')} {index + 1}</span>
                <input
                  className={css.slotInput}
                  type="text"
                  value={slot.label}
                  placeholder={t('settings.memberLabel')}
                  aria-label={`${t('settings.memberLabel')} ${index + 1}`}
                  onChange={(event) => { changeLabel(index, event.target.value) }}
                />
                <Menu
                  open={modelMenu === index}
                  anchor={(
                    <button
                      type="button"
                      className={css.slotModel}
                      aria-label={`${t('settings.memberModel')} ${index + 1}`}
                      onClick={() => { setModelMenu(modelMenu === index ? null : index) }}
                    >
                      <span className={css.slotModelText}>
                        {slot.model !== '' ? slot.model : t('settings.inherit')}
                      </span>
                      <span className={css.slotModelCaret}>▾</span>
                    </button>
                  )}
                  items={modelEntries}
                  onSelect={(id) => { changeModel(index, id) }}
                  onClose={() => { setModelMenu(null) }}
                  align="end"
                  portal
                />
              </div>
            )
          })}
        </div>
        {catalogFailed && (
          <div className={css.catalogError}>
            <span>{t('settings.modelFetchFailed')}</span>
            <button type="button" className={css.retry} onClick={retryCatalog}>
              {t('settings.retry')}
            </button>
          </div>
        )}
        <div className={css.inheritHint}>{t('settings.inheritHint')}</div>
      </Modal>
    </div>
  )
}
