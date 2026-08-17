/**
 * Captain-member team orchestration service (fixed entry).
 *
 * The captain session remains the only agent visible in the ordinary chat view.
 * Members are durable continuable subagents created through `ctx.subagents`;
 * their events are mirrored into the captain log as `team/message` records so
 * the browser team view and the mindmap view read one session instead of N.
 *
 * Mutating tool calls from members pass through `tools/pre-execute`: the member
 * call is parked, the captain receives a decision request, and the captain's
 * `team_approve_tool` call releases it.
 */
import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { JsonValue, Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-user-questions'
import {
  TeamSettingsSchema, TEAM_SETTINGS_NAMESPACE,
  type TeamMemberRecord, type TeamMessageRecord, type TeamSettings,
} from './types.ts'

export {
  TeamSettingsSchema, TEAM_SETTINGS_NAMESPACE,
  type TeamMemberRecord, type TeamMessageRecord, type TeamSettings,
} from './types.ts'
export type * from './types.ts'

/** Tool names that require captain approval before a member may run them. */
const MUTATING_TOOL_NAMES = new Set([
  'bash', 'pwsh', 'write', 'edit', 'delete', 'move', 'str_replace_editor', 'run_code',
])

/** Team tools denied to member children so only the captain can drive the team. */
const TEAM_TOOL_NAMES = [
  'team_create_members', 'team_send_to_member', 'team_relay', 'team_approve_tool',
  'team_status', 'team_stop_member_chat',
]

const MAX_MEMBERS = 5

/** Ordered pair key for one member-member conversation (ids are plain strings in records). */
function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|')
}

/** Captain protocol injected while team mode is active. */
function teamProtocol(defaultMemberCount: number): string {
  return `You are the CAPTAIN of a multi-agent team. You are the only agent who talks to the user.
- Clarify the user's requirement first, then split it into non-conflicting subtasks.
- Ask the user before creating members: call team_create_members with the number you need (1-5). You may request more members later, but never exceed 5 in total. When the user has no preference on team size, create ${defaultMemberCount} member(s) by default.
- Dispatch work with team_send_to_member. Read-only member tools run directly; members' mutating tools send you a decision request which you MUST answer with team_approve_tool.
- When one member needs another member, use team_relay so the conversation remains visible in the team view.
- Members may also message each other directly with team_member_send; every direct send is reported to you (先斩后奏). If a member-member conversation is unnecessary, terminate it with team_stop_member_chat.
- Review every member result for hidden bugs and hard errors. Send the work back with team_send_to_member when it needs another pass.
- Round boundaries are explicit: before you end a turn while members are still working, tell the user in your final message that this round is finished — what was dispatched, to whom, and that you will continue automatically when results come back. Do not end a turn without such a closing statement whenever the round is not fully complete.
- When a member result arrives and starts a new turn, begin by telling the user which member returned and what you are doing next, then continue the work.
- Finish with your own summary to the user. Never forward raw member chatter to the user.`
}

/** Last `team/mode` wins across a session log prefix. */
export function foldTeamMode(events: readonly SessionEvent[], end = events.length): boolean {
  let active = false
  let index = 0
  for (const event of events) {
    if (index >= end) break
    index++
    if (event.type === 'team/mode') active = event.data.active
  }
  return active
}

/** Plain-text projection for content blocks (assistant and user share the shape). */
function textOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .filter((block): block is { text?: unknown } =>
      typeof block === 'object' && block !== null && 'text' in block)
    .map(block => typeof block.text === 'string' ? block.text : '')
    .filter(Boolean)
    .join(' ')
    .slice(0, 2000)
}

function isMutatingTool(name: string): boolean {
  return MUTATING_TOOL_NAMES.has(name) || /^(bash|pwsh|write|edit|delete|move|replace|run_)/.test(name)
}

function resourceLabel(exec: ToolExecution): string {
  const args = exec.arguments
  if (typeof args === 'object' && args !== null) {
    const record = args as Record<string, unknown>
    for (const key of ['path', 'file', 'command', 'target']) {
      if (typeof record[key] === 'string') return record[key]
    }
  }
  return exec.name
}

