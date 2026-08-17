/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-speech`.
 * @module @deepseek-ai/dsh-client-ui-speech/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-speech'

/** Cordis companion plugin name. */
export const name = 'client-ui-speech-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a pure-consumer plugin reading finalized assistant
 * messages from the conversation snapshot and calling the platform speech
 * synthesis API (a best-effort presentation action with no durable or
 * model-visible state).
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
