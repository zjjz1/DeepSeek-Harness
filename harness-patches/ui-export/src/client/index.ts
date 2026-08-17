/** Browser plugin owning the transcript export header utility. */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: locale Context merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the 'conversation.session.header.utilities' SlotMap row lives in
// ui-conversation.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ExportAction } from './ExportAction.tsx'
import { en, NS, zh, type ExportKey } from './locales.ts'

export type { ExportKey } from './locales.ts'
export type { ExportRow } from './exporters.ts'
export {
  nodesToRows, nodeToRow, rowsToMarkdown, rowsToHtml, rowsToSvg, exportStem,
} from './exporters.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The transcript export header utility copy. */
    'ui-export': ExportKey
  }
}

/** Services required by the export utility. */
export const inject = ['slots', 'locale']

/**
 * Register the Export utility into the Session header's right-aligned group.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-export: dictionaries')

  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'ui-export',
    order: 10,
    locale: NS,
    inject: (): Record<string, never> => ({}),
  }, ExportAction))
}
