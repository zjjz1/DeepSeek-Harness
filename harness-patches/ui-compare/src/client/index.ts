/** Browser plugin owning the compare & merge sidebar entry. */

import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: locale Context merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.footer.action' row).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { ComparePanel, type ComparePanelInjected } from './ComparePanel.tsx'
import { en, NS, zh, type CompareKey } from './locales.ts'

export type { CompareKey } from './locales.ts'
export type { ComparePanelInjected, ComparePanelProps } from './ComparePanel.tsx'
export type { CompareRow, CompareSession, WireEvent } from './history.ts'
export { eventToRow, eventsToRows, rowsToMarkdown, sessionsToMergedMarkdown } from './history.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The compare entry and panel copy. */
    'ui-compare': CompareKey
  }
}

/** Services required by the compare plugin. */
export const inject = ['slots', 'locale', 'connection']

/**
 * Register the compare entry into the sidebar-foot action list.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-compare: dictionaries')

  const injected = (): ComparePanelInjected => ({
    api: (ctx.get('connection') as ConnectionHandle).api,
  })
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'compare',
    // Between statistics (-10) and plugin-market (0).
    order: -5,
    locale: NS,
    inject: injected,
  }, ComparePanel))
}
