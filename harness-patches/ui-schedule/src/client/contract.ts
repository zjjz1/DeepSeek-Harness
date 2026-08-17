/** Browser-side reminder fold over the durable schedule/change log. */
import type {
  ConversationViewBuilder, ConversationViewDefinition, ConversationViewNode,
} from '@deepseek-ai/dsh-client-runtime/client'

/** One reminder shown by the utility. */
export interface ReminderView {
  /** Session-local stable id. */
  id: string
  /** Reminder content. */
  prompt: string
  /** Rule kind. */
  kind: 'after' | 'at' | 'every'
  /** Next target time (epoch ms), computed for fixed-rate rules. */
  target: number
  /** Whether the target has passed. */
  overdue: boolean
}

/** Immutable snapshot rendered by the reminder utility. */
export interface ScheduleSnapshot {
  reminders: readonly ReminderView[]
}

export const EMPTY_SCHEDULE_SNAPSHOT: ScheduleSnapshot = { reminders: [] }

/** Durable one-shot record shape mirrored from the host schedule package. */
interface OneShotRecord {
  id: string
  kind: 'after' | 'at'
  prompt: string
  scheduledAt: string
  afterSeconds?: number
}

/** Durable fixed-rate record shape mirrored from the host schedule package. */
interface EveryRecord {
  id: string
  kind: 'every'
  prompt: string
  scheduledAt: string
  everySeconds: number
}

type ScheduleRecord = OneShotRecord | EveryRecord

/** Raw schedule/change event data (client mirror of the host payload). */
type ScheduleChangeData =
  | { version: number; operation: 'create'; schedule: ScheduleRecord }
  | { version: number; operation: 'delete'; id: string }
  | { version: number; operation: 'dispatch'; id: string; acceptedAt?: number }

function isScheduleChangeData(data: unknown): data is ScheduleChangeData {
  if (typeof data !== 'object' || data === null) return false
  const record = data as { operation?: unknown; schedule?: unknown }
  return record.operation === 'create' || record.operation === 'delete' || record.operation === 'dispatch'
}

/** Parse an RFC 3339 UTC string; NaN on malformed input. */
function parseTarget(value: string): number {
  return Date.parse(value)
}

/** Resolve the next target for one record at `now`. */
function nextTarget(record: ScheduleRecord, now: number): number {
  const anchor = parseTarget(record.scheduledAt)
  if (!Number.isFinite(anchor)) return now
  if (record.kind !== 'every') return anchor
  if (anchor >= now) return anchor
  const interval = record.everySeconds * 1000
  if (!Number.isFinite(interval) || interval <= 0) return anchor
  return anchor + interval * Math.ceil((now - anchor) / interval)
}

/** Last-wins fold over the schedule/change event kinds. */
class ScheduleSnapshotBuilder implements ConversationViewBuilder<ScheduleConversationViewNode, ScheduleSnapshot> {
  private nodes: ScheduleConversationViewNode[] = []

  readonly empty = EMPTY_SCHEDULE_SNAPSHOT

  replace(input: { readonly nodes: readonly ScheduleConversationViewNode[] }): ScheduleSnapshot {
    this.nodes = [...input.nodes].sort((left, right) => left.anchorSeq - right.anchorSeq)
    return this.snapshot()
  }

  apply(input: { readonly upserts: readonly ScheduleConversationViewNode[] }): ScheduleSnapshot {
    const byKey = new Map(this.nodes.map(node => [node.key, node]))
    for (const node of input.upserts) byKey.set(node.key, node)
    this.nodes = [...byKey.values()].sort((left, right) => left.anchorSeq - right.anchorSeq)
    return this.snapshot()
  }

  private snapshot(): ScheduleSnapshot {
    const byId = new Map<string, ScheduleRecord>()
    for (const node of this.nodes) {
      const data = node.data
      if (!isScheduleChangeData(data)) continue
      if (data.operation === 'create') byId.set(data.schedule.id, data.schedule)
      else if (data.operation === 'delete') byId.delete(data.id)
      else if (data.operation === 'dispatch' && byId.has(data.id)) {
        const record = byId.get(data.id)!
        // One-shot reminders are done after dispatch; fixed-rate ones stay.
        if (record.kind !== 'every') byId.delete(data.id)
      }
    }
    const now = Date.now()
    const reminders: ReminderView[] = [...byId.values()].map((record) => {
      const target = nextTarget(record, now)
      return {
        id: record.id,
        prompt: record.prompt,
        kind: record.kind,
        target,
        overdue: target < now,
      }
    }).sort((left, right) => left.target - right.target)
    return { reminders }
  }
}

export interface ScheduleConversationViewNode extends ConversationViewNode {
  target: 'schedule'
  anchorSeq: number
  data: unknown
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Durable reminder change (create/delete/dispatch); log-only, mirrored from the host schedule package. */
    'schedule/change': {
      version: number
      operation: 'create' | 'delete' | 'dispatch'
      schedule?: unknown
      id?: string
      acceptedAt?: number
    }
  }
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  interface ConversationViewSnapshotMap {
    schedule: ScheduleSnapshot
  }
}

export const scheduleViewDefinition: ConversationViewDefinition<ScheduleConversationViewNode, ScheduleSnapshot> = {
  target: 'schedule',
  create: () => new ScheduleSnapshotBuilder(),
}
