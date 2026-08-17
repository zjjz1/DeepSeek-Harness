/**
 * Captain-member team view plugin, browser half: registers the team
 * conversation view tab and the team-mode settings row. The host team-mode
 * service mirrors every team line into the captain log as `team/message`; the
 * definitions below turn those log-only events into the `team` snapshot the
 * TeamView renders. The settings row owns the durable team-mode namespace
 * (default member count and per-slot member label/model templates).
 */
import type { Context } from '@deepseek-ai/cordis'
import type {
  ConversationNodeDefinition,
  SessionId,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: locale Context merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the 'settings.general.item' SlotMap row and ctx.settingsScope
// Context merge live in ui-settings.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: conversation.view slot declaration.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { en, NS, zh, type TeamKey } from './locales.ts'
import { teamViewDefinition, type TeamConversationViewNode, type TeamSettingsView } from './team-contract.ts'
import { TeamView } from './TeamView.tsx'
import { TeamSettingsRow, type TeamSettingsRowInjected, type TeamCatalogModel } from './TeamSettingsRow.tsx'
import { createTeamSettingsRowStore } from './team-settings-store.ts'

export type { TeamKey } from './locales.ts'
export type { TeamSnapshot, TeamMessageView, TeamMemberView, TeamChannel, TeamSettingsView, TeamMemberConfigView } from './team-contract.ts'
export type { TeamSettingsRowInjected, TeamSettingsRowComponentProps, TeamCatalogModel } from './TeamSettingsRow.tsx'
export type { TeamSettingsRowState } from './team-settings-store.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The team conversation view tab copy. */
    'ui-team': TeamKey
  }
}

/** Services required by the team view and settings row. */
export const inject = [
  'slots', 'locale', 'sessions', 'conversationEvents', 'conversationViews',
  'settingsScope', 'connection', 'remote',
]

/** Register one simple append-only definition over a team event kind. */
function registerTeamEvent(
  ctx: Context,
  kind: 'team-mode' | 'team-roster' | 'team-message',
  eventType: 'team/mode' | 'team/roster' | 'team/message',
): void {
  const definition: ConversationNodeDefinition<unknown> = {
    kind,
    target: 'team',
    match: event => event.type === eventType
      ? { id: String(event.seq), role: 'start' }
      : null,
    start: (_context, match) => match.event.data,
    update: context => context.state,
    buildViewNode: (context): TeamConversationViewNode | null => ({
      // The engine-owned stable key (conversationContextKey); a custom key
      // here fails the assembler's unstable-key check.
      key: context.key,
      kind,
      id: context.id,
      target: 'team',
      anchorSeq: context.start?.event.seq ?? 0,
      data: context.state,
    }),
  }
  ctx.conversationEvents.register(definition)
}

/** Flatten the host model catalog into one menu-friendly model list. */
async function loadModelCatalog(ctx: Context): Promise<readonly TeamCatalogModel[]> {
  const connection = ctx.get('connection') as ConnectionHandle
  const response = await connection.api.llm.models({})
  if (!response.result.ok) throw new Error(response.result.error.message)
  return response.result.value.groups.flatMap(group =>
    group.models.map(model => ({
      provider: group.id,
      providerName: group.name,
      model: model.id,
    })))
}

/**
 * Client plugin body: team event definitions, team snapshot target, the
 * conversation view tab, and the team-mode settings row.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-team: dictionaries')
  registerTeamEvent(ctx, 'team-mode', 'team/mode')
  registerTeamEvent(ctx, 'team-roster', 'team/roster')
  registerTeamEvent(ctx, 'team-message', 'team/message')
  ctx.conversationViews.register(teamViewDefinition)

  const t = ctx.locale.bind(NS)
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'team',
    order: 12,
    locale: NS,
    label: () => t('view.label'),
    inject: (_sessionId: SessionId) => ({}),
  }, TeamView))

  // Team-mode settings surface: the settings scope owns the durable truth;
  // the store mirrors it and every write goes through the scope.
  const host = ctx.settingsScope.bind<TeamSettingsView>({ namespace: 'team-mode' })
  const teamSettingsStore = createTeamSettingsRowStore()
  let teamSettingsBound: BoundActions<typeof teamSettingsStore> | undefined
  const teamSettingsSync = (): void => {
    const snapshot = host.getSnapshot()
    if (snapshot.value === undefined || snapshot.revision === undefined) return
    teamSettingsBound?.sync(snapshot.value, snapshot.revision)
  }
  ctx.effect(() => host.subscribe(teamSettingsSync), 'ui-team: team settings adoption')
  const teamSettingsInjected = (actions: BoundActions<typeof teamSettingsStore>): TeamSettingsRowInjected => {
    teamSettingsBound = actions
    // Re-sync from the getter so no snapshot is lost between registration and
    // first render (the store's revision guard drops stale duplicates).
    teamSettingsSync()
    return {
      setDefaultMemberCount: (count) => { void host.set('defaultMemberCount', count) },
      setMemberConfig: (index, config) => {
        const current = host.getSnapshot().value
        const members = [...(current?.members ?? [])]
        while (members.length <= index) {
          members.push({ label: '', provider: '', model: '', cwd: '' })
        }
        members[index] = { ...config }
        void host.set('members', members)
      },
      loadModels: () => loadModelCatalog(ctx),
    }
  }
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'team-settings',
    order: 60,
    store: teamSettingsStore,
    locale: NS,
    inject: teamSettingsInjected,
  }, TeamSettingsRow))
}
