/**
 * Team view: at most three horizontally resizable panes.
 * Left pane is always captain-user chat; the other two are selectable team
 * conversations. Each pane renders like the default chat (MarkdownText
 * bubbles), scrolls independently, and has no composer input.
 *
 * Resizing: pane widths are stored in pixels; each divider sits between
 * pane `leftIndex` and `leftIndex + 1` and changes ONLY the left pane's
 * width. The right neighbour keeps its width, so the divider to its right
 * never moves — dragging a boundary affects only the two adjacent panes.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationNode } from '@deepseek-ai/dsh-client-runtime/client'
import { MarkdownText, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TeamMessageView, TeamSnapshot } from './team-contract.ts'
import type { TeamKey } from './locales.ts'
import css from './TeamView.module.css'

/** One selectable conversation source. */
interface PaneSource {
  id: string
  label: string
  channel: 'user-captain' | 'captain-member' | 'member-member'
  /** Optional member filters; user-captain uses the captain chat nodes instead. */
  memberA?: string
  memberB?: string
}

function plainText(node: ConversationNode): string {
  if (node.kind === 'user') {
    return node.content
      .map(block => block.type === 'text' ? block.text : '')
      .filter(Boolean)
      .join(' ')
  }
  if (node.kind === 'assistant') {
    return node.blocks
      .filter(block => block.kind === 'text' || block.kind === 'reasoning')
      .map(block => block.text)
      .join(' ')
  }
  return ''
}

function formatTime(time: number | undefined): string {
  if (time === undefined) return ''
  const date = new Date(time)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function teamMessageMatches(message: TeamMessageView, source: PaneSource): boolean {
  if (source.channel === 'user-captain') return false
  if (source.channel === 'captain-member') {
    return source.memberA !== undefined
      && (message.sender === source.memberA || message.recipient === source.memberA)
  }
  return source.memberA !== undefined && source.memberB !== undefined
    && ((message.sender === source.memberA && message.recipient === source.memberB)
      || (message.sender === source.memberB && message.recipient === source.memberA))
}

/**
 * Pane divider drag, behaviour A: each divider belongs to the boundary
 * between pane `leftIndex` and `leftIndex + 1`. Dragging changes only the
 * LEFT pane's pixel width; the right neighbour keeps its current width, so
 * the divider on the far side of the right neighbour never moves.
 */
function usePaneSizes(paneCount: number): {
  sizes: (number | null)[]
  containerRef: React.RefObject<HTMLDivElement>
  startDrag: (leftIndex: number) => (event: ReactPointerEvent<HTMLDivElement>) => void
} {
  const [sizes, setSizes] = useState<(number | null)[]>(() =>
    Array.from({ length: paneCount }, () => null))
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef({ index: 0, startX: 0, base: 0, width: 0 })

  // On first mount (and pane count changes) initialise all but the last pane
  // to equal pixel widths so the first drag has a stable starting point.
  useEffect(() => {
    const container = containerRef.current
    if (container === null) return
    const width = container.getBoundingClientRect().width
    if (width <= 0) return
    setSizes(prev => {
      if (prev.length === paneCount && prev.some(size => size !== null)) return prev
      const next: (number | null)[] = Array.from({ length: paneCount }, () => null)
      const fixed = Math.max(120, width / paneCount)
      for (let i = 0; i < paneCount - 1; i++) next[i] = fixed
      return next
    })
  }, [paneCount])

  const startDrag = useCallback((leftIndex: number) =>
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      event.preventDefault()
      const target = event.currentTarget
      const container = target.parentElement?.parentElement ?? containerRef.current
      const width = container?.getBoundingClientRect().width ?? 600
      const current = sizes[leftIndex] ?? width / paneCount
      dragRef.current = { index: leftIndex, startX: event.clientX, base: current, width }
      target.setPointerCapture(event.pointerId)
      const onMove = (move: PointerEvent): void => {
        const dx = move.clientX - dragRef.current.startX
        const next = Math.max(100, Math.min(dragRef.current.width - 200, dragRef.current.base + dx))
        setSizes(prev => {
          const copy = [...prev]
          copy[dragRef.current.index] = next
          return copy
        })
      }
      const onUp = (): void => {
        target.removeEventListener('pointermove', onMove)
        target.removeEventListener('pointerup', onUp)
      }
      target.addEventListener('pointermove', onMove)
      target.addEventListener('pointerup', onUp)
    }, [sizes, paneCount])

  return { sizes, containerRef, startDrag }
}

