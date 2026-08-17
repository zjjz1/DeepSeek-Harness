/**
 * Startup-launch preference row plugin, browser half: registers the
 * General-section item that selects the desktop shell's open-at-login mode
 * (off / on / silent). The preference itself lives in the Electron shell;
 * this half only bridges it through the webview preload.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the 'settings.general.item' SlotMap row lives in ui-settings.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { en, NS, zh, type StartupLaunchKey } from './locales.ts'
import { StartupLaunchRow } from './StartupLaunchRow.tsx'

export type { StartupLaunchKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The startup-launch settings row copy. */
    'ui-startup-launch': StartupLaunchKey
  }
}

/** Services required by the startup-launch plugin. */
export const inject = ['slots', 'locale']

/**
 * Register the startup-launch row into the General settings section.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-startup-launch: dictionaries')

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'startup-launch',
    order: 50,
    locale: NS,
  }, StartupLaunchRow))
}
