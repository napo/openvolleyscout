import type { CourtPosition, TeamSide } from '@src/domain/common/enums';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { Team } from '@src/domain/roster/types';
import { DEFAULT_ROLE_SEQUENCE } from '@src/config/systems';
import { PlayerRole } from '@src/domain/systems';
import type { TranslationKey } from '@src/i18n';

export const COURT_POSITIONS: CourtPosition[] = [1, 2, 3, 4, 5, 6];
export const REQUIRED_TACTICAL_ROLES: PlayerRole[] = [...DEFAULT_ROLE_SEQUENCE];
export type CourtDisplaySide = 'left' | 'right';
export type TacticalRoleSelection = PlayerRole | '';

export interface TeamSetSetupState {
  slots: Record<CourtPosition, string>;
  tacticalRoles: Record<CourtPosition, TacticalRoleSelection>;
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

export function getOppositeDisplaySide(side: CourtDisplaySide): CourtDisplaySide {
  return side === 'left' ? 'right' : 'left';
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
    tacticalRoles: createDefaultTacticalRoleAssignments(),
    setterPlayerId: '',
    liberoPlayerIds: [],
    displaySide: 'left',
  };
}

function createDefaultTacticalRoleAssignments(): Record<CourtPosition, TacticalRoleSelection> {
  return {
    1: DEFAULT_ROLE_SEQUENCE[0] ?? '',
    2: DEFAULT_ROLE_SEQUENCE[1] ?? '',
    3: DEFAULT_ROLE_SEQUENCE[2] ?? '',
    4: DEFAULT_ROLE_SEQUENCE[3] ?? '',
    5: DEFAULT_ROLE_SEQUENCE[4] ?? '',
    6: DEFAULT_ROLE_SEQUENCE[5] ?? '',
  };
}

export function createEmptySetStartSetupState(): SetStartSetupState {
  return {
    home: {
      ...createEmptyTeamSetSetupState(),
      displaySide: 'left',
    },
    away: {
      ...createEmptyTeamSetSetupState(),
      displaySide: 'right',
    },
    servingTeam: null,
  };
}

export function getSelectedLineupPlayerIds(teamState: TeamSetSetupState): string[] {
  return COURT_POSITIONS.map((position) => teamState.slots[position]).filter(Boolean);
}

export function getEligibleLiberoPlayerIds(team: Team): string[] {
  return team.players.filter((player) => player.isLibero).map((player) => player.id);
}

function getSelectedTacticalRoles(teamState: TeamSetSetupState): PlayerRole[] {
  return COURT_POSITIONS
    .map((position) => (teamState.slots[position] ? teamState.tacticalRoles[position] : ''))
    .filter((role): role is PlayerRole => Boolean(role));
}

export function getDuplicateTacticalRoles(teamState: TeamSetSetupState): Set<PlayerRole> {
  const seenRoles = new Set<PlayerRole>();
  const duplicateRoles = new Set<PlayerRole>();

  getSelectedTacticalRoles(teamState).forEach((role) => {
    if (seenRoles.has(role)) {
      duplicateRoles.add(role);
      return;
    }

    seenRoles.add(role);
  });

  return duplicateRoles;
}

export function isTacticalRoleUsedByOtherPosition(
  teamState: TeamSetSetupState,
  role: PlayerRole,
  position: CourtPosition,
): boolean {
  return COURT_POSITIONS.some((courtPosition) => (
    courtPosition !== position
    && teamState.slots[courtPosition]
    && teamState.tacticalRoles[courtPosition] === role
  ));
}

