import type { ArchivedPlayer, ArchivedTeam } from '@src/domain/team/types';
import { normalizeDataVolleyTeamName } from '@src/features/import/persistence/datavolley-team-persistence';
import { competitionRepository } from '@src/infrastructure/repositories/competition-repository';
import { opponentReportRepository } from '@src/infrastructure/repositories/opponent-report-repository';
import { teamRepository } from '@src/infrastructure/repositories/team-repository';
import { saveArchiveSyncState } from '@src/infrastructure/storage/archive-sync-state-storage';
import type { PathConflict } from '../merge/path-conflict';
import { confirmOvsImport } from './confirm-ovs-import';
import type { OvsBackupImportPreview } from './build-ovs-backup-preview';
import type { OvsImportPreview } from './build-ovs-import-preview';
import { useDefenseSystemStore, useReceptionSystemStore } from '@src/features/systems/model';
import { restoreAppAssets } from '@src/infrastructure/storage/app-asset-storage';
import { refreshPrintBrandingFromDatabase } from '@src/features/branding/print-branding';
import { remapRestoredAthletePhotos } from '@src/features/branding/athlete-photos';
import { loadAthletePhotos } from '@src/features/branding/athlete-photo-storage';
import { notifyLocalDataChanged } from '../cloud/local-change-bus';

function playerMergeKey(player: ArchivedPlayer): string {
  const nameKey = normalizeDataVolleyTeamName(`${player.lastName} ${player.firstName}`);
  if (nameKey) return nameKey;
  return player.playerCode.trim().toLowerCase() || `#${player.jerseyNumber}`;
}

function findMatchingLocalTeam(localTeams: readonly ArchivedTeam[], incoming: ArchivedTeam): ArchivedTeam | undefined {
  const byId = localTeams.find((t) => t.id === incoming.id);
  if (byId) return byId;
  const code = incoming.teamCode.trim().toLowerCase();
  if (code) {
    const byCode = localTeams.find((t) => t.teamCode.trim().toLowerCase() === code);
    if (byCode) return byCode;
  }
  const norm = normalizeDataVolleyTeamName(incoming.name);
  if (norm) {
    return localTeams.find((t) => normalizeDataVolleyTeamName(t.name) === norm);
  }
  return undefined;
}

export interface ConfirmOvsBackupImportResult {
  importedMatchIds: string[];
  /** Matches that need a manual choice (open-set divergence, an unreplayable
   * merge, or no recorded common base) - resolve each individually with the
   * existing single-match `OvsImportPreview` flow, then re-run this import. */
  pendingMatchPreviews: OvsImportPreview[];
  failedMatches: Array<{ matchId: string; error: unknown }>;
  archiveConflicts: PathConflict[];
  /** Reception/defense systems added from the backup. */
  addedSystems: number;
  /** Print look, club logo and athlete photos taken from the backup (where they differ from the ones here). */
  restoredAppAssets: number;
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

  // Restore/deduplicate archive teams BEFORE importing matches so match team
  // linking finds the exact existing archived teams instead of creating duplicates.
  const { merged, conflicts } = preview.archivePreview.result;
  const localTeams = await teamRepository.list();
  const remappedTeamIds = new Map<string, string>();
  // Incoming athletes merged into an athlete here (incoming id to the id kept here), for their photos.
  const remappedPlayerIds = new Map<string, string>();
  const rostersByTeamId = new Map(merged.rosters.map((roster) => [roster.teamId, roster]));

  for (const team of merged.teams) {
    const existing = findMatchingLocalTeam(localTeams, team);
    const incomingRoster = rostersByTeamId.get(team.id);

    if (existing && existing.id !== team.id) {
      remappedTeamIds.set(team.id, existing.id);
      if (incomingRoster && incomingRoster.players.length > 0) {
        const agg = await teamRepository.getById(existing.id);
        if (agg) {
          const mergedPlayers = new Map<string, ArchivedPlayer>();
          for (const p of agg.roster.players) mergedPlayers.set(playerMergeKey(p), p);
          for (const p of incomingRoster.players) {
            const key = playerMergeKey(p);
            const kept = mergedPlayers.get(key);
            if (!kept) mergedPlayers.set(key, p);
            else if (kept.id !== p.id) remappedPlayerIds.set(p.id, kept.id);
          }
          await teamRepository.update(existing.id, { players: [...mergedPlayers.values()] });
        }
      }
      continue;
    }

    await teamRepository.restoreTeam(team);
    if (!existing) localTeams.push(team);
    if (incomingRoster) {
      await teamRepository.restoreRoster(incomingRoster);
    }
  }
  for (const roster of merged.rosters) {
    if (remappedTeamIds.has(roster.teamId) || rostersByTeamId.get(roster.teamId) === roster) {
      continue;
    }
    await teamRepository.restoreRoster(roster);
  }
  for (const competition of merged.competitions) {
    await competitionRepository.restore(competition);
  }
  for (const report of merged.opponentReports ?? []) {
    const remappedOpponentId = report.opponent.archivedTeamId
      ? (remappedTeamIds.get(report.opponent.archivedTeamId) ?? report.opponent.archivedTeamId)
      : undefined;
    await opponentReportRepository.restore(
      remappedOpponentId && remappedOpponentId !== report.opponent.archivedTeamId
        ? { ...report, opponent: { ...report.opponent, archivedTeamId: remappedOpponentId } }
        : report,
    );
  }
  await saveArchiveSyncState(preview.peerDeviceId, merged);

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

  // After the archives, so imported team assignments find their teams.
  const renameConflict = options.renameConflictingSystem ?? ((name: string) => name);
  const reception = useReceptionSystemStore.getState()
    .importReceptionSystemBlocks(preview.systemsPreview.receptionSystems, renameConflict);
  const defense = useDefenseSystemStore.getState()
    .importDefenseSystemBlocks(preview.systemsPreview.defenseSystems, renameConflict);

  // Print look, club logo and athlete photos: the backup's value takes the place of the one here,
  // saved as a new change so cloud sync passes it on.
  // The photo of an incoming athlete merged into one here goes to the athlete here, when she has none.
  const localPhotos = remappedPlayerIds.size > 0
    ? await loadAthletePhotos(remappedPlayerIds.values())
    : new Map<string, string>();
  const restoredAppAssets = await restoreAppAssets(remapRestoredAthletePhotos(
    preview.appAssetsPreview?.records ?? [],
    remappedPlayerIds,
    new Set(localPhotos.keys()),
  ));
  if (restoredAppAssets > 0) {
    await refreshPrintBrandingFromDatabase();
    notifyLocalDataChanged();
  }

  return {
    importedMatchIds,
    pendingMatchPreviews,
    failedMatches,
    archiveConflicts: conflicts,
    addedSystems: reception.added + defense.added,
    restoredAppAssets,
  };
}
