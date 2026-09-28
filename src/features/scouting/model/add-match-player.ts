import {
  addJerseyPlayerToSelection,
  getMatchTeamSelection,
  setMatchTeamSelection,
  type MatchProject,
  type MatchRosterPlayer,
  type MatchTeamSide,
} from '@src/domain/match';
import { teamRepository, type ArchivedTeamAggregate } from '@src/infrastructure/repositories';

export type AddMatchPlayerResult =
  | { status: 'added'; project: MatchProject; player: MatchRosterPlayer }
  | { status: 'duplicate'; player: MatchRosterPlayer };

async function findArchivedTeam(project: MatchProject, teamSide: MatchTeamSide): Promise<ArchivedTeamAggregate | null> {
  const selection = getMatchTeamSelection(project, teamSide);
  if (selection.archivedTeamId) {
    const byId = await teamRepository.getById(selection.archivedTeamId);
    if (byId) return byId;
  }
  return selection.teamName.trim() ? teamRepository.getByName(selection.teamName) : null;
}

/**
 * Adds a player to a match roster by jersey number while scouting.
 *
 * If the team archive already knows that jersey, the archived player (and its
 * name) is reused; otherwise an unnamed player is also added to the archive so
 * its name can be filled in later from the Teams page.
 * The caller persists the returned project.
 */
export async function addJerseyPlayerToMatch(
  project: MatchProject,
  teamSide: MatchTeamSide,
  input: { jerseyNumber: number; isLibero: boolean },
): Promise<AddMatchPlayerResult> {
  const selection = getMatchTeamSelection(project, teamSide);
  const archive = await findArchivedTeam(project, teamSide);
  const archivedPlayer = archive?.roster.players.find((player) => player.jerseyNumber === input.jerseyNumber);

  const result = addJerseyPlayerToSelection(selection, {
    ...input,
    archivedPlayer,
    archivedTeamId: archive?.team.id,
  });
  if (result.status === 'duplicate') {
    return result;
  }

  if (!archivedPlayer) {
    const archivePlayer = {
      id: result.player.id,
      jerseyNumber: result.player.jerseyNumber,
      firstName: '',
      lastName: '',
      playerCode: result.player.playerCode,
      isLibero: result.player.isLibero,
      isCaptain: false,
    };
    try {
      if (archive) {
        await teamRepository.addPlayer(archive.team.id, archivePlayer);
      } else if (selection.teamName.trim()) {
        const created = await teamRepository.create({ name: selection.teamName.trim(), staff: selection.staff, players: [archivePlayer] });
        result.selection.archivedTeamId = created.team.id;
        result.player.archivedTeamId = created.team.id;
      }
    } catch (error) {
      // The match roster is what scouting needs; a failed archive write only
      // means the name has to be entered on this match later.
      console.error('Could not add the new player to the team archive:', error);
    }
  }

  const nextProject: MatchProject = { ...project, updatedAt: Date.now() };
  setMatchTeamSelection(nextProject, teamSide, result.selection);
  return { status: 'added', project: nextProject, player: result.player };
}
