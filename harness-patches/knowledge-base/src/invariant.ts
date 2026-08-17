/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-knowledge-base`.
 * @module @deepseek-ai/dsh-knowledge-base/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-knowledge-base'

/** Cordis companion plugin name. */
export const name = 'knowledge-base-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the plugin reads the user-maintained settings
 * directory list and the filesystem per call (tool results are the only
 * model-visible surface, validated by the tool output schema); the settings
 * schema and tool registrations are validated by their owning registries.
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
