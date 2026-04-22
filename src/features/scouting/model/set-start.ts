import type { CourtPosition, TeamSide } from '@src/domain/common/enums';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { Team } from '@src/domain/roster/types';
import type { TranslationKey } from '@src/i18n';

export const COURT_POSITIONS: CourtPosition[] = [1, 2, 3, 4, 5, 6];
export type CourtDisplaySide = 'left' | 'right';

export interface TeamSetSetupState {
  slots: Record<CourtPosition, string>;
  setterPlayerId: string;
  liberoPlayerIds: string[];
  displaySide: CourtDisplaySide;
}

export interface SetStartSetupState {
  home: TeamSetSetupState;
  away: TeamSetSetupState;
  servingTeam: TeamSide | null;
}

export interface SetStartValidationResult {
  isValid: boolean;
  homeIssues: TranslationKey[];
  awayIssues: TranslationKey[];
  generalIssues: TranslationKey[];
}

function createEmptyTeamSetSetupState(): TeamSetSetupState {
  return {
    slots: {
      1: '',
      2: '',
      3: '',
      4: '',
      5: '',
      6: '',
    },
    setterPlayerId: '',
    liberoPlayerIds: [],
    displaySide: 'left',
  };
}

export function createEmptySetStartSetupState(): SetStartSetupState {
  return {
    home: createEmptyTeamSetSetupState(),
    away: createEmptyTeamSetSetupState(),
    servingTeam: null,
  };
}

export function getSelectedLineupPlayerIds(teamState: TeamSetSetupState): string[] {
  return COURT_POSITIONS.map((position) => teamState.slots[position]).filter(Boolean);
}

export function getEligibleLiberoPlayerIds(team: Team): string[] {
  return team.players.filter((player) => player.isLibero).map((player) => player.id);
}

function validateTeamSetup(team: Team, teamState: TeamSetSetupState): TranslationKey[] {
  const issues: TranslationKey[] = [];
  const selectedPlayerIds = getSelectedLineupPlayerIds(teamState);
  const uniquePlayerIds = new Set(selectedPlayerIds);
  const eligibleLiberoPlayerIds = new Set(getEligibleLiberoPlayerIds(team));

  if (selectedPlayerIds.length !== COURT_POSITIONS.length) {
    issues.push('setSetupLineupIncomplete');
  }

  if (selectedPlayerIds.length !== uniquePlayerIds.size) {
    issues.push('setSetupLineupDuplicatePlayers');
  }

  if (!teamState.setterPlayerId) {
    issues.push('setSetupSetterRequired');
  } else if (!uniquePlayerIds.has(teamState.setterPlayerId)) {
    issues.push('setSetupSetterMustBeInLineup');
  }

  if (!teamState.displaySide) {
    issues.push('setSetupDisplaySideRequired');
  }

  if (teamState.liberoPlayerIds.length === 0) {
    issues.push('setSetupLiberoRequired');
  }

  if (teamState.liberoPlayerIds.length > 2) {
    issues.push('setSetupTooManyLiberos');
  }

  if (new Set(teamState.liberoPlayerIds).size !== teamState.liberoPlayerIds.length) {
    issues.push('setSetupDuplicateLiberos');
  }

  if (teamState.liberoPlayerIds.some((playerId) => !eligibleLiberoPlayerIds.has(playerId))) {
    issues.push('setSetupLiberosMustBeEligible');
  }

  if (teamState.liberoPlayerIds.some((playerId) => uniquePlayerIds.has(playerId))) {
    issues.push('setSetupLiberosCannotBeOnCourt');
  }

  return issues;
}

export function validateSetStartSetup(
  state: SetStartSetupState,
  teams: { home: Team; away: Team },
): SetStartValidationResult {
  const homeIssues = validateTeamSetup(teams.home, state.home);
  const awayIssues = validateTeamSetup(teams.away, state.away);
  const generalIssues: TranslationKey[] = [];

  if (!state.servingTeam) {
    generalIssues.push('setSetupServingTeamRequired');
  }

  return {
    isValid: homeIssues.length === 0 && awayIssues.length === 0 && generalIssues.length === 0,
    homeIssues,
    awayIssues,
    generalIssues,
  };
}

export function buildStartingLineup(teamSide: TeamSide, teamState: TeamSetSetupState): StartingLineup {
  return {
    teamSide,
    setterPlayerId: teamState.setterPlayerId || undefined,
    liberoPlayerIds: teamState.liberoPlayerIds,
    slots: COURT_POSITIONS.map((courtPosition) => ({
      courtPosition,
      playerId: teamState.slots[courtPosition],
    })),
  };
}

export function createSuggestedTeamSetSetup(team: Team): TeamSetSetupState {
  const lineupPlayers = team.players.filter((player) => !player.isLibero).slice(0, COURT_POSITIONS.length);
  const liberoPlayerIds = getEligibleLiberoPlayerIds(team).slice(0, 2);
  const setterPlayer = lineupPlayers.find((player) => player.role === 'setter') ?? lineupPlayers[0];

  return {
    slots: {
      1: lineupPlayers[0]?.id ?? '',
      2: lineupPlayers[1]?.id ?? '',
      3: lineupPlayers[2]?.id ?? '',
      4: lineupPlayers[3]?.id ?? '',
      5: lineupPlayers[4]?.id ?? '',
      6: lineupPlayers[5]?.id ?? '',
    },
    setterPlayerId: setterPlayer?.id ?? '',
    liberoPlayerIds,
    displaySide: 'left',
  };
}

export function getSetterCourtPosition(teamState: TeamSetSetupState): CourtPosition | null {
  if (!teamState.setterPlayerId) {
    return null;
  }

  return COURT_POSITIONS.find((position) => teamState.slots[position] === teamState.setterPlayerId) ?? null;
}