function roleLabel(t: PropsLocale<'ui-team'>['t'], role: string): string {
  switch (role) {
    case 'user': return t('role.user')
    case 'assistant': return t('role.assistant')
    case 'tool': return t('role.tool')
    default: return t('role.notice')
  }
}

interface TeamRow {
  id: string
  role: string
  text: string
  time: number | undefined
}

/** One message bubble row, styled like the default chat. */
const TeamRowView = memo(function TeamRowView({ row, t }: {
  row: TeamRow
  t: PropsLocale<'ui-team'>['t']
}) {
  const codeLabels = useMemo(() => ({ copyLabel: t('copy'), copiedLabel: t('copied') }), [t])
  return (
    <div className={css.message} data-role={row.role}>
      <div className={css.messageMeta}>
        <span className={css.role}>{roleLabel(t, row.role)}</span>
        {row.time !== undefined && <span className={css.time}>{formatTime(row.time)}</span>}
      </div>
      <div className={css.bubble}>
        <MarkdownText text={row.text} codeLabels={codeLabels} />
      </div>
    </div>
  )
})

/** Render one selectable team conversation pane. */
function TeamPane(props: {
  t: PropsLocale<'ui-team'>['t']
  source: PaneSource
  messages: readonly TeamMessageView[]
  captainNodes: readonly ConversationNode[]
  /** Every selectable source, including the ones shown in other panes. */
  allSources: readonly PaneSource[]
  /** Ids currently shown in OTHER panes; they are hidden from the switcher. */
  shownIds: ReadonlySet<string>
  onSelect: (sourceId: string) => void
}) {
  const { t, source, messages, captainNodes, allSources, shownIds, onSelect } = props
  const [menuOpen, setMenuOpen] = useState(false)
  const rows: TeamRow[] = source.channel === 'user-captain'
    ? captainNodes
      .map(node => ({ id: `${node.kind}:${node.seq}`, role: node.kind, text: plainText(node), time: node.time }))
      .filter(row => row.text !== '')
    : messages
      .filter(message => teamMessageMatches(message, source))
      .map(message => ({
        id: `team:${message.seq}:${message.role}`,
        role: message.role,
        text: message.text,
        time: undefined,
      }))

  const others = useMemo(
    () => allSources.filter(candidate => candidate.id !== source.id && !shownIds.has(candidate.id)),
    [allSources, source.id, shownIds],
  )

  // Grouped switcher entries: user-captain, captain-member, member-member.
  const entries = useMemo<MenuEntry[]>(() => {
    const groups: { channel: PaneSource['channel']; labelKey: TeamKey }[] = [
      { channel: 'user-captain', labelKey: 'pane.userCaptain' },
      { channel: 'captain-member', labelKey: 'pane.captainMember' },
      { channel: 'member-member', labelKey: 'pane.memberMember' },
    ]
    const list: MenuEntry[] = []
    for (const group of groups) {
      const items = others.filter(candidate => candidate.channel === group.channel)
      if (items.length === 0) continue
      if (list.length > 0) list.push({ type: 'separator', id: `sep-${group.channel}` })
      list.push({ type: 'label', id: `label-${group.channel}`, text: t(group.labelKey) })
      for (const item of items) list.push({ id: item.id, label: item.label })
    }
    return list
  }, [others, t])

  return (
    <section className={css.pane}>
      <header className={css.paneHeader}>
        <span className={css.paneTitle}>{source.label}</span>
        {others.length > 0 && (
          <Menu
            open={menuOpen}
            anchor={(
              <button
                type="button"
                className={css.paneSelect}
                aria-label={t('pane.select')}
                onClick={() => { setMenuOpen(true) }}
              >
                {t('pane.select')}
                <span className={css.paneSelectCaret}>▾</span>
              </button>
            )}
            items={entries}
            onSelect={(id) => {
              setMenuOpen(false)
              onSelect(id)
            }}
            onClose={() => { setMenuOpen(false) }}
            align="end"
            portal
          />
        )}
      </header>
      <div className={css.paneBody}>
        {rows.length === 0 ? (
          <div className={css.empty}>{t('pane.empty')}</div>
        ) : rows.map(row => (
          <TeamRowView key={row.id} row={row} t={t} />
        ))}
      </div>
    </section>
  )
}

/**
 * Render the captain-member view.
 * @param props - composed slot props.
 * @returns the view element tree.
 */
