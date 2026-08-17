/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-startup-launch`.
 * @module @deepseek-ai/dsh-client-ui-startup-launch/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-startup-launch'

/** Cordis companion plugin name. */
export const name = 'client-ui-startup-launch-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a pure-consumer settings row whose open-at-login
 * preference lives in the desktop shell (Electron), reachable only through
 * the webview preload bridge; the row degrades to a disabled hint when the
 * bridge is absent, and the slot registration itself is validated by the
 * slot core.
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
