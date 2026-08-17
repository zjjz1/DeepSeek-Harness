/**
 * Team-settings row store: a mirror of the team-mode settings section. The
 * apply-world settings-scope listener is the only writer; the row component
 * reads via props.useStore and writes through injected callbacks.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type { TeamSettingsView } from './team-contract.ts'

/** Store state mirrored from the team-mode settings section. */
export interface TeamSettingsRowState {
  /** Mirrored section; null before the first accepted snapshot. */
  section: TeamSettingsView | null
  /** Settings revision; -1 until first sync so revision 0 lands as a change. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type TeamSettingsRowActions = {
  sync: (draft: TeamSettingsRowState, section: TeamSettingsView, revision: number) => void
}

/**
 * Declares the team-settings row state and write surface.
 * @returns the store handle.
 */
export function createTeamSettingsRowStore(): EngineStoreHandle<TeamSettingsRowState, TeamSettingsRowActions> {
  return defineStore({
    init: (): TeamSettingsRowState => ({ section: null, revision: -1 }),
    actions: {
      sync: (d, section: TeamSettingsView, revision: number) => {
        if (revision <= d.revision) return
        d.section = section
        d.revision = revision
      },
    },
  })
}
