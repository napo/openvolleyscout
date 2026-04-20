import type { Player, Team, TeamStaff } from '../roster/types';
import type { MatchProject, MatchRosterPlayer, MatchTeamSelection, MatchTeamSelectionSource } from './types';

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

function createFallbackTeam(selectionKey: 'home' | 'away'): Team {
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
  const homeTeam = project.homeTeam ?? createFallbackTeam('home');
  const awayTeam = project.awayTeam ?? createFallbackTeam('away');

  const homeSelection = normalizeSelection(project.homeSelection, homeTeam);
  const awaySelection = normalizeSelection(project.awaySelection, awayTeam);
  const updatedAt = project.updatedAt ?? Date.now();

  return {
    ...project,
    metadata: {
      ...project.metadata,
      schemaVersion: Math.max(project.metadata.schemaVersion ?? 1, 2),
    },
    homeTeam: createTeamFromSelection(homeSelection, homeTeam.name),
    awayTeam: createTeamFromSelection(awaySelection, awayTeam.name),
    homeSelection,
    awaySelection,
    scoutingSession: project.scoutingSession ?? {
      currentSet: null,
      currentRally: null,
      updatedAt,
    },
    linkedSystemIds: project.linkedSystemIds ?? [],
    linkedAttackCombinationIds: project.linkedAttackCombinationIds ?? [],
    linkedSetterCallIds: project.linkedSetterCallIds ?? [],
    updatedAt,
  };
}
