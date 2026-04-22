import type { ArchivedPlayer } from '../team/types';
import type { Player, Team, TeamStaff } from '../roster/types';
import type {
  MatchProject,
  MatchRosterPlayer,
  MatchRosterSelectionPlayer,
  MatchTeamSide,
  MatchTeamSelectionKey,
  MatchTeamSelection,
  MatchTeamSelectionSource,
} from './types';

function inferSelectionSource(archivedTeamId?: string): MatchTeamSelectionSource {
  return archivedTeamId ? 'archived_team' : 'manual_entry';
}

function toMatchRosterPlayer(player: Player, archivedTeamId?: string): MatchRosterPlayer {
  return {
    ...player,
    archivedPlayerId: player.id,
    archivedTeamId,
    source: archivedTeamId ? 'archived_roster' : 'manual_entry',
  };
}

export function createMatchRosterSelectionPlayer(
  player: Player,
  options?: {
    archivedPlayerId?: string;
    archivedTeamId?: string;
    isSelectedForMatch?: boolean;
    isFromArchive?: boolean;
  },
): MatchRosterSelectionPlayer {
  const rosterPlayer = toMatchRosterPlayer(
    {
      ...player,
      shortName: player.shortName ?? `${player.firstName.charAt(0)}. ${player.lastName}`,
    },
    options?.archivedTeamId,
  );

  return {
    ...rosterPlayer,
    archivedPlayerId: options?.archivedPlayerId ?? rosterPlayer.archivedPlayerId,
    archivedTeamId: options?.archivedTeamId ?? rosterPlayer.archivedTeamId,
    isSelectedForMatch: options?.isSelectedForMatch ?? false,
    isFromArchive: options?.isFromArchive ?? false,
  };
}

export function createMatchRosterSelectionPlayerFromArchived(
  archivedPlayer: ArchivedPlayer,
  archivedTeamId: string,
): MatchRosterSelectionPlayer {
  return createMatchRosterSelectionPlayer(
    {
      ...archivedPlayer,
      shortName: `${archivedPlayer.firstName.charAt(0)}. ${archivedPlayer.lastName}`,
    },
    {
      archivedPlayerId: archivedPlayer.id,
      archivedTeamId,
      isSelectedForMatch: false,
      isFromArchive: true,
    },
  );
}

export function createMatchRosterSelectionFromArchived(
  archivedPlayers: ArchivedPlayer[],
  archivedTeamId: string,
): MatchRosterSelectionPlayer[] {
  return archivedPlayers.map((player) => createMatchRosterSelectionPlayerFromArchived(player, archivedTeamId));
}

export function createMatchTeamSelectionFromTeam(
  team: Team,
  archivedTeamId?: string,
): MatchTeamSelection {
  return {
    teamId: team.id,
    archivedTeamId,
    teamName: team.name,
    teamCode: team.code,
    source: inferSelectionSource(archivedTeamId),
    staff: team.staff,
    roster: team.players.map((player) => toMatchRosterPlayer(player, archivedTeamId)),
  };
}

export function createMatchTeamSelection(
  team: {
    teamId: string;
    teamName: string;
    teamCode?: string;
    staff: TeamStaff;
    archivedTeamId?: string;
    roster: MatchRosterPlayer[];
  },
): MatchTeamSelection {
  return {
    teamId: team.teamId,
    archivedTeamId: team.archivedTeamId,
    teamName: team.teamName,
    teamCode: team.teamCode,
    source: inferSelectionSource(team.archivedTeamId),
    staff: normalizeTeamStaff(team.staff),
    roster: team.roster.map((player) => ({
      ...player,
      archivedTeamId: player.archivedTeamId ?? team.archivedTeamId,
      source: player.source ?? (team.archivedTeamId ? 'archived_roster' : 'manual_entry'),
    })),
  };
}

function createFallbackTeam(selectionKey: MatchTeamSide): Team {
  const defaultName = selectionKey === 'home' ? 'Home Team' : 'Away Team';

  return {
    id: crypto.randomUUID(),
    code: 'TBD',
    name: defaultName,
    players: [],
    staff: {
      headCoach: '',
      assistantCoach: '',
    },
  };
}

function toTeamPlayer(player: MatchRosterPlayer): Player {
  return {
    id: player.archivedPlayerId ?? player.id,
    jerseyNumber: player.jerseyNumber,
    firstName: player.firstName,
    lastName: player.lastName,
    shortName: player.shortName,
    playerCode: player.playerCode,
    role: player.role,
    isCaptain: player.isCaptain,
    isLibero: player.isLibero,
  };
}

function createTeamFromSelection(selection: MatchTeamSelection, fallbackName: string): Team {
  return {
    id: selection.teamId,
    code: selection.teamCode ?? 'TBD',
    name: selection.teamName || fallbackName,
    players: selection.roster.map(toTeamPlayer),
    staff: selection.staff,
  };
}

