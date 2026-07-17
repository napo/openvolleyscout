import type { ArchivedRoster, ArchivedTeam } from '@src/domain/team/types';
import type { CompetitionArchiveEntry } from '@src/domain/archive/types';
import type { ArchivedDataSnapshot } from '../backup-bundle/types';
import { mergeIdKeyedArray } from './id-keyed-array-merge';
import { recordIdKeyedConflicts, type PathConflict } from './path-conflict';

export interface ArchiveMergeResult {
  merged: ArchivedDataSnapshot;
  conflicts: PathConflict[];
}

/**
 * 3-way merge for the whole-database backup's archive collections. Reuses
 * `mergeIdKeyedArray` exactly as-is for each collection — none of them need
 * timestamps, since the primitive diffs content against the recorded base
 * snapshot rather than comparing `updatedAt`.
 */
export function mergeArchives(
  base: ArchivedDataSnapshot,
  local: ArchivedDataSnapshot,
  remote: ArchivedDataSnapshot,
): ArchiveMergeResult {
  const conflicts: PathConflict[] = [];

  const teams = mergeIdKeyedArray<ArchivedTeam>(base.teams, local.teams, remote.teams, (team) => team.id);
  recordIdKeyedConflicts('archivedTeams', teams.conflicts, conflicts);

  const rosters = mergeIdKeyedArray<ArchivedRoster>(base.rosters, local.rosters, remote.rosters, (roster) => roster.id);
  recordIdKeyedConflicts('archivedRosters', rosters.conflicts, conflicts);

  const competitions = mergeIdKeyedArray<CompetitionArchiveEntry>(
    base.competitions,
    local.competitions,
    remote.competitions,
    (competition) => competition.id,
  );
  recordIdKeyedConflicts('archivedCompetitions', competitions.conflicts, conflicts);

  return {
    merged: { teams: teams.merged, rosters: rosters.merged, competitions: competitions.merged },
    conflicts,
  };
}
