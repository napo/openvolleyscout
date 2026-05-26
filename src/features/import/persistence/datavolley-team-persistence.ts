import type { TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import { buildSetLineupSnapshotsFromEvents } from '@src/domain/lineup';
import { normalizeMatchProject } from '@src/domain/match';
import type { MatchProject, MatchRosterPlayer, MatchTeamSelection } from '@src/domain/match/types';
import type { TeamStaff } from '@src/domain/roster/types';
import { getCompletedSetsFromEvents } from '@src/domain/scouting';
import type { ScoutingSession } from '@src/domain/scouting/types';
import type { ArchivedPlayer, ArchivedTeam } from '@src/domain/team/types';
import { generatePlayerCode } from '@src/domain/team/factories';
import type { BallTouch } from '@src/domain/touch/types';
import { replayLiveMatchFromEvents } from '@src/features/scouting/model/replay';
import type { ParsedImportWarning } from '../diagnostics';
import type {
  DataVolleyPersistedTeam,
  DataVolleyTeamPersistenceAnalysis,
  DataVolleyTeamPersistencePreview,
  DataVolleyTeamPersistenceRepository,
  DataVolleyTeamPersistenceResult,
  DataVolleyTeamRosterChangeSummary,
} from './types';

type ImportedPlayerCandidate = {
  matchPlayer: MatchRosterPlayer;
  archivedPlayer: Omit<ArchivedPlayer, 'id'>;
  normalizedName: string;
};

type RosterMergeResult = {
  players: ArchivedPlayer[];
  playerIdMap: Record<string, string>;
  summary: DataVolleyTeamRosterChangeSummary;
  warnings: ParsedImportWarning[];
};

const TEAM_SIDES: TeamSide[] = ['home', 'away'];

function createId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cleanText(value: string | undefined): string {
  return (value ?? '').trim();
}

export function normalizeDataVolleyTeamName(name: string): string {
  const normalized = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  return normalized || cleanText(name).toLowerCase();
}

function normalizePlayerName(firstName: string | undefined, lastName: string | undefined): string {
  return [firstName, lastName]
    .map(cleanText)
    .filter(Boolean)
    .join(' ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function isPlaceholderName(value: string | undefined, jerseyNumber?: number): boolean {
  const cleaned = cleanText(value);
  return !cleaned || cleaned === `#${jerseyNumber ?? ''}` || /^#\d+$/.test(cleaned);
}

function getSelection(project: MatchProject, side: TeamSide): MatchTeamSelection {
  return side === 'home' ? project.homeSelection : project.awaySelection;
}

function findTeamCandidates(teams: readonly ArchivedTeam[], teamName: string): ArchivedTeam[] {
  const normalizedName = normalizeDataVolleyTeamName(teamName);
  return teams.filter((team) => normalizeDataVolleyTeamName(team.name) === normalizedName);
}

function chooseTeamCandidate(candidates: readonly ArchivedTeam[], importedName: string): ArchivedTeam | undefined {
  const exactName = cleanText(importedName).toLowerCase();
  return candidates.find((team) => cleanText(team.name).toLowerCase() === exactName)
    ?? [...candidates].sort((left, right) => right.updatedAt - left.updatedAt)[0];
}

function createImportedPlayerCandidate(matchPlayer: MatchRosterPlayer): ImportedPlayerCandidate {
  const firstName = cleanText(matchPlayer.firstName);
  const lastName = cleanText(matchPlayer.lastName) || `#${matchPlayer.jerseyNumber}`;
  const playerCode = cleanText(matchPlayer.playerCode) || generatePlayerCode(firstName, lastName);

  return {
    matchPlayer,
    archivedPlayer: {
      jerseyNumber: matchPlayer.jerseyNumber,
      firstName,
      lastName,
      playerCode,
      isLibero: matchPlayer.isLibero,
      isCaptain: matchPlayer.isCaptain,
    },
    normalizedName: normalizePlayerName(firstName, lastName),
  };
}

function cloneArchivedPlayer(player: ArchivedPlayer): ArchivedPlayer {
  return {
    ...player,
  };
}

function sameArchivedPlayer(left: ArchivedPlayer, right: ArchivedPlayer): boolean {
  return left.jerseyNumber === right.jerseyNumber
    && left.firstName === right.firstName
    && left.lastName === right.lastName
    && left.playerCode === right.playerCode
    && Boolean(left.isLibero) === Boolean(right.isLibero)
    && Boolean(left.isCaptain) === Boolean(right.isCaptain);
}

function findRosterMatch(
  roster: readonly ArchivedPlayer[],
  candidate: ImportedPlayerCandidate,
): { player?: ArchivedPlayer; matchKind?: 'jersey' | 'name'; warning?: ParsedImportWarning } {
  const jerseyMatches = roster.filter((player) => player.jerseyNumber === candidate.archivedPlayer.jerseyNumber);
  if (jerseyMatches.length === 1) {
    return {
      player: jerseyMatches[0],
      matchKind: 'jersey',
    };
  }

  const candidateHasName = candidate.normalizedName && !isPlaceholderName(candidate.archivedPlayer.lastName, candidate.archivedPlayer.jerseyNumber);
  if (candidateHasName) {
    const nameMatches = roster.filter((player) =>
      normalizePlayerName(player.firstName, player.lastName) === candidate.normalizedName,
    );
    if (nameMatches.length === 1) {
      return {
        player: nameMatches[0],
        matchKind: 'name',
      };
    }
  }

  if (jerseyMatches.length > 1) {
    return {
      player: jerseyMatches.find((player) =>
        normalizePlayerName(player.firstName, player.lastName) === candidate.normalizedName,
      ) ?? jerseyMatches[0],
      matchKind: 'jersey',
      warning: {
        severity: 'warning',
        message: `Persistent roster already has multiple players with jersey #${candidate.archivedPlayer.jerseyNumber}; the DataVolley player was merged into the first matching entry.`,
      },
    };
  }

  return {};
}

function mergeArchivedPlayer(
  existing: ArchivedPlayer,
  incoming: Omit<ArchivedPlayer, 'id'>,
  matchKind: 'jersey' | 'name' | undefined,
): { player: ArchivedPlayer; warnings: ParsedImportWarning[] } {
  const next = cloneArchivedPlayer(existing);
  const warnings: ParsedImportWarning[] = [];

  if (isPlaceholderName(next.firstName) && cleanText(incoming.firstName)) {
    next.firstName = incoming.firstName;
  }

  if (isPlaceholderName(next.lastName, next.jerseyNumber) && !isPlaceholderName(incoming.lastName, incoming.jerseyNumber)) {
    next.lastName = incoming.lastName;
  }

  if (!cleanText(next.playerCode) || next.playerCode === '---') {
    next.playerCode = incoming.playerCode || generatePlayerCode(next.firstName, next.lastName);
  }

  if (incoming.isLibero && !next.isLibero) {
    next.isLibero = true;
  }

  if (incoming.isCaptain && !next.isCaptain) {
    next.isCaptain = true;
  }

  if (matchKind === 'name' && next.jerseyNumber !== incoming.jerseyNumber) {
    warnings.push({
      severity: 'warning',
      message: `Player ${incoming.firstName} ${incoming.lastName} matched by name but has imported jersey #${incoming.jerseyNumber}; preserved archived jersey #${next.jerseyNumber}.`,
    });
  }

  if (
    matchKind === 'jersey'
    && !isPlaceholderName(incoming.lastName, incoming.jerseyNumber)
    && !isPlaceholderName(next.lastName, next.jerseyNumber)
    && normalizePlayerName(next.firstName, next.lastName) !== normalizePlayerName(incoming.firstName, incoming.lastName)
  ) {
    warnings.push({
      severity: 'warning',
      message: `Jersey #${incoming.jerseyNumber} already belongs to ${next.firstName} ${next.lastName}; preserved archived name while linking the imported player.`,
    });
  }

  return {
    player: next,
    warnings,
  };
}

function sortRoster(players: ArchivedPlayer[]): ArchivedPlayer[] {
  return [...players].sort((left, right) =>
    left.jerseyNumber - right.jerseyNumber
    || normalizePlayerName(left.firstName, left.lastName).localeCompare(normalizePlayerName(right.firstName, right.lastName)),
  );
}

function mergeImportedRoster(
  existingPlayers: readonly ArchivedPlayer[],
  importedPlayers: readonly MatchRosterPlayer[],
): RosterMergeResult {
  const players = existingPlayers.map(cloneArchivedPlayer);
  const playerIdMap: Record<string, string> = {};
  const summary: DataVolleyTeamRosterChangeSummary = {
    importedPlayers: importedPlayers.length,
    playersAdded: 0,
    playersUpdated: 0,
    playersUnchanged: 0,
  };
  const warnings: ParsedImportWarning[] = [];

  importedPlayers.map(createImportedPlayerCandidate).forEach((candidate) => {
    const match = findRosterMatch(players, candidate);
    if (match.warning) {
      warnings.push(match.warning);
    }

    if (match.player) {
      const merged = mergeArchivedPlayer(match.player, candidate.archivedPlayer, match.matchKind);
      warnings.push(...merged.warnings);
      const playerIndex = players.findIndex((player) => player.id === match.player?.id);
      if (playerIndex >= 0) {
        players[playerIndex] = merged.player;
      }
      playerIdMap[candidate.matchPlayer.id] = merged.player.id;
      if (sameArchivedPlayer(match.player, merged.player)) {
        summary.playersUnchanged += 1;
      } else {
        summary.playersUpdated += 1;
      }
      return;
    }

    const createdPlayer: ArchivedPlayer = {
      id: createId('datavolley-player'),
      ...candidate.archivedPlayer,
    };
    players.push(createdPlayer);
    playerIdMap[candidate.matchPlayer.id] = createdPlayer.id;
    summary.playersAdded += 1;
  });

  return {
    players: sortRoster(players),
    playerIdMap,
    summary,
    warnings,
  };
}

function collectImportedRosterDiagnostics(selection: MatchTeamSelection): ParsedImportWarning[] {
  const warnings: ParsedImportWarning[] = [];
  const teamName = selection.teamName || selection.teamId;
  const jerseyGroups = new Map<number, MatchRosterPlayer[]>();

  selection.roster.forEach((player) => {
    const current = jerseyGroups.get(player.jerseyNumber) ?? [];
    current.push(player);
    jerseyGroups.set(player.jerseyNumber, current);

    if (isPlaceholderName(player.firstName) && isPlaceholderName(player.lastName, player.jerseyNumber)) {
      warnings.push({
        severity: 'warning',
        message: `${teamName} player #${player.jerseyNumber} is missing a player name.`,
      });
    }

    if (player.isCaptain && player.isLibero) {
      warnings.push({
        severity: 'warning',
        message: `${teamName} player #${player.jerseyNumber} is marked as both captain and libero.`,
      });
    }
  });

  jerseyGroups.forEach((players, jerseyNumber) => {
    if (players.length <= 1) return;

    warnings.push({
      severity: 'warning',
      message: `${teamName} has duplicate DataVolley jersey #${jerseyNumber}; matching rows will be merged into one archived player when possible.`,
    });

    const markerStates = new Set(players.map((player) => `${Boolean(player.isCaptain)}:${Boolean(player.isLibero)}`));
    if (markerStates.size > 1) {
      warnings.push({
        severity: 'warning',
        message: `${teamName} duplicate jersey #${jerseyNumber} has conflicting captain/libero markers.`,
      });
    }
  });

  const captains = selection.roster.filter((player) => player.isCaptain);
  if (captains.length > 1) {
    warnings.push({
      severity: 'warning',
      message: `${teamName} has ${captains.length} players marked as captain in the DataVolley import.`,
    });
  }

  const liberos = selection.roster.filter((player) => player.isLibero);
  if (liberos.length > 2) {
    warnings.push({
      severity: 'warning',
      message: `${teamName} has ${liberos.length} players marked as libero in the DataVolley import.`,
    });
  }

  return warnings;
}

function mergeStaff(existing: TeamStaff, imported: TeamStaff): TeamStaff {
  return {
    headCoach: cleanText(existing.headCoach) || cleanText(imported.headCoach),
    assistantCoach: cleanText(existing.assistantCoach) || cleanText(imported.assistantCoach),
  };
}

async function buildTeamPreview(
  project: MatchProject,
  repository: DataVolleyTeamPersistenceRepository,
  existingTeams: readonly ArchivedTeam[],
  side: TeamSide,
): Promise<{ preview: DataVolleyTeamPersistencePreview; warnings: ParsedImportWarning[] }> {
  const selection = getSelection(project, side);
  const teamName = cleanText(selection.teamName) || (side === 'home' ? 'Home Team' : 'Away Team');
  const candidates = findTeamCandidates(existingTeams, teamName);
  const chosenTeam = chooseTeamCandidate(candidates, teamName);
  const record = chosenTeam ? await repository.getById(chosenTeam.id) : null;
  const merge = mergeImportedRoster(record?.roster.players ?? [], selection.roster);
  const warnings: ParsedImportWarning[] = [
    ...collectImportedRosterDiagnostics(selection),
    ...merge.warnings,
  ];

  if (candidates.length > 1) {
    warnings.push({
      severity: 'warning',
      message: `Team name collision: ${teamName} matches ${candidates.length} archived teams. The exact-name match is preferred; otherwise the most recently updated matching team will be used.`,
    });
  }

  return {
    preview: {
      side,
      teamName,
      normalizedTeamName: normalizeDataVolleyTeamName(teamName),
      action: record ? 'update' : 'create',
      existingTeamId: record?.team.id,
      existingTeamName: record?.team.name,
      collisionTeamIds: candidates.length > 1 ? candidates.map((team) => team.id) : [],
      rosterChanges: merge.summary,
    },
    warnings,
  };
}

export async function previewDataVolleyTeamPersistence(
  project: MatchProject,
  repository: DataVolleyTeamPersistenceRepository,
): Promise<DataVolleyTeamPersistenceAnalysis> {
  const existingTeams = await repository.list();
  const warnings: ParsedImportWarning[] = [];
  const normalizedHomeName = normalizeDataVolleyTeamName(project.homeSelection.teamName);
  const normalizedAwayName = normalizeDataVolleyTeamName(project.awaySelection.teamName);

  if (normalizedHomeName && normalizedHomeName === normalizedAwayName) {
    warnings.push({
      severity: 'warning',
      message: `Imported home and away teams both normalize to "${normalizedHomeName}"; they will share one archived team unless the names are corrected before import.`,
    });
  }

  const previews = await Promise.all(
    TEAM_SIDES.map((side) => buildTeamPreview(project, repository, existingTeams, side)),
  );

  previews.forEach((result) => warnings.push(...result.warnings));

  return {
    teamPreviews: previews.map((result) => result.preview),
    warnings,
  };
}

async function persistOneImportedTeam(
  project: MatchProject,
  repository: DataVolleyTeamPersistenceRepository,
  side: TeamSide,
): Promise<{ persistedTeam: DataVolleyPersistedTeam; warnings: ParsedImportWarning[] }> {
  const existingTeams = await repository.list();
  const selection = getSelection(project, side);
  const teamName = cleanText(selection.teamName) || (side === 'home' ? 'Home Team' : 'Away Team');
  const candidates = findTeamCandidates(existingTeams, teamName);
  const chosenTeam = chooseTeamCandidate(candidates, teamName);
  const record = chosenTeam ? await repository.getById(chosenTeam.id) : null;
  const warnings: ParsedImportWarning[] = collectImportedRosterDiagnostics(selection);

  if (candidates.length > 1) {
    warnings.push({
      severity: 'warning',
      message: `Team name collision: ${teamName} matches ${candidates.length} archived teams. Updated ${record?.team.name ?? chosenTeam?.name ?? teamName}.`,
    });
  }

  if (record) {
    const merge = mergeImportedRoster(record.roster.players, selection.roster);
    const updatedRecord = await repository.update(record.team.id, {
      staff: mergeStaff(record.team.staff, selection.staff),
      players: merge.players,
    });

    return {
      persistedTeam: {
        side,
        teamName,
        normalizedTeamName: normalizeDataVolleyTeamName(teamName),
        action: 'update',
        existingTeamId: updatedRecord.team.id,
        existingTeamName: updatedRecord.team.name,
        collisionTeamIds: candidates.length > 1 ? candidates.map((team) => team.id) : [],
        rosterChanges: merge.summary,
        team: updatedRecord.team,
        roster: updatedRecord.roster,
        playerIdMap: merge.playerIdMap,
      },
      warnings: [...warnings, ...merge.warnings],
    };
  }

  const merge = mergeImportedRoster([], selection.roster);
  const createdRecord = await repository.create({
    name: teamName,
    staff: selection.staff,
    players: merge.players,
  });

  return {
    persistedTeam: {
      side,
      teamName,
      normalizedTeamName: normalizeDataVolleyTeamName(teamName),
      action: 'create',
      existingTeamId: createdRecord.team.id,
      existingTeamName: createdRecord.team.name,
      collisionTeamIds: [],
      rosterChanges: merge.summary,
      team: createdRecord.team,
      roster: createdRecord.roster,
      playerIdMap: merge.playerIdMap,
    },
    warnings: [...warnings, ...merge.warnings],
  };
}

function rewriteOptionalPlayerId(playerId: string | undefined, playerIdMap: Record<string, string>): string | undefined {
  return playerId ? playerIdMap[playerId] ?? playerId : undefined;
}

function rewriteRequiredPlayerId(playerId: string, playerIdMap: Record<string, string>): string {
  return playerIdMap[playerId] ?? playerId;
}

function rewriteStartingLineup(lineup: StartingLineup, playerIdMap: Record<string, string>): StartingLineup {
  return {
    ...lineup,
    setterPlayerId: rewriteOptionalPlayerId(lineup.setterPlayerId, playerIdMap),
    liberoPlayerIds: lineup.liberoPlayerIds.map((playerId) => rewriteRequiredPlayerId(playerId, playerIdMap)),
    benchPlayerIds: lineup.benchPlayerIds?.map((playerId) => rewriteRequiredPlayerId(playerId, playerIdMap)),
    slots: lineup.slots.map((slot) => ({
      ...slot,
      playerId: rewriteRequiredPlayerId(slot.playerId, playerIdMap),
    })),
  };
}

function rewriteTouchPlayerId(touch: BallTouch, playerIdMap: Record<string, string>): BallTouch {
  return {
    ...touch,
    playerId: rewriteOptionalPlayerId(touch.playerId, playerIdMap),
  };
}

function rewriteEventPlayerIds(
  event: MatchEvent,
  playerIdMaps: Record<TeamSide, Record<string, string>>,
): MatchEvent {
  switch (event.type) {
    case 'set_started':
      return {
        ...event,
        homeLineup: rewriteStartingLineup(event.homeLineup, playerIdMaps.home),
        awayLineup: rewriteStartingLineup(event.awayLineup, playerIdMaps.away),
      };
    case 'touch_recorded':
      return {
        ...event,
        touch: rewriteTouchPlayerId(event.touch, playerIdMaps[event.touch.teamSide]),
      };
    case 'substitution_made':
      return {
        ...event,
        playerOutId: rewriteRequiredPlayerId(event.playerOutId, playerIdMaps[event.teamSide]),
        playerInId: rewriteRequiredPlayerId(event.playerInId, playerIdMaps[event.teamSide]),
        canReenterOnlyForPlayerId: rewriteOptionalPlayerId(event.canReenterOnlyForPlayerId, playerIdMaps[event.teamSide]),
      };
    case 'libero_replacement_made':
      return {
        ...event,
        liberoPlayerId: rewriteRequiredPlayerId(event.liberoPlayerId, playerIdMaps[event.teamSide]),
        replacedPlayerId: rewriteRequiredPlayerId(event.replacedPlayerId, playerIdMaps[event.teamSide]),
        playerOutId: rewriteRequiredPlayerId(event.playerOutId, playerIdMaps[event.teamSide]),
        playerInId: rewriteRequiredPlayerId(event.playerInId, playerIdMaps[event.teamSide]),
      };
    default:
      return event;
  }
}

function createLinkedScoutingSession(project: MatchProject, events: MatchEvent[]): ScoutingSession | undefined {
  const replayed = replayLiveMatchFromEvents(project.metadata.id, events);
  if (!replayed) return project.scoutingSession;

  const { eventLog: _eventLog, ...session } = replayed;
  return {
    ...project.scoutingSession,
    ...session,
    completedSets: getCompletedSetsFromEvents(events),
    lineupSnapshots: buildSetLineupSnapshotsFromEvents(events),
    matchStatus: replayed.isSetStarted ? 'in_progress' : 'completed',
    matchWinner: null,
    goldenSetScore: null,
  };
}

function linkSelectionToPersistedTeam(
  selection: MatchTeamSelection,
  persistedTeam: DataVolleyPersistedTeam,
): MatchTeamSelection {
  return {
    ...selection,
    archivedTeamId: persistedTeam.team.id,
    teamName: persistedTeam.team.name,
    teamCode: persistedTeam.team.teamCode,
    source: 'archived_team',
    staff: persistedTeam.team.staff,
    roster: selection.roster.map((player) => {
      const archivedPlayerId = persistedTeam.playerIdMap[player.id];
      return {
        ...player,
        id: archivedPlayerId ?? player.id,
        archivedPlayerId,
        archivedTeamId: persistedTeam.team.id,
        source: archivedPlayerId ? 'archived_roster' : player.source,
      };
    }),
  };
}

export function linkDataVolleyProjectToPersistedTeams(
  project: MatchProject,
  persistedTeams: readonly DataVolleyPersistedTeam[],
): MatchProject {
  const homeTeam = persistedTeams.find((team) => team.side === 'home');
  const awayTeam = persistedTeams.find((team) => team.side === 'away');
  if (!homeTeam || !awayTeam) {
    return normalizeMatchProject(project);
  }

  const playerIdMaps: Record<TeamSide, Record<string, string>> = {
    home: homeTeam.playerIdMap,
    away: awayTeam.playerIdMap,
  };
  const events = project.events.map((event) => rewriteEventPlayerIds(event, playerIdMaps));
  const linkedProject: MatchProject = {
    ...project,
    homeSelection: linkSelectionToPersistedTeam(project.homeSelection, homeTeam),
    awaySelection: linkSelectionToPersistedTeam(project.awaySelection, awayTeam),
    events,
    scoutingSession: createLinkedScoutingSession(project, events),
    updatedAt: Date.now(),
  };

  return normalizeMatchProject(linkedProject);
}

export async function persistDataVolleyImportedTeams(
  project: MatchProject,
  repository: DataVolleyTeamPersistenceRepository,
): Promise<DataVolleyTeamPersistenceResult> {
  const warnings: ParsedImportWarning[] = [];
  const persistedTeams: DataVolleyPersistedTeam[] = [];

  for (const side of TEAM_SIDES) {
    const result = await persistOneImportedTeam(project, repository, side);
    persistedTeams.push(result.persistedTeam);
    warnings.push(...result.warnings);
  }

  const linkedProject = linkDataVolleyProjectToPersistedTeams(project, persistedTeams);

  return {
    project: linkedProject,
    persistedTeams,
    teamPreviews: persistedTeams.map((team) => ({
      side: team.side,
      teamName: team.teamName,
      normalizedTeamName: team.normalizedTeamName,
      action: team.action,
      existingTeamId: team.existingTeamId,
      existingTeamName: team.existingTeamName,
      collisionTeamIds: team.collisionTeamIds,
      rosterChanges: team.rosterChanges,
    })),
    warnings,
  };
}
