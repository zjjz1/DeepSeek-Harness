/** Browser plugin owning the reminder surface: fold + header utility. */

import type { Context } from '@deepseek-ai/cordis'
import type {
  ConversationNodeDefinition,
  SessionId,
} from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: locale Context merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the 'conversation.session.header.utilities' SlotMap row lives in
// ui-conversation.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ReminderAction } from './ReminderAction.tsx'
import { scheduleViewDefinition, type ScheduleConversationViewNode } from './contract.ts'
import { en, NS, zh, type ScheduleKey } from './locales.ts'

export type { ScheduleKey } from './locales.ts'
export type { ReminderView, ScheduleSnapshot } from './contract.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The reminder header utility copy. */
    'ui-schedule': ScheduleKey
  }
}

/** Services required by the reminder utility. */
export const inject = ['slots', 'locale', 'conversationEvents', 'conversationViews']

/**
 * Client plugin body: schedule/change fold + the reminder header utility.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-schedule: dictionaries')

  // Mirror the durable schedule/change log into the 'schedule' view snapshot.
  const definition: ConversationNodeDefinition<unknown> = {
    kind: 'schedule-change',
    target: 'schedule',
    match: event => event.type === 'schedule/change'
      ? { id: String(event.seq), role: 'start' }
      : null,
    start: (_context, match) => match.event.data,
    update: context => context.state,
    buildViewNode: (context): ScheduleConversationViewNode | null => ({
      key: context.key,
      kind: 'schedule-change',
      id: context.id,
      target: 'schedule',
      anchorSeq: context.start?.event.seq ?? 0,
      data: context.state,
    }),
  }
  ctx.conversationEvents.register(definition)
  ctx.conversationViews.register(scheduleViewDefinition)

  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'ui-schedule',
    order: 20,
    locale: NS,
    inject: (_sessionId: SessionId) => ({}),
  }, ReminderAction))
}
