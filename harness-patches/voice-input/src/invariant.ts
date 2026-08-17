/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-voice-input`.
 * @module @deepseek-ai/dsh-voice-input/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-voice-input'

/** Cordis companion plugin name. */
export const name = 'voice-input-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the plugin only registers a settings namespace whose
 * schema and credential handling are validated by the settings registry; the
 * transcription behavior lives in the desktop shell.
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
