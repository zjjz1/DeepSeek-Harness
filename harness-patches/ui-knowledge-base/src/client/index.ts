/** Browser plugin owning the knowledge-base settings row. */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: locale Context merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the 'settings.general.item' SlotMap row and ctx.settingsScope
// Context merge live in ui-settings.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { KnowledgeBaseRow, type KnowledgeBaseRowInjected } from './KnowledgeBaseRow.tsx'
import { en, NS, zh, type KnowledgeBaseKey } from './locales.ts'

export type { KnowledgeBaseKey } from './locales.ts'
export type { KnowledgeBaseRowInjected, KnowledgeBaseRowProps } from './KnowledgeBaseRow.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The knowledge-base settings row copy. */
    'ui-knowledge-base': KnowledgeBaseKey
  }
}

/** Services required by the knowledge-base row. */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

/**
 * Register the knowledge-base row into the General settings section.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-knowledge-base: dictionaries')

  const host = ctx.settingsScope.bind<{ dirs: string[] }>({ namespace: 'knowledge-base' })
  let current: { dirs: string[] } | undefined
  ctx.effect(() => host.subscribe(() => {
    current = host.getSnapshot().value
  }), 'ui-knowledge-base: settings adoption')
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'knowledge-base',
    order: 65,
    locale: NS,
    inject: (): KnowledgeBaseRowInjected => ({
      dirs: current?.dirs ?? [],
      setDirs: (dirs) => { void host.set('dirs', dirs) },
    }),
  }, KnowledgeBaseRow))
}
