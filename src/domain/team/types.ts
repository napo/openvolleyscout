/**
 * Team domain models
 * Distinguishes between:
 * - ArchivedTeam: A team with full known roster saved in the archive
 * - ArchivedRoster: All players known for a team across time
 * - MatchRoster: Players selected for the current match report
 */

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
 * Contains team metadata and full known roster
 */
export interface ArchivedTeam {
  id: string;
  name: string;
  staff: TeamStaff;
  rosterIds: string[]; // Historical rosters - currently using only latest
  createdAt: number;
  updatedAt: number;
}

/**
 * Player with match selection context
 * Used during match setup to track which archived players are selected for the current match
 */
export interface MatchPlayer extends ArchivedPlayer {
  isSelectedForMatch?: boolean;
}

/**
 * Match roster - players selected for the current match from an archived team
 */
export interface MatchRoster {
  teamId: string;
  players: MatchPlayer[];
}
