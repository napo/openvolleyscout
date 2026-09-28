import { hasPlayerName } from '../roster/helpers';
import type { ArchivedPlayer, ArchivedTeam } from '../team/types';
import type { MatchRosterPlayer, MatchTeamSelection } from './types';

/**
 * Jersey-first roster helpers: players can join a match by jersey number only
 * and receive their names later from the team archive.
 *
 * Scouting events reference players by `archivedPlayerId ?? id` (see
 * getMatchTeamSnapshot), so these helpers never change either id of a player
 * that is already in a match roster.
 */

function buildShortName(firstName: string, lastName: string): string {
  const first = firstName.trim();
  const last = lastName.trim();
  if (first && last) return `${first.charAt(0)}. ${last}`;
  return first || last;
}

function normalizeTeamName(name: string | undefined): string {
  return (name ?? '').trim().toLowerCase();
}

/** The match player ids that scouting events use. */
export function getMatchRosterPlayerKey(player: MatchRosterPlayer): string {
  return player.archivedPlayerId ?? player.id;
}

export interface AddJerseyPlayerInput {
  jerseyNumber: number;
  isLibero: boolean;
  /** Archive player with the same jersey, reused so the name comes along. */
  archivedPlayer?: ArchivedPlayer;
  archivedTeamId?: string;
}

export type AddJerseyPlayerResult =
  | { status: 'added'; selection: MatchTeamSelection; player: MatchRosterPlayer }
  | { status: 'duplicate'; player: MatchRosterPlayer };

export function addJerseyPlayerToSelection(
  selection: MatchTeamSelection,
  input: AddJerseyPlayerInput,
): AddJerseyPlayerResult {
  const existing = selection.roster.find((player) => player.jerseyNumber === input.jerseyNumber);
  if (existing) {
    return { status: 'duplicate', player: existing };
  }

  const archived = input.archivedPlayer;
  const id = archived?.id ?? crypto.randomUUID();
  const firstName = archived?.firstName ?? '';
  const lastName = archived?.lastName ?? '';
  const isLibero = input.isLibero || Boolean(archived?.isLibero);
  const archivedTeamId = input.archivedTeamId ?? selection.archivedTeamId;

  const player: MatchRosterPlayer = {
    id,
    jerseyNumber: input.jerseyNumber,
    firstName,
    lastName,
    shortName: buildShortName(firstName, lastName),
    playerCode: archived?.playerCode ?? `#${input.jerseyNumber}`,
    role: isLibero ? 'libero' : archived?.role,
    isLibero,
    isCaptain: false,
    archivedPlayerId: id,
    archivedTeamId,
    source: archived ? 'archived_roster' : 'manual_entry',
  };

  return {
    status: 'added',
    selection: {
      ...selection,
      archivedTeamId: selection.archivedTeamId ?? archivedTeamId,
      roster: [...selection.roster, player],
    },
    player,
  };
}

/** Whether a match team selection belongs to this archived team. */
export function isSelectionForArchivedTeam(selection: MatchTeamSelection, team: Pick<ArchivedTeam, 'id' | 'name'>): boolean {
  if (selection.archivedTeamId) {
    return selection.archivedTeamId === team.id;
  }
  return normalizeTeamName(selection.teamName) !== '' && normalizeTeamName(selection.teamName) === normalizeTeamName(team.name);
}

/**
 * Copies names from the archive into a match roster.
 * - Players linked to an archive player (same id) take the archive name.
 * - Unnamed players without a link take the name of the archive player with the same jersey.
 * Ids are left untouched so recorded events stay attached to the same player.
 */
export function applyArchivedNamesToSelection(
  selection: MatchTeamSelection,
  archivedPlayers: ArchivedPlayer[],
): { selection: MatchTeamSelection; changed: boolean } {
  let changed = false;

  const roster = selection.roster.map((player) => {
    const linked = archivedPlayers.find((candidate) => candidate.id === getMatchRosterPlayerKey(player));
    const source = linked ?? (hasPlayerName(player)
      ? undefined
      : archivedPlayers.find((candidate) => candidate.jerseyNumber === player.jerseyNumber));

    if (!source || !hasPlayerName(source)) {
      return player;
    }

    const shortName = buildShortName(source.firstName, source.lastName);
    if (
      player.firstName === source.firstName
      && player.lastName === source.lastName
      && player.shortName === shortName
      && player.playerCode === source.playerCode
    ) {
      return player;
    }

    changed = true;
    return {
      ...player,
      firstName: source.firstName,
      lastName: source.lastName,
      shortName,
      playerCode: source.playerCode,
      displayName: undefined,
    };
  });

  return changed ? { selection: { ...selection, roster }, changed } : { selection, changed };
}
