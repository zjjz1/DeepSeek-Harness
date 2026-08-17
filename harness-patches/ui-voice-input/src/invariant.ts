/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-voice-input`.
 * @module @deepseek-ai/dsh-client-ui-voice-input/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-voice-input'

/** Cordis companion plugin name. */
export const name = 'client-ui-voice-input-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a pure-consumer plugin recording audio through the
 * platform MediaRecorder and forwarding it to the desktop shell bridge (a
 * best-effort presentation action with no durable or model-visible state);
 * the credential namespace is owned by the host voice-input package.
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
