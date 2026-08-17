/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-compare`.
 * @module @deepseek-ai/dsh-client-ui-compare/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-compare'

/** Cordis companion plugin name. */
export const name = 'client-ui-compare-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a pure-consumer plugin reading session histories over
 * the read-only wire face and rendering them (pure projections covered by
 * tests); the slot registration is validated by the slot core.
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
