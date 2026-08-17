/**
 * Team-mode durable event vocabulary and settings schema.
 * Team events are log-only: they never enter the LLM surface; the browser team
 * view and the mindmap view read them from the captain session log.
 */
import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the team-mode plugin. */
export const TEAM_SETTINGS_NAMESPACE = 'team-mode'

/** One configured member template in the durable settings document. */
export interface TeamMemberConfig {
  /** Short display name shown in the team view and selectors. */
  label: string
  /** Provider route; empty means inherit the captain route. */
  provider: string
  /** Model id; empty means inherit the captain model. */
  model: string
  /** Absolute workspace directory; empty means the captain workspace. */
  cwd: string
}

/** Durable team settings. */
export interface TeamSettings {
  /** Default number of members when the captain has no better plan. */
  defaultMemberCount: number
  /** Optional per-member model/API/workspace overrides, by slot. */
  members: TeamMemberConfig[]
}

/** Settings-boundary schema for the team-mode namespace. */
export const TeamSettingsSchema: z<TeamSettings> = z.object({
  defaultMemberCount: z.number().step(1).min(1).max(5).default(1),
  members: z.array(z.object({
    label: z.string().default('成员'),
    provider: z.string().default(''),
    model: z.string().default(''),
    cwd: z.string().default(''),
  })).default([]),
})

/** Stable identity of one live team member. */
export interface TeamMemberRecord {
  /** Durable child session id. */
  sessionId: string
  /** Display label. */
  label: string
  /** Effective provider (already resolved from config or captain). */
  provider: string
  /** Effective model (already resolved from config or captain). */
  model: string
}

/** Conversation channel shown as one selectable pane. */
export type TeamChannel = 'user-captain' | 'captain-member' | 'member-member'

/** One mirrored conversation line stored on the captain session log. */
export interface TeamMessageRecord {
  /** Which pane this line belongs to. */
  channel: TeamChannel
  /** Sender session id (`user` for the human). */
  sender: string
  /** Recipient session id (`user` for the human). */
  recipient: string
  /** Message role. */
  role: 'user' | 'assistant' | 'tool' | 'notice'
  /** Rendered one-line text. */
  text: string
  /** Optional tool name for tool lines. */
  toolName?: string
}

/** Status of one tool-conflict request. */
export type TeamToolRequestStatus = 'pending' | 'allowed' | 'denied' | 'queued'

/** Durable record of one member tool call awaiting captain approval. */
export interface TeamToolRequestRecord {
  requestId: string
  memberId: string
  toolName: string
  /** Human-readable resource target derived from arguments when possible. */
  resource: string
  status: TeamToolRequestStatus
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Captain-member mode in force from this point on. Log-only, last one wins.
     */
    'team/mode': { active: boolean }
    /** Complete live roster snapshot; last one wins. */
    'team/roster': { members: TeamMemberRecord[] }
    /** One mirrored team conversation line; append-only. */
    'team/message': TeamMessageRecord
    /** One tool-conflict request record; append-only state changes via later records. */
    'team/tool-request': TeamToolRequestRecord
    /** Captain's decision for one tool request. */
    'team/tool-decision': { requestId: string; outcome: 'allow' | 'deny' | 'queue' }
  }
}
