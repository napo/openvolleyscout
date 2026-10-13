import { competitionRepository } from '@src/infrastructure/repositories/competition-repository';
import { teamRepository } from '@src/infrastructure/repositories/team-repository';
import { saveArchiveSyncState } from '@src/infrastructure/storage/archive-sync-state-storage';
import type { PathConflict } from '../merge/path-conflict';
import { confirmOvsImport } from './confirm-ovs-import';
import type { OvsBackupImportPreview } from './build-ovs-backup-preview';
import type { OvsImportPreview } from './build-ovs-import-preview';
import { useDefenseSystemStore, useReceptionSystemStore } from '@src/features/systems/model';

export interface ConfirmOvsBackupImportResult {
  importedMatchIds: string[];
  /** Matches that need a manual choice (open-set divergence, an unreplayable
   * merge, or no recorded common base) — resolve each individually with the
   * existing single-match `OvsImportPreview` flow, then re-run this import. */
  pendingMatchPreviews: OvsImportPreview[];
  failedMatches: Array<{ matchId: string; error: unknown }>;
  archiveConflicts: PathConflict[];
  /** Reception/defense systems added from the backup. */
  addedSystems: number;
}

function matchNeedsManualResolution(preview: OvsImportPreview): boolean {
  return preview.kind === 'no_common_base' || (preview.kind === 'merge' && preview.result.status === 'blocked');
}

/**
 * Applies a backup import with an "import what's clean now, flag the rest"
 * policy: every match preview that doesn't need a manual choice is imported
 * immediately (via the existing, unchanged single-match `confirmOvsImport`);
 * the rest are returned for one-at-a-time resolution later. Archive
 * collections have no blocking conflicts by design, so they always apply.
 */
export async function confirmOvsBackupImport(
  preview: OvsBackupImportPreview,
  options: {
    /** Name for an imported system that differs from a local one with its id. */
    renameConflictingSystem?: (name: string) => string;
  } = {},
): Promise<ConfirmOvsBackupImportResult> {
  const importedMatchIds: string[] = [];
  const pendingMatchPreviews: OvsImportPreview[] = [];
  const failedMatches: Array<{ matchId: string; error: unknown }> = [];

  for (const matchPreview of preview.matchPreviews) {
    if (matchNeedsManualResolution(matchPreview)) {
      pendingMatchPreviews.push(matchPreview);
      continue;
    }

    try {
      await confirmOvsImport(matchPreview, {});
      importedMatchIds.push(matchPreview.matchId);
    } catch (error) {
      failedMatches.push({ matchId: matchPreview.matchId, error });
    }
  }

  const { merged, conflicts } = preview.archivePreview.result;
  for (const team of merged.teams) {
    await teamRepository.restoreTeam(team);
  }
  for (const roster of merged.rosters) {
    await teamRepository.restoreRoster(roster);
  }
  for (const competition of merged.competitions) {
    await competitionRepository.restore(competition);
  }
  await saveArchiveSyncState(preview.peerDeviceId, merged);

  // After the archives, so imported team assignments find their teams.
  const renameConflict = options.renameConflictingSystem ?? ((name: string) => name);
  const reception = useReceptionSystemStore.getState()
    .importReceptionSystemBlocks(preview.systemsPreview.receptionSystems, renameConflict);
  const defense = useDefenseSystemStore.getState()
    .importDefenseSystemBlocks(preview.systemsPreview.defenseSystems, renameConflict);

  return {
    importedMatchIds,
    pendingMatchPreviews,
    failedMatches,
    archiveConflicts: conflicts,
    addedSystems: reception.added + defense.added,
  };
}
