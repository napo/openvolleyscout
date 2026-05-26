/**
 * Team domain models
 * Distinguishes between:
 * - ArchivedTeam: A team with full known roster saved in the archive
 * - ArchivedRoster: All players known for a team across time
 */

import type { PlayerRole } from '../common/enums';
import type { TeamStaff } from '../roster/types';

/**
 * Extended player with match selection flag
 * Used in context of a match to distinguish archived data from match selection
 */
export interface ArchivedPlayer {
  id: string;
  jerseyNumber: number;
  firstName: string;
  lastName: string;
  playerCode: string;
  shortName?: string;
  role?: PlayerRole;
  handedness?: string;
  birthDate?: string;
  notes?: string;
  isLibero?: boolean;
  isCaptain?: boolean;
}

/**
 * Complete roster for a team across time
 * Contains all known players for the team
 */
export interface ArchivedRoster {
  id: string;
  teamId: string;
  players: ArchivedPlayer[];
}

/**
 * A team saved in the local archive
 * Contains team metadata and full known roster.
 * `id` is the technical unique identifier.
 * `teamCode` is a stable human-readable generated code.
 */
export interface ArchivedTeam {
  id: string;
  teamCode: string;
  name: string;
  shortName?: string;
  federation?: string;
  club?: string;
  staff: TeamStaff;
  rosterIds: string[]; // Historical rosters - currently using only latest
  createdAt: number;
  updatedAt: number;
}