interface PendingToolRequest {
  resolve: (outcome: 'allow' | 'deny' | 'queue') => void
  timer: ReturnType<typeof setTimeout>
  memberId: SessionId
  toolName: string
  resource: string
}

interface LiveTeamState {
  captainId: SessionId
  members: TeamMemberRecord[]
  pending: Map<string, PendingToolRequest>
  /** Per-member routing of the next mirrored reply: member-member peer, when set. */
  lastInbound: Map<string, { peer: SessionId }>
  /** Member-member conversations the captain terminated (pair keys). */
  blocked: Set<string>
}

interface TeamCreateArgs {
  count: number
}

interface TeamSendArgs {
  member_id: string
  message: string
}

interface TeamRelayArgs {
  from_member_id: string
  to_member_id: string
  message: string
}

interface TeamStopArgs {
  member_a_id: string
  member_b_id: string
}

interface TeamApproveArgs {
  request_id: string
  decision: 'allow' | 'deny' | 'queue'
}

/** Default export is the Cordis service row mounted by dsh-base. */
export default class TeamModeService extends Service {
  static inject = ['settings', 'systemPrompt', 'tools', 'subagents', 'agents']

  private readonly states = new Map<string, LiveTeamState>()
  private readonly memberCaptain = new Map<string, SessionId>()
  /** Never-aborted signal for plugin-initiated followups (mirror routing). */
  private readonly neverAbortSignal = new AbortController().signal

