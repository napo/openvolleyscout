import type { CourtPosition, TeamSide } from '@src/domain/common/enums';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { Team } from '@src/domain/roster/types';
import type { TranslationKey } from '@src/i18n';

export const COURT_POSITIONS: CourtPosition[] = [1, 2, 3, 4, 5, 6];

export interface TeamSetSetupState {
  slots: Record<CourtPosition, string>;
  setterPlayerId: string;
  liberoPlayerIds: string[];
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
  };
}

export function createEmptySetStartSetupState(): SetStartSetupState {
  return {
    home: createEmptyTeamSetSetupState(),
    away: createEmptyTeamSetSetupState(),
    servingTeam: null,
  };
}

function getSelectedPlayerIds(teamState: TeamSetSetupState): string[] {
  return COURT_POSITIONS.map((position) => teamState.slots[position]).filter(Boolean);
}

function validateTeamSetup(teamState: TeamSetSetupState): TranslationKey[] {
  const issues: TranslationKey[] = [];
  const selectedPlayerIds = getSelectedPlayerIds(teamState);
  const uniquePlayerIds = new Set(selectedPlayerIds);

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

  if (teamState.liberoPlayerIds.length > 2) {
    issues.push('setSetupTooManyLiberos');
  }

  if (new Set(teamState.liberoPlayerIds).size !== teamState.liberoPlayerIds.length) {
    issues.push('setSetupDuplicateLiberos');
  }

  if (teamState.liberoPlayerIds.some((playerId) => !uniquePlayerIds.has(playerId))) {
    issues.push('setSetupLiberosMustBeInLineup');
  }

  return issues;
}

export function validateSetStartSetup(state: SetStartSetupState): SetStartValidationResult {
  const homeIssues = validateTeamSetup(state.home);
  const awayIssues = validateTeamSetup(state.away);
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
  const lineupPlayers = team.players.slice(0, COURT_POSITIONS.length);
  const liberoPlayerIds = lineupPlayers.filter((player) => player.isLibero).slice(0, 2).map((player) => player.id);
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
  };
}
