/**
 * Fixture data for the "getting started" tutorial slide-show (teams → new
 * match → set setup), reusing the same real roster the live-scouting
 * tutorial uses (see `../fixtures/serve-rally.dvw.ts`): Melodic Spikers vs
 * Hollywood Blockers, a fictional roster of Italian singer/actress names, no
 * real-athlete privacy concern.
 *
 * Player order within each team matters: `createSuggestedTeamSetSetup`
 * assigns the default role sequence (setter, OH1, MB2, opposite, OH2, MB1)
 * positionally to the first six non-libero players, so the array below is
 * ordered to match that sequence exactly.
 */
import type { Player, Team } from '@src/domain/roster/types';
import { createMatchRosterSelectionPlayer } from '@src/domain/match';
import type { MatchRosterSelectionPlayer } from '@src/domain/match/types';
import { createDefaultScoutingMatchConfig } from '@src/domain/scouting';
import type { MatchReadinessResult } from '@src/lib/validation/match-readiness';
import {
  createSuggestedTeamSetSetup,
  syncTeamSetSetupLiberos,
  type SetStartSetupState,
} from '../../model/set-start';

function player(
  id: string,
  jerseyNumber: number,
  firstName: string,
  lastName: string,
  extra: Partial<Player> = {},
): Player {
  return {
    id,
    jerseyNumber,
    firstName,
    lastName,
    shortName: lastName,
    playerCode: `${firstName.slice(0, 3).toUpperCase()}-${lastName.slice(0, 3).toUpperCase()}`,
    role: 'outside_hitter',
    ...extra,
  };
}

const homePlayers: Player[] = [
  player('mel-14', 14, 'Annalisa', 'Scarrone', { role: 'setter', isCaptain: true }),
  player('mel-11', 11, 'Laura', 'Pausini', { role: 'outside_hitter' }),
  player('mel-7', 7, 'Emma', 'Marrone', { role: 'middle_blocker' }),
  player('mel-1', 1, 'Elisa', 'Toffoli', { role: 'opposite' }),
  player('mel-17', 17, 'Alessandra', 'Amoroso', { role: 'outside_hitter' }),
  player('mel-18', 18, 'Carmen', 'Consoli', { role: 'middle_blocker' }),
  player('mel-10', 10, 'Elodie', 'Patrizi', { role: 'libero', isLibero: true }),
];

const awayPlayers: Player[] = [
  player('hol-13', 13, 'Miriam', 'Leone', { role: 'setter' }),
  player('hol-4', 4, 'Matilda', 'De Angelis', { role: 'outside_hitter' }),
  player('hol-12', 12, 'Greta', 'Scarano', { role: 'middle_blocker' }),
  player('hol-23', 23, 'Cristiana', 'Capotondi', { role: 'opposite', isCaptain: true }),
  player('hol-6', 6, 'Alice', 'Pagani', { role: 'outside_hitter' }),
  player('hol-14', 14, 'Valentina', 'Romani', { role: 'middle_blocker' }),
  player('hol-5', 5, 'Benedetta', 'Porcaroli', { role: 'libero', isLibero: true }),
];

export const ONBOARDING_HOME_TEAM: Team = {
  id: 'tutorial-onboarding-home',
  code: 'MEL',
  name: 'Melodic Spikers',
  staff: { headCoach: 'Ellie Guerriero', assistantCoach: 'Stefano Settepani' },
  players: homePlayers,
};

export const ONBOARDING_AWAY_TEAM: Team = {
  id: 'tutorial-onboarding-away',
  code: 'HOL',
  name: 'Hollywood Blockers',
  staff: { headCoach: 'Paola Cortellesi', assistantCoach: 'Maura Delpero' },
  players: awayPlayers,
};

export const ONBOARDING_COMPETITION_NAME = 'Festival dello Spettacolo 2024/2025';
export const ONBOARDING_VENUE = 'Teatro Ariston, Sanremo';
export const ONBOARDING_MATCH_DATE = '2024-11-03';
export const ONBOARDING_START_TIME = '18:00';

function toMatchRosterSelectionPlayers(players: Player[]): MatchRosterSelectionPlayer[] {
  return players.map((teamPlayer) => createMatchRosterSelectionPlayer(teamPlayer, { isSelectedForMatch: true }));
}

export const ONBOARDING_HOME_ROSTER: MatchRosterSelectionPlayer[] = toMatchRosterSelectionPlayers(homePlayers);
export const ONBOARDING_AWAY_ROSTER: MatchRosterSelectionPlayer[] = toMatchRosterSelectionPlayers(awayPlayers);

export const ONBOARDING_SCOUTING_CONFIG = createDefaultScoutingMatchConfig('best_of_5');

export const ONBOARDING_READINESS_RESULT: MatchReadinessResult = {
  isReady: true,
  issues: [],
  warnings: [],
  checks: [
    { key: 'projectUsable', labelKey: 'matchReadinessProjectUsable', status: 'passed', detailKeys: [] },
    { key: 'matchIdentification', labelKey: 'matchReadinessMatchIdentification', status: 'passed', detailKeys: [] },
    { key: 'matchDate', labelKey: 'matchReadinessMatchDate', status: 'passed', detailKeys: [] },
    { key: 'startTime', labelKey: 'matchReadinessStartTime', status: 'passed', detailKeys: [] },
    { key: 'homeTeam', labelKey: 'matchReadinessHomeTeam', status: 'passed', detailKeys: [] },
    { key: 'awayTeam', labelKey: 'matchReadinessAwayTeam', status: 'passed', detailKeys: [] },
    { key: 'distinctTeams', labelKey: 'matchReadinessDistinctTeams', status: 'passed', detailKeys: [] },
    { key: 'homeRoster', labelKey: 'matchReadinessHomeRoster', status: 'passed', detailKeys: [] },
    { key: 'awayRoster', labelKey: 'matchReadinessAwayRoster', status: 'passed', detailKeys: [] },
  ],
};

// Same "auto-fill" helper the real set-setup screen's button uses, fed with
// rosters ordered so the default role sequence (setter, OH1, MB2, opposite,
// OH2, MB1) lines up with the players above.
export const ONBOARDING_SET_START_STATE: SetStartSetupState = {
  home: syncTeamSetSetupLiberos(ONBOARDING_HOME_TEAM, {
    ...createSuggestedTeamSetSetup(ONBOARDING_HOME_TEAM),
    displaySide: 'left',
  }),
  away: syncTeamSetSetupLiberos(ONBOARDING_AWAY_TEAM, {
    ...createSuggestedTeamSetSetup(ONBOARDING_AWAY_TEAM),
    displaySide: 'right',
  }),
  servingTeam: 'home',
};