export function syncTeamSetSetupLiberos(team: Team, teamState: TeamSetSetupState): TeamSetSetupState {
  const lineupPlayerIds = new Set(getSelectedLineupPlayerIds(teamState));
  const eligibleLiberos = getEligibleLiberoPlayerIds(team).filter((playerId) => !lineupPlayerIds.has(playerId));
  const liberoPlayerIds = teamState.liberoPlayerIds
    .filter((playerId) => eligibleLiberos.includes(playerId))
    .slice(0, 2);

  return {
    ...teamState,
    liberoPlayerIds: liberoPlayerIds.length > 0 ? liberoPlayerIds : eligibleLiberos.slice(0, 2),
  };
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

  const selectedTacticalRoles = getSelectedTacticalRoles(teamState);
  const hasSelectedPlayerMissingRole = COURT_POSITIONS.some((position) => (
    Boolean(teamState.slots[position]) && !teamState.tacticalRoles[position]
  ));
  const hasMissingRequiredRole = REQUIRED_TACTICAL_ROLES.some((role) => !selectedTacticalRoles.includes(role));
  const duplicateTacticalRoles = getDuplicateTacticalRoles(teamState);

  if (hasSelectedPlayerMissingRole || hasMissingRequiredRole) {
    issues.push('missingTacticalRoles');
  }

  if (duplicateTacticalRoles.size > 0) {
    issues.push('duplicateTacticalRoles');
  }

  if (!teamState.setterPlayerId) {
    issues.push('setSetupSetterRequired');
  } else if (!uniquePlayerIds.has(teamState.setterPlayerId)) {
    issues.push('setSetupSetterMustBeInLineup');
  }

  if (!teamState.displaySide) {
    issues.push('setSetupDisplaySideRequired');
  }

  if (eligibleLiberoPlayerIds.size > 0 && teamState.liberoPlayerIds.length === 0) {
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

  if (state.home.displaySide === state.away.displaySide) {
    generalIssues.push('setSetupDisplaySidesMustDiffer');
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
    displaySide: teamState.displaySide,
    setterPlayerId: teamState.setterPlayerId || undefined,
    liberoPlayerIds: teamState.liberoPlayerIds,
    slots: COURT_POSITIONS.map((courtPosition) => ({
      courtPosition,
      playerId: teamState.slots[courtPosition],
      tacticalRole: teamState.tacticalRoles[courtPosition] || undefined,
    })),
  };
}

export function createTeamSetSetupFromStartingLineup(lineup: StartingLineup): TeamSetSetupState {
  const baseState = createEmptyTeamSetSetupState();
  const slots = { ...baseState.slots };
  const tacticalRoles = { ...baseState.tacticalRoles };

  lineup.slots.forEach((slot) => {
    slots[slot.courtPosition] = slot.playerId;
    tacticalRoles[slot.courtPosition] = slot.tacticalRole ?? '';
  });

  return {
    slots,
    tacticalRoles,
    setterPlayerId: lineup.setterPlayerId ?? '',
    liberoPlayerIds: [...lineup.liberoPlayerIds],
    displaySide: lineup.displaySide,
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
    tacticalRoles: createDefaultTacticalRoleAssignments(),
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

export function rotateTeamSetSetupClockwise(teamState: TeamSetSetupState): TeamSetSetupState {
  return {
    ...teamState,
    slots: {
      1: teamState.slots[2],
      2: teamState.slots[3],
      3: teamState.slots[4],
      4: teamState.slots[5],
      5: teamState.slots[6],
      6: teamState.slots[1],
    },
    tacticalRoles: {
      1: teamState.tacticalRoles[2],
      2: teamState.tacticalRoles[3],
      3: teamState.tacticalRoles[4],
      4: teamState.tacticalRoles[5],
      5: teamState.tacticalRoles[6],
      6: teamState.tacticalRoles[1],
    },
  };
}

export function applyDisplaySidePairing(
  state: SetStartSetupState,
  teamSide: TeamSide,
  displaySide: CourtDisplaySide,
): SetStartSetupState {
  const oppositeTeamSide: TeamSide = teamSide === 'home' ? 'away' : 'home';
  const oppositeDisplaySide = getOppositeDisplaySide(displaySide);

  return {
    ...state,
    [teamSide]: {
      ...state[teamSide],
      displaySide,
    },
    [oppositeTeamSide]: {
      ...state[oppositeTeamSide],
      displaySide: oppositeDisplaySide,
    },
  };
}
