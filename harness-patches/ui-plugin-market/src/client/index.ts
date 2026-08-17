/**
 * Plugin market plugin, browser half: registers the sidebar-foot entry that
 * opens the plugin market modal (local inventory tab + online iframe tab).
 * The panel itself is package-internal; only the plugin body, the locale
 * dictionary, and the entry contract types are exported. Export discipline:
 * packages/client/AGENTS.md.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.footer.action'
// entry) into every program that sees this plugin, so PropsRuntime<'...'>
// resolves and the register call site type-checks.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import { PluginMarketEntry } from './PluginMarketEntry.tsx'
import { en, zh, type PluginMarketKey } from './locales.ts'

export type { PluginMarketEntryProps } from './PluginMarketEntry.tsx'
export type { PluginMarketKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Plugin market entry and panel chrome copy. */
    pluginMarket: PluginMarketKey
  }
}

/** Dictionary namespace owned by this plugin (market copy). */
const NS = 'pluginMarket'

/** Injected business face: the Host Loader inventory read for the local tab. */
export interface PluginMarketInjected {
  /** Read a current Host plugin-inventory snapshot. */
  list: () => Promise<PluginInventorySnapshot>
}

/** Services required by the plugin market plugin. */
export const inject = ['slots', 'locale', 'remote.pluginInventory']

/**
 * Register the plugin market entry into the sidebar-foot action list.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-plugin-market: dictionaries')

  const injected = (): PluginMarketInjected => ({
    list: async () => {
      const result = await ctx.remote.pluginInventory.list()
      if (!result.ok) {
        throw new Error(`pluginInventory.list failed: ${result.error.code}: ${result.error.message}`)
      }
      return result.value
    },
  })

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'plugin-market',
    order: 0,
    locale: NS,
    inject: injected,
  }, PluginMarketEntry))
}
