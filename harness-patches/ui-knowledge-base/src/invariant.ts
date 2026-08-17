/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-knowledge-base`.
 * @module @deepseek-ai/dsh-client-ui-knowledge-base/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-knowledge-base'

/** Cordis companion plugin name. */
export const name = 'client-ui-knowledge-base-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a pure settings-surface row writing the host
 * knowledge-base namespace through the settings scope; the namespace schema
 * and tool behavior are owned by the host package.
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
