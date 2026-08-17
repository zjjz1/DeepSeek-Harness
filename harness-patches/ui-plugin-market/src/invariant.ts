/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-plugin-market`.
 * @module @deepseek-ai/dsh-client-ui-plugin-market/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-plugin-market'

/** Cordis companion plugin name. */
export const name = 'client-ui-plugin-market-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a pure-consumer plugin registering one sidebar-foot
 * entry whose modal open state and iframe URL are presentation-local viewing
 * facts; the slot registration itself is validated by the slot core, and the
 * interaction behavior is covered by this package's component tests.
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
