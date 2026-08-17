/**
 * Statistics plugin, browser half: registers the sidebar-foot entry that opens
 * the statistics modal aggregating every session's history.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.footer.action'
// entry) so PropsRuntime<'sidebar.footer.action'> resolves.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { StatisticsEntry } from './StatisticsEntry.tsx'
import { en, NS, zh, type StatisticsKey } from './locales.ts'

export type { StatisticsEntryProps } from './StatisticsEntry.tsx'
export type { StatisticsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Statistics entry and panel chrome copy. */
    statistics: StatisticsKey
  }
}

/** Injected business face: the wire face for session histories. */
export interface StatisticsEntryInjected {
  api: ConnectionHandle['api']
}

/** Services required by the statistics plugin. */
export const inject = ['slots', 'locale', 'connection']

/**
 * Register the statistics entry into the sidebar-foot action list.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-statistics: dictionaries')

  const injected = (): StatisticsEntryInjected => ({
    api: (ctx.get('connection') as ConnectionHandle).api,
  })
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'statistics',
    // Above the plugin-market entry (order 0): negative order places the
    // statistics trigger first in the sidebar-foot action list.
    order: -10,
    locale: NS,
    inject: injected,
  }, StatisticsEntry))
}
