/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-notify-windows`.
 * @module @deepseek-ai/dsh-notify-windows/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-notify-windows'

/** Cordis companion plugin name. */
export const name = 'notify-windows-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the plugin is a passive session/event observer whose
 * only side effect is an OS toast (a best-effort presentation action, not
 * durable or model-visible state). The turn/end + session/title event relations
 * it reads are owned and runtime-checked by dsh-session and dsh-agent-loop.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