export function getMatchTeamSnapshot(
  project: Pick<MatchProject, 'homeSelection' | 'awaySelection'> &
    Partial<Pick<MatchProject, 'homeTeam' | 'awayTeam'>>,
  teamSide: MatchTeamSide,
): Team {
  const selection = getMatchTeamSelection(project, teamSide);
  const fallbackTeam =
    teamSide === 'home' ? project.homeTeam ?? createFallbackTeam('home') : project.awayTeam ?? createFallbackTeam('away');

  return createTeamFromSelection(selection, fallbackTeam.name);
}

export function getMatchRoster(
  project: Pick<MatchProject, 'homeSelection' | 'awaySelection'>,
  teamSide: MatchTeamSide,
): MatchRosterPlayer[] {
  return getMatchTeamSelection(project, teamSide).roster;
}

export function getMatchTeamSelectionKey(teamSide: MatchTeamSide): MatchTeamSelectionKey {
  return teamSide === 'home' ? 'homeSelection' : 'awaySelection';
}

export function getMatchTeamSelection(
  project: Pick<MatchProject, 'homeSelection' | 'awaySelection'>,
  teamSide: MatchTeamSide,
): MatchTeamSelection {
  return project[getMatchTeamSelectionKey(teamSide)];
}

export function setMatchTeamSelection(
  project: Pick<MatchProject, 'homeSelection' | 'awaySelection'>,
  teamSide: MatchTeamSide,
  selection: MatchTeamSelection,
): void {
  // Match-specific writes must go through the canonical selections.
  project[getMatchTeamSelectionKey(teamSide)] = selection;
}

function normalizeTeamStaff(staff?: TeamStaff): TeamStaff {
  return {
    headCoach: staff?.headCoach ?? '',
    assistantCoach: staff?.assistantCoach ?? '',
  };
}

function normalizeSelection(
  selection: MatchTeamSelection | undefined,
  fallbackTeam: Team,
): MatchTeamSelection {
  if (!selection) {
    return createMatchTeamSelectionFromTeam(fallbackTeam);
  }

  return {
    teamId: selection.teamId || fallbackTeam.id,
    archivedTeamId: selection.archivedTeamId,
    teamName: selection.teamName || fallbackTeam.name,
    teamCode: selection.teamCode ?? fallbackTeam.code,
    source: selection.source ?? inferSelectionSource(selection.archivedTeamId),
    staff: normalizeTeamStaff(selection.staff ?? fallbackTeam.staff),
    roster: selection.roster.map((player) => ({
      ...player,
      archivedPlayerId: player.archivedPlayerId,
      archivedTeamId: player.archivedTeamId ?? selection.archivedTeamId,
      source: player.source ?? (selection.archivedTeamId ? 'archived_roster' : 'manual_entry'),
    })),
  };
}

export function normalizeMatchProject(project: MatchProject): MatchProject {
  // Legacy projects may still carry team snapshots only, so we keep them as fallback input,
  // but the normalized result always derives snapshots from the canonical selections.
  const homeTeam = project.homeTeam ?? createFallbackTeam('home');
  const awayTeam = project.awayTeam ?? createFallbackTeam('away');

  const homeSelection = normalizeSelection(project.homeSelection, homeTeam);
  const awaySelection = normalizeSelection(project.awaySelection, awayTeam);
  const updatedAt = project.updatedAt ?? Date.now();

  return {
    ...project,
    metadata: {
      ...project.metadata,
      schemaVersion: Math.max(project.metadata.schemaVersion ?? 1, 3),
    },
    homeTeam: createTeamFromSelection(homeSelection, homeTeam.name),
    awayTeam: createTeamFromSelection(awaySelection, awayTeam.name),
    homeSelection,
    awaySelection,
    scoutingConfig: normalizeScoutingMatchConfig(project.scoutingConfig, project.metadata.format),
    scoutingSession: project.scoutingSession ?? {
      activeProjectId: project.metadata.id,
      currentSetNumber: 1,
      currentRallyNumber: 1,
      homeScore: 0,
      awayScore: 0,
      servingTeam: null,
      homeActiveLineup: null,
      awayActiveLineup: null,
      isSetStarted: false,
      isRallyActive: false,
      currentRallyTouches: [],
      currentRallyPointWinner: null,
      completedSets: [],
      updatedAt,
    },
    linkedSystemIds: project.linkedSystemIds ?? [],
    linkedAttackCombinationIds: project.linkedAttackCombinationIds ?? [],
    linkedSetterCallIds: project.linkedSetterCallIds ?? [],
    updatedAt,
  };
}
import { normalizeScoutingMatchConfig } from '../scouting';
