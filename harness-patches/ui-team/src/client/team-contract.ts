/** Browser-side team snapshot contract and durable event vocabulary. */
import type { ConversationViewBuilder, ConversationViewDefinition, ConversationViewNode } from '@deepseek-ai/dsh-client-runtime/client'

/** Durable member identity mirrored from the captain log. */
export interface TeamMemberView {
  sessionId: string
  label: string
  provider: string
  model: string
}

/** One selectable pane channel. */
export type TeamChannel = 'user-captain' | 'captain-member' | 'member-member'

/** One mirrored team line. */
export interface TeamMessageView {
  seq: number
  channel: TeamChannel
  sender: string
  recipient: string
  role: 'user' | 'assistant' | 'tool' | 'notice'
  text: string
  toolName?: string
}

/** Immutable snapshot rendered by the team view. */
export interface TeamSnapshot {
  active: boolean
  members: readonly TeamMemberView[]
  messages: readonly TeamMessageView[]
}

/** One configured member template mirrored from the host team-mode settings. */
export interface TeamMemberConfigView {
  /** Short display name shown in the team view and selectors. */
  label: string
  /** Provider route; empty means inherit the captain route. */
  provider: string
  /** Model id; empty means inherit the captain model. */
  model: string
  /** Absolute workspace directory; empty means the captain workspace. */
  cwd: string
}

/** Durable team settings section mirrored from the host team-mode namespace. */
export interface TeamSettingsView {
  /** Default member count when the captain has no better plan. */
  defaultMemberCount: number
  /** Per-member model/API/workspace overrides, by slot. */
  members: readonly TeamMemberConfigView[]
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'team/mode': { active: boolean }
    'team/roster': { members: TeamMemberView[] }
    'team/message': {
      channel: TeamChannel
      sender: string
      recipient: string
      role: 'user' | 'assistant' | 'tool' | 'notice'
      text: string
      toolName?: string
    }
  }
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  interface ConversationViewSnapshotMap {
    team: TeamSnapshot
  }
}

export interface TeamConversationViewNode extends ConversationViewNode {
  target: 'team'
  anchorSeq: number
  data: unknown
}

export const EMPTY_TEAM_SNAPSHOT: TeamSnapshot = {
  active: false,
  members: [],
  messages: [],
}

/** Simple last-wins collector over the three team event kinds. */
class TeamSnapshotBuilder implements ConversationViewBuilder<TeamConversationViewNode, TeamSnapshot> {
  private nodes: TeamConversationViewNode[] = []

  readonly empty = EMPTY_TEAM_SNAPSHOT

  replace(input: { readonly nodes: readonly TeamConversationViewNode[] }): TeamSnapshot {
    this.nodes = [...input.nodes].sort((left, right) => left.anchorSeq - right.anchorSeq)
    return this.snapshot()
  }

  apply(input: { readonly upserts: readonly TeamConversationViewNode[] }): TeamSnapshot {
    const byKey = new Map(this.nodes.map(node => [node.key, node]))
    for (const node of input.upserts) byKey.set(node.key, node)
    this.nodes = [...byKey.values()].sort((left, right) => left.anchorSeq - right.anchorSeq)
    return this.snapshot()
  }

  private snapshot(): TeamSnapshot {
    let active = false
    let members: readonly TeamMemberView[] = []
    const messages: TeamMessageView[] = []
    for (const node of this.nodes) {
      const data = node.data
      if (typeof data !== 'object' || data === null) continue
      if (node.kind === 'team-mode' && 'active' in data && typeof data.active === 'boolean') active = data.active
      else if (node.kind === 'team-roster' && 'members' in data && Array.isArray(data.members)) {
        members = data.members as TeamMemberView[]
      } else if (node.kind === 'team-message' && 'text' in data && typeof data.text === 'string') {
        messages.push({
          seq: node.anchorSeq,
          channel: (data as TeamMessageView).channel,
          sender: (data as TeamMessageView).sender,
          recipient: (data as TeamMessageView).recipient,
          role: (data as TeamMessageView).role,
          text: (data as TeamMessageView).text,
          ...((data as TeamMessageView).toolName === undefined ? {} : { toolName: (data as TeamMessageView).toolName }),
        })
      }
    }
    return { active, members, messages }
  }
}

export const teamViewDefinition: ConversationViewDefinition<TeamConversationViewNode, TeamSnapshot> = {
  target: 'team',
  create: () => new TeamSnapshotBuilder(),
}
