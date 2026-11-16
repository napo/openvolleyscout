// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Quick start: the match is created from one page (team, who is scouted,
 * starting lineup, first serve, input mode) and set 1 starts right away.
 * Rules take their defaults; any lineup position left empty is filled while
 * scouting, from the server's number when the team serves.
 */
import type { CourtPosition, TeamSide } from '@src/domain/common/enums';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { Team } from '@src/domain/roster/types';
import { PlayerRole } from '@src/domain/systems';
import {
  COURT_POSITIONS,
  REQUIRED_TACTICAL_ROLES,
  assignTacticalRole,
  buildStartingLineup,
  createEmptySetStartSetupState,
  syncTeamSetSetupLiberos,
  type TeamSetSetupState,
} from './set-start';

export type QuickStartLevel = 'basic' | 'tag' | 'court' | 'detailed';

export interface QuickStartRequest {
  /** Jersey number in each starting position of the home team; missing = empty. */
  lineup: Partial<Record<CourtPosition, number>>;
  /** Position of the setter in the starting lineup, when known. */
  setterPosition?: CourtPosition;
  servingTeam: TeamSide;
  level: QuickStartLevel;
  /** Only the home team is scouted: the opponent is a name. */
  ownTeamOnly: boolean;
}

/** Starting lineups of set 1 from the quick start page. */
export function buildQuickStartLineups(
  homeTeam: Team,
  awayTeam: Team,
  request: Pick<QuickStartRequest, 'lineup' | 'setterPosition'>,
  roleSequence: readonly PlayerRole[] = REQUIRED_TACTICAL_ROLES,
): { home: StartingLineup; away: StartingLineup } {
  const empty = createEmptySetStartSetupState();
  let home: TeamSetSetupState = { ...empty.home, slots: { ...empty.home.slots } };
  const used = new Set<string>();
  for (const position of COURT_POSITIONS) {
    const jersey = request.lineup[position];
    const player = jersey === undefined ? undefined : homeTeam.players.find((entry) => entry.jerseyNumber === jersey && !entry.isLibero);
    if (player && !used.has(player.id)) {
      home.slots[position] = player.id;
      used.add(player.id);
    }
  }
  if (request.setterPosition && home.slots[request.setterPosition]) {
    home = assignTacticalRole(home, request.setterPosition, PlayerRole.SETTER, roleSequence);
  }
  home = syncTeamSetSetupLiberos(homeTeam, home);
  const away = syncTeamSetSetupLiberos(awayTeam, empty.away);
  return {
    home: buildStartingLineup('home', home, homeTeam),
    away: buildStartingLineup('away', away, awayTeam),
  };
}

/** Parses a jersey typed in a lineup box: whole numbers 0-99, anything else is empty. */
export function parseLineupJersey(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^\d{1,2}$/.test(trimmed)) return undefined;
  return Number(trimmed);
}