  constructor(ctx: Context) {
    super(ctx, 'teamMode')
    ctx.settings.register(settingsNamespace(TEAM_SETTINGS_NAMESPACE), TeamSettingsSchema)

    ctx.systemPrompt.section({
      name: 'team:protocol',
      order: 115,
      text: (context) => {
        if (context.agent === undefined) return ''
        const active = foldTeamMode(context.agent.session.events)
        if (!active) {
          return 'You may propose team mode for large tasks: call team_create_members — the plugin asks the user first and enables team mode on approval. Otherwise keep working solo.'
        }
        return teamProtocol(this.settingsFor().defaultMemberCount)
      },
    })

    ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
      const member = exec.agent
      if (member === undefined) return await next()
      const captainId = this.memberCaptain.get(member.id)
      if (captainId === undefined || !isMutatingTool(exec.name)) return await next()
      return await this.requestToolApproval(captainId, member, exec)
    })

    ctx.on('session/event', (session, event) => {
      const captainId = this.memberCaptain.get(session.id)
      if (captainId === undefined) return
      void this.mirrorMemberEvent(captainId, session, event)
    })

    ctx.inject(['commands'], (commandCtx) => {
      commandCtx.commands.register({
        name: 'team',
        description: 'Enter or leave captain-member team mode',
        input: { hint: '[on|off]' },
        handler: ({ agent, rawInput }) => {
          const next = rawInput.trim() !== 'off'
          const committed = this.setMode(agent, next)
          return {
            kind: 'success',
            text: next
              ? committed ? 'Team mode on. The captain will ask before creating members.' : 'Team mode is already active.'
              : committed ? 'Team mode off.' : 'Team mode is already inactive.',
          }
        },
      })
    })

    this.registerTools()
  }

  /** Read logged team mode for one agent. */
  isActive(agent: Agent): boolean {
    return foldTeamMode(agent.session.events)
  }

  /** Set team mode on the agent's own log. */
  setMode(agent: Agent, active: boolean): boolean {
    if (foldTeamMode(agent.session.events) === active) return false
    agent.session.append('team/mode', { active })
    return true
  }

  private settingsFor(): TeamSettings {
    const section = this.ctx.settings.get(settingsNamespace(TEAM_SETTINGS_NAMESPACE)) as TeamSettings | undefined
    return {
      defaultMemberCount: section?.defaultMemberCount ?? 1,
      members: section?.members ?? [],
    }
  }

  private stateFor(captainId: SessionId): LiveTeamState {
    const key = String(captainId)
    let state = this.states.get(key)
    if (state === undefined) {
      state = { captainId, members: [], pending: new Map(), lastInbound: new Map(), blocked: new Set() }
      this.states.set(key, state)
    }
    return state
  }

  private registerTools(): void {
    const service = this

    service.ctx.tools.register(defineTool({
      name: 'team_create_members',
      description:
        'Ask the user, then create or extend the captain-member team. The user is the only authority on the final member count. '
        + 'May be called even when team mode is off: the plugin asks the user first, and team mode turns on automatically on approval. '
        + 'Members inherit the captain model unless the team settings override them. Total members never exceed 5.',
      parameters: {
        count: { type: 'integer', required: true, description: 'Number of members the captain recommends (1-5).' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            created: { type: 'array', items: { type: 'string' }, required: true },
            total: { type: 'integer', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: `Team roster updated: ${value.total} member(s) available.` }],
      },
      async execute(args, exec) {
        const captain = exec.agent
        if (captain === undefined) throw new Error('team_create_members requires a calling agent')
        const requested = Math.max(1, Math.min(MAX_MEMBERS, (args as TeamCreateArgs).count))
        if (!foldTeamMode(captain.session.events)) {
          // Team mode off: the tool doubles as the proposal path. The user
          // approves enabling the mode together with the member count.
          const confirmed = await service.askEnableTeam(captain, requested, exec.signal)
          captain.session.append('team/mode', { active: true })
          return await service.createMembers(captain, confirmed, exec.signal)
        }
        const confirmed = await service.askMemberCount(captain, requested, exec.signal)
        return await service.createMembers(captain, confirmed, exec.signal)
      },
    }))

    service.ctx.tools.register(defineTool({
      name: 'team_send_to_member',
      description: 'Send a task or feedback to one team member. The message becomes the member\'s next turn.',
      parameters: {
        member_id: { type: 'string', required: true, description: 'Member session id from team_status or team_create_members.' },
        message: { type: 'string', required: true, description: 'The task or feedback to deliver.' },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { messageId: { type: 'string', required: true } } },
        render: (_args, value) => [{ type: 'text', text: `Message queued for member ${String(value.messageId)}.` }],
      },
      async execute(args, exec) {
        const captain = exec.agent
        if (captain === undefined) throw new Error('team_send_to_member requires a calling agent')
        const send = args as TeamSendArgs
        const state = service.stateFor(captain.id)
        const member = state.members.find((entry: TeamMemberRecord) => entry.sessionId === send.member_id)
        if (member === undefined) throw new Error(`unknown team member "${send.member_id}"`)
        const content: ContentBlock[] = [{ type: 'text', text: send.message }]
        const messageId = await service.ctx.subagents.followup(
          captain,
          SessionId(member.sessionId),
          content,
          { source: { kind: 'coordinator', form: 'relay', senderSessionId: captain.id }, signal: exec.signal },
        )
        // A direct captain task resets member-member routing: the member's
        // next reply belongs to the captain, not to a member peer.
        state.lastInbound.delete(member.sessionId)
        captain.session.append('team/message', {
          channel: 'captain-member',
          sender: captain.id,
          recipient: member.sessionId,
          role: 'user',
          text: send.message,
        } satisfies TeamMessageRecord)
        return { messageId }
      },
    }))

    service.ctx.tools.register(defineTool({
      name: 'team_relay',
      description: 'Relay a message from one member to another through the captain, keeping member-member collaboration visible.',
      parameters: {
        from_member_id: { type: 'string', required: true },
        to_member_id: { type: 'string', required: true },
        message: { type: 'string', required: true },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { messageId: { type: 'string', required: true } } },
        render: (_args, value) => [{ type: 'text', text: `Relay queued for member ${String(value.messageId)}.` }],
      },
      async execute(args, exec) {
        const captain = exec.agent
        if (captain === undefined) throw new Error('team_relay requires a calling agent')
        const relay = args as TeamRelayArgs
        const state = service.stateFor(captain.id)
        const from = state.members.find((entry: TeamMemberRecord) => entry.sessionId === relay.from_member_id)
        const to = state.members.find((entry: TeamMemberRecord) => entry.sessionId === relay.to_member_id)
        if (from === undefined || to === undefined) throw new Error('team_relay requires two known member ids')
        const text = `[来自 ${from.label}] ${relay.message}`
        const messageId = await service.ctx.subagents.followup(
          captain,
          SessionId(to.sessionId),
          [{ type: 'text', text }],
          { source: { kind: 'coordinator', form: 'relay', senderSessionId: captain.id }, signal: exec.signal },
        )
        captain.session.append('team/message', {
          channel: 'member-member',
          sender: from.sessionId,
          recipient: to.sessionId,
          role: 'user',
          text: relay.message,
        } satisfies TeamMessageRecord)
        return { messageId }
      },
    }))

    service.ctx.tools.register(defineTool({
      name: 'team_member_send',
      description:
        'Send a message directly to another member of your team (member tool, 先斩后奏: the message is delivered immediately and the captain is notified of every send). '
        + 'The recipient receives it as their next turn; replies are routed back to you while the captain keeps the conversation visible and may terminate it with team_stop_member_chat.',
      parameters: {
        member_id: { type: 'string', required: true, description: 'Recipient member session id from the roster.' },
        message: { type: 'string', required: true, description: 'The message to deliver.' },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { messageId: { type: 'string', required: true } } },
        render: (_args, value) => [{ type: 'text', text: `Message delivered to member ${String(value.messageId)}.` }],
      },
      async execute(args, exec) {
        const member = exec.agent
        if (member === undefined) throw new Error('team_member_send requires a calling agent')
        const captainId = service.memberCaptain.get(member.id)
        if (captainId === undefined) throw new Error('team_member_send is only available to team members')
        const send = args as TeamSendArgs
        const state = service.stateFor(captainId)
        if (send.member_id === member.id) throw new Error('cannot send a message to yourself')
        const target = state.members.find((entry: TeamMemberRecord) => entry.sessionId === send.member_id)
        if (target === undefined) throw new Error(`unknown team member "${send.member_id}"`)
        if (state.blocked.has(pairKey(member.id, target.sessionId))) {
          throw new Error('该成员对话已被队长终止；请通过队长中转消息。')
        }
        const captain = service.ctx.agents.get(captainId)
        if (captain === undefined) throw new Error('队长当前不在线，无法送达成员消息')
        const messageId = await service.ctx.subagents.followup(
          captain,
          SessionId(target.sessionId),
          [{ type: 'text', text: send.message }],
          { source: { kind: 'coordinator', form: 'relay', senderSessionId: captain.id }, signal: exec.signal },
        )
        captain.session.append('team/message', {
          channel: 'member-member',
          sender: member.id,
          recipient: target.sessionId,
          role: 'user',
          text: send.message,
        } satisfies TeamMessageRecord)
        // Route the recipient's next reply back to the sender.
        state.lastInbound.set(target.sessionId, { peer: member.id })
        // 先斩后奏: report every direct send to the captain so it can
        // terminate the conversation when it is unnecessary.
        captain.followup(createUserMessage({
          content: [{
            type: 'text',
            text: `成员 ${service.memberLabel(captainId, member.id)} 直接向成员 ${service.memberLabel(captainId, target.sessionId)} 发送了消息："${send.message}"。`
              + '如需终止该成员对话，请调用 team_stop_member_chat。',
          }],
          source: { kind: 'plugin', plugin: 'team-mode', form: 'notice', summary: '成员互发报告' },
        }))
        return { messageId }
      },
    }))

    service.ctx.tools.register(defineTool({
      name: 'team_stop_member_chat',
      description: 'Terminate a member-to-member conversation (captain tool): the two members can no longer message each other directly.',
      parameters: {
        member_a_id: { type: 'string', required: true, description: 'One side of the member-member conversation.' },
        member_b_id: { type: 'string', required: true, description: 'The other side of the member-member conversation.' },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { accepted: { type: 'boolean', required: true } } },
        render: (_args, value) => [{ type: 'text', text: value.accepted ? 'Member conversation terminated.' : 'No active member conversation to terminate.' }],
      },
      async execute(args, exec) {
        const captain = exec.agent
        if (captain === undefined) throw new Error('team_stop_member_chat requires a calling agent')
        const stop = args as TeamStopArgs
        const state = service.stateFor(captain.id)
        const a = state.members.find((entry: TeamMemberRecord) => entry.sessionId === stop.member_a_id)
        const b = state.members.find((entry: TeamMemberRecord) => entry.sessionId === stop.member_b_id)
        if (a === undefined || b === undefined) throw new Error('team_stop_member_chat requires two known member ids')
        const key = pairKey(a.sessionId, b.sessionId)
        const accepted = !state.blocked.has(key)
        state.blocked.add(key)
        state.lastInbound.delete(a.sessionId)
        state.lastInbound.delete(b.sessionId)
        captain.session.append('team/message', {
          channel: 'member-member',
          sender: a.sessionId,
          recipient: b.sessionId,
          role: 'notice',
          text: '队长已终止该成员对话。',
        } satisfies TeamMessageRecord)
        return { accepted }
      },
    }))

    service.ctx.tools.register(defineTool({
      name: 'team_approve_tool',
      description: 'Decide a member\'s pending mutating-tool request: allow, deny, or queue it.',
      parameters: {
        request_id: { type: 'string', required: true },
        decision: { type: 'string', enum: ['allow', 'deny', 'queue'], required: true },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { accepted: { type: 'boolean', required: true } } },
        render: () => [{ type: 'text', text: 'Tool decision recorded.' }],
      },
      async execute(args, exec) {
        const captain = exec.agent
        if (captain === undefined) throw new Error('team_approve_tool requires a calling agent')
        const approve = args as TeamApproveArgs
        const accepted = service.approveTool(captain.id, approve.request_id, approve.decision)
        return { accepted }
      },
    }))

    service.ctx.tools.register(defineTool({
      name: 'team_status',
      description: 'Read the current team roster and pending tool requests.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            active: { type: 'boolean', required: true },
            members: { type: 'json', required: true },
            pendingRequests: { type: 'json', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      async execute(_args, exec) {
        const captain = exec.agent
        if (captain === undefined) throw new Error('team_status requires a calling agent')
        const state = service.stateFor(captain.id)
        return {
          active: foldTeamMode(captain.session.events),
          members: state.members as unknown as JsonValue,
          pendingRequests: [...state.pending.entries()].map(([requestId, request]) => ({
            requestId,
            memberId: request.memberId,
            toolName: request.toolName,
            resource: request.resource,
          })) as unknown as JsonValue,
        }
      },
    }))
  }

  /** Ask the user to confirm or edit the captain's requested member count. */
  private async askMemberCount(captain: Agent, recommended: number, signal: AbortSignal): Promise<number> {
    const questions = this.ctx.get('userQuestions')
    if (questions === undefined) return recommended
    const recommendedLabel = `创建 ${recommended} 名成员`
    const answer = await questions.ask({
      questions: [{
        id: 'team-create-members',
        header: '组建队长-成员团队',
        question: `队长建议创建 ${recommended} 名成员，是否开始？`,
        detail: '如需调整人数，请在自定义回答中填写 1-5 的数字。',
        options: [
          { label: recommendedLabel, description: '按队长建议人数创建成员。' },
          { label: '暂不创建', description: '队长先继续与用户沟通。' },
        ],
      }],
      agent: captain,
      signal,
    }).catch((cause: unknown) => {
      const code = typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : ''
      if (code === 'ASK_CANCELLED') throw new Error('用户取消了本次建队请求；停止建队并等待用户的下一步指示。')
      throw cause
    })
    const item = answer.answers.find(entry => entry.id === 'team-create-members')
    const selected = item?.selected[0] ?? ''
    if (selected === '暂不创建') throw new Error('用户选择暂不创建成员；先与用户继续确认需求。')
    if (item?.custom !== undefined) {
      const parsed = /(\d+)/.exec(item.custom)?.[1]
      if (parsed !== undefined) return Math.max(1, Math.min(MAX_MEMBERS, Number(parsed)))
    }
    return recommended
  }

  /** Ask the user whether to enable team mode AND create members (mode is off). */
  private async askEnableTeam(captain: Agent, recommended: number, signal: AbortSignal): Promise<number> {
    const questions = this.ctx.get('userQuestions')
    if (questions === undefined) return recommended
    const answer = await questions.ask({
      questions: [{
        id: 'team-enable-create',
        header: '开启队长-成员模式',
        question: `AI 认为该任务规模较大、适合团队拆分。是否开启队长-成员模式并创建 ${recommended} 名成员？`,
        detail: '如需调整人数，请在自定义回答中填写 1-5 的数字。',
        options: [
          { label: `开启并创建 ${recommended} 名成员`, description: '开启团队模式并按此人数创建成员。' },
          { label: '暂不开启', description: '以普通方式继续处理任务，不建队。' },
        ],
      }],
      agent: captain,
      signal,
    }).catch((cause: unknown) => {
      const code = typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : ''
      if (code === 'ASK_CANCELLED') throw new Error('用户取消了本次建队请求；停止建队并等待用户的下一步指示。')
      throw cause
    })
    const item = answer.answers.find(entry => entry.id === 'team-enable-create')
    const selected = item?.selected[0] ?? ''
    if (selected === '暂不开启') throw new Error('用户暂不开启团队模式；停止建队，以普通方式继续处理任务。')
    if (item?.custom !== undefined) {
      const parsed = /(\d+)/.exec(item.custom)?.[1]
      if (parsed !== undefined) return Math.max(1, Math.min(MAX_MEMBERS, Number(parsed)))
    }
    return recommended
  }

  /** Display label of one member within a captain's team. */
  private memberLabel(captainId: SessionId, sessionId: string): string {
    const member = this.stateFor(captainId).members.find(entry => entry.sessionId === sessionId)
    return member?.label ?? sessionId
  }

  private async createMembers(captain: Agent, count: number, signal: AbortSignal): Promise<{ created: string[]; total: number }> {
    const state = this.stateFor(captain.id)
    const settings = this.settingsFor()
    const existing = state.members.length
    const needed = Math.max(0, Math.min(MAX_MEMBERS, count) - existing)
    const created: string[] = []
    for (let index = 0; index < needed; index++) {
      const slot = existing + index
      const template = settings.members[slot]
      const label = template?.label?.trim() || `成员${slot + 1}`
      const provider = template?.provider?.trim() || captain.options.provider || ''
      const model = template?.model?.trim() || captain.options.model || ''
      const start = await this.ctx.subagents.startContinuable({
        provider: 'spawn',
        label,
        request: {
          prompt: [{ type: 'text', text: `你是队长-成员团队中的${label}。请等待队长通过后续消息分配任务；在收到任务前不要执行任何工具。` }],
          parent: captain,
          agentOptions: {
            ...(provider === '' ? {} : { provider }),
            ...(model === '' ? {} : { model }),
          },
          // Members may spawn their own subagents, capped at the same bound
          // as the member roster (5 levels of delegation depth).
          maxDepth: MAX_MEMBERS,
          toolFilter: { deny: TEAM_TOOL_NAMES },
        },
        signal,
      })
      const member: TeamMemberRecord = {
        sessionId: start.childId,
        label,
        provider: provider || captain.options.provider || 'inherited',
        model: model || captain.options.model || 'inherited',
      }
      state.members.push(member)
      this.memberCaptain.set(start.childId, captain.id)
      created.push(start.childId)
      captain.session.append('team/message', {
        channel: 'captain-member',
        sender: captain.id,
        recipient: start.childId,
        role: 'notice',
        text: `成员 ${label} 已加入团队。`,
      } satisfies TeamMessageRecord)
    }
    captain.session.append('team/roster', { members: state.members.map(member => ({ ...member })) })
    return { created, total: state.members.length }
  }

  private async requestToolApproval(captainId: SessionId, member: Agent, exec: ToolExecution): Promise<PreToolDecision> {
    const captain = this.ctx.agents.get(captainId)
    if (captain === undefined) return { kind: 'deny', reason: '队长当前不在线，无法审批该工具调用' }
    const requestId = randomUUID()
    const resource = resourceLabel(exec)
    const state = this.stateFor(captainId)
    const decision = new Promise<'allow' | 'deny' | 'queue'>((resolve) => {
      const timer = setTimeout(() => resolve('deny'), 120_000)
      state.pending.set(requestId, { resolve, timer, memberId: member.id, toolName: exec.name, resource })
      const abort = (): void => { resolve('deny') }
      exec.signal.addEventListener('abort', abort, { once: true })
      void decision.then(() => exec.signal.removeEventListener('abort', abort))
    })
    captain.session.append('team/tool-request', {
      requestId, memberId: member.id, toolName: exec.name, resource, status: 'pending',
    })
    captain.followup(createUserMessage({
      content: [{
        type: 'text',
        text: `成员请求执行工具：${exec.name}，目标：${resource}。请调用 team_approve_tool(request_id="${requestId}") 决定 allow / deny / queue。`,
      }],
      source: { kind: 'plugin', plugin: 'team-mode', form: 'notice', summary: '成员工具审批' },
    }))
    const outcome = await decision
    const pending = state.pending.get(requestId)
    if (pending !== undefined) clearTimeout(pending.timer)
    state.pending.delete(requestId)
    captain.session.append('team/tool-decision', { requestId, outcome })
    if (outcome === 'allow') {
      captain.session.append('team/tool-request', {
        requestId, memberId: member.id, toolName: exec.name, resource, status: 'allowed',
      })
      return { kind: 'allow' }
    }
    if (outcome === 'queue') {
      return { kind: 'deny', reason: '队长已将此次工具调用排队；请稍后重试或先处理其他任务' }
    }
    return { kind: 'deny', reason: '队长拒绝了此次工具调用；请改用其他方式完成任务并向队长汇报' }
  }

  private approveTool(captainId: SessionId, requestId: string, decision: 'allow' | 'deny' | 'queue'): boolean {
    const request = this.stateFor(captainId).pending.get(requestId)
    if (request === undefined) return false
    request.resolve(decision)
    return true
  }

  /**
   * Mirror one member event into the captain log. When the member is mid-way
   * through a member-member conversation (lastInbound routing), the reply is
   * logged on the member-member channel and forwarded to the peer so the
   * conversation continues; otherwise it lands on the captain-member channel
   * as before. A terminated conversation stops forwarding and falls back to
   * the captain-member mirror.
   */
  private async mirrorMemberEvent(captainId: SessionId, session: Session, event: SessionEvent): Promise<void> {
    const captain = this.ctx.agents.get(captainId)
    if (captain === undefined) return
    if (event.type === 'user/message' || event.type === 'assistant/message') {
      const role = event.type === 'user/message' ? 'user' : 'assistant'
      const content = event.type === 'user/message'
        ? event.data.content
        : event.data.message.content
      const text = textOf(content)
      if (text === '') return
      const state = this.stateFor(captainId)
      const inbound = state.lastInbound.get(session.id)
      if (inbound !== undefined) {
        // Member-member routing: this reply belongs to the member conversation.
        state.lastInbound.delete(session.id)
        captain.session.append('team/message', {
          channel: 'member-member',
          sender: session.id,
          recipient: inbound.peer,
          role,
          text,
        } satisfies TeamMessageRecord)
        if (!state.blocked.has(pairKey(session.id, inbound.peer))) {
          state.lastInbound.set(inbound.peer, { peer: session.id })
          try {
            await this.ctx.subagents.followup(
              captain,
              SessionId(inbound.peer),
              [{ type: 'text', text }],
              {
                source: { kind: 'coordinator', form: 'relay', senderSessionId: captain.id },
                signal: this.neverAbortSignal,
              },
            )
          } catch {
            // The peer vanished or refused admission: drop the routing so the
            // conversation ends instead of retrying forever.
            state.lastInbound.delete(inbound.peer)
          }
        }
        return
      }
      captain.session.append('team/message', {
        channel: 'captain-member',
        sender: session.id,
        recipient: captainId,
        role,
        text,
      } satisfies TeamMessageRecord)
    } else if (event.type === 'tool/result') {
      const text = textOf(event.data.message.content)
      captain.session.append('team/message', {
        channel: 'captain-member',
        sender: session.id,
        recipient: captainId,
        role: 'tool',
        text: text === '' ? '工具执行完成' : text,
      } satisfies TeamMessageRecord)
    }
  }
}
