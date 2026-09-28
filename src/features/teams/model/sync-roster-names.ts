import {
  applyArchivedNamesToSelection,
  getMatchTeamSelection,
  isSelectionForArchivedTeam,
  setMatchTeamSelection,
  type MatchProject,
  type MatchTeamSide,
} from '@src/domain/match';
import { matchRepository, teamRepository } from '@src/infrastructure/repositories';

const SIDES: MatchTeamSide[] = ['home', 'away'];

/**
 * Pushes the names stored in a team archive into every saved match of that
 * team, so players scouted by jersey number get their names afterwards.
 * Returns the matches that changed.
 */
export async function syncArchivedTeamNamesToMatches(teamId: string): Promise<MatchProject[]> {
  const record = await teamRepository.getById(teamId);
  if (!record) return [];

  const projects = await matchRepository.list();
  const updated: MatchProject[] = [];

  for (const project of projects) {
    let changed = false;
    const next: MatchProject = { ...project };

    for (const side of SIDES) {
      const selection = getMatchTeamSelection(next, side);
      if (!isSelectionForArchivedTeam(selection, record.team)) continue;

      const result = applyArchivedNamesToSelection(selection, record.roster.players);
      if (result.changed) {
        setMatchTeamSelection(next, side, result.selection);
        changed = true;
      }
    }

    if (changed) {
      updated.push(await matchRepository.update({ ...next, updatedAt: Date.now() }));
    }
  }

  return updated;
}