export function TeamView({ useSession, t }: ConvViewProps & PropsLocale<'ui-team'>) {
  const captainNodes = useSession(s => s.chat.legacy.nodes)
  const team = useSession(s => s.views.get('team')) as TeamSnapshot | undefined
  const snapshot = team ?? { active: false, members: [], messages: [] }

  const sources = useMemo<PaneSource[]>(() => {
    const list: PaneSource[] = [{ id: 'user-captain', label: t('pane.userCaptain'), channel: 'user-captain' }]
    for (const member of snapshot.members) {
      list.push({
        id: `captain-${member.sessionId}`,
        label: `${t('pane.captainMember')} · ${member.label}`,
        channel: 'captain-member',
        memberA: member.sessionId,
      })
    }
    for (let a = 0; a < snapshot.members.length; a++) {
      for (let b = a + 1; b < snapshot.members.length; b++) {
        const memberA = snapshot.members[a]!
        const memberB = snapshot.members[b]!
        list.push({
          id: `member-${memberA.sessionId}-${memberB.sessionId}`,
          label: `${memberA.label} ↔ ${memberB.label}`,
          channel: 'member-member',
          memberA: memberA.sessionId,
          memberB: memberB.sessionId,
        })
      }
    }
    return list
  }, [snapshot.members, t])

  const paneCount = sources.length <= 1 ? 1 : Math.min(3, Math.max(2, sources.length))
  const defaults = useMemo(() => {
    const selected: PaneSource[] = [sources[0]!]
    if (sources[1] !== undefined) selected.push(sources[1]!)
    if (sources[2] !== undefined && paneCount > 2) selected.push(sources[2]!)
    while (selected.length < paneCount) {
      const next = sources.find(source => !selected.some(used => used.id === source.id))
      if (next === undefined) break
      selected.push(next)
    }
    return selected
  }, [sources, paneCount])
  const [selectedIds, setSelectedIds] = useState<string[]>(defaults.map(source => source.id))
  const selectedSources = selectedIds
    .map(id => sources.find(source => source.id === id))
    .filter((source): source is PaneSource => source !== undefined)
    .slice(0, paneCount)
  while (selectedSources.length < paneCount && sources.length > selectedSources.length) {
    const next = sources.find(source => !selectedSources.some(used => used.id === source.id))
    if (next === undefined) break
    selectedSources.push(next)
  }

  const { sizes, containerRef, startDrag } = usePaneSizes(paneCount)

  const selectPane = (index: number, sourceId: string): void => {
    setSelectedIds(prev => {
      const next = [...prev]
      next[index] = sourceId
      return next
    })
  }

  // Behaviour A grid: the first paneCount-1 panes get fixed pixel widths
  // (as dragged), the LAST pane absorbs the remaining space. Dragging a
  // divider only rewrites its LEFT pane's width, so the divider to the
  // right of the right neighbour is untouched.
  const gridColumns = sizes.map((size, index) =>
    index === paneCount - 1
      ? 'minmax(0, 1fr)'
      : size === null ? 'minmax(0, 1fr)' : `${size}px`).join(' ')

  if (paneCount === 1) {
    return (
      <div className={css.root}>
        <div className={css.status}>
          <span className={snapshot.active ? css.statusActive : css.statusInactive}>
            {snapshot.active ? t('status.active') : t('status.inactive')}
          </span>
          <span>{t('status.members')} {snapshot.members.length}</span>
        </div>
        <TeamPane
          t={t}
          source={sources[0]!}
          messages={snapshot.messages}
          captainNodes={captainNodes}
          allSources={sources}
          shownIds={new Set()}
          onSelect={() => undefined}
        />
      </div>
    )
  }

  const shownIds = new Set(selectedSources.map(candidate => candidate.id))

  return (
    <div className={css.root}>
      <div className={css.status}>
        <span className={snapshot.active ? css.statusActive : css.statusInactive}>
          {snapshot.active ? t('status.active') : t('status.inactive')}
        </span>
        <span>{t('status.members')} {snapshot.members.length}</span>
      </div>
      <div ref={containerRef} className={css.panes} style={{ gridTemplateColumns: gridColumns }}>
        {selectedSources.map((source, index) => (
          <div key={source.id} className={css.paneWrap}>
            {index > 0 && (
              <div
                className={css.divider}
                role="separator"
                aria-orientation="vertical"
                onPointerDown={startDrag(index - 1)}
              />
            )}
            <TeamPane
              t={t}
              source={source}
              messages={snapshot.messages}
              captainNodes={captainNodes}
              allSources={sources}
              shownIds={shownIds}
              onSelect={id => selectPane(index, id)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
