import { competitionRepository } from '@src/infrastructure/repositories/competition-repository';
import { opponentReportRepository } from '@src/infrastructure/repositories/opponent-report-repository';
import { teamRepository } from '@src/infrastructure/repositories/team-repository';
import { getArchiveSyncState } from '@src/infrastructure/storage/archive-sync-state-storage';
import { differsFromLocalAppAsset } from '@src/infrastructure/storage/app-asset-storage';
import { isUsableAppAsset } from '@src/features/branding/app-asset-records';
import type { AppAssetRecord } from '@src/infrastructure/db/match-project-db';
import { parseOvsBackupBundleFile } from '../backup-bundle';
import type { ArchivedDataSnapshot } from '../backup-bundle/types';
import { mergeArchives, type ArchiveMergeResult } from '../merge/archive-merge';
import { buildMatchImportPreview, buildProjectFromParsed, type OvsImportPreview } from './build-ovs-import-preview';
import {
  mergeDefenseSystemImport,
  mergeReceptionSystemImport,
  useDefenseSystemStore,
  useReceptionSystemStore,
} from '@src/features/systems/model';

export interface SystemsImportPreview {
  /** Raw systems from the backup, applied on confirm. */
  receptionSystems: unknown[];
  defenseSystems: unknown[];
  /** Systems the import would add (new, or a changed copy) / already present. */
  added: number;
  unchanged: number;
}

export interface AppAssetsImportPreview {
  /** Print look and club logo from the backup that this version can use, put in place on confirm. */
  records: AppAssetRecord[];
  /** Values that differ from the ones on this device (they replace them) / already the same here. */
  added: number;
  unchanged: number;
}

export interface ArchivePreview {
  local: ArchivedDataSnapshot;
  remote: ArchivedDataSnapshot;
  result: ArchiveMergeResult;
}

export interface OvsBackupImportPreview {
  peerDeviceId: string;
  matchPreviews: OvsImportPreview[];
  archivePreview: ArchivePreview;
  systemsPreview: SystemsImportPreview;
  appAssetsPreview: AppAssetsImportPreview;
}

/**
 * Inspects a whole-database `.ovs` backup against local state without
 * writing anything - one `OvsImportPreview` per match (reusing the exact
 * same new-match/no-common-base/merge logic the single-match flow uses),
 * plus one merged view of the three archive collections.
 */
export async function buildOvsBackupImportPreview(bytes: Uint8Array): Promise<OvsBackupImportPreview> {
  const parsed = parseOvsBackupBundleFile(bytes);
  const peerDeviceId = parsed.manifest.exportedByDeviceId;

  const matchPreviews = await Promise.all(
    parsed.matches.map((match) => {
      const remoteProject = buildProjectFromParsed(match.meta, match.events);
      return buildMatchImportPreview(match.matchId, peerDeviceId, remoteProject);
    }),
  );

  const local: ArchivedDataSnapshot = {
    teams: await teamRepository.list(),
    rosters: await teamRepository.listAllRosters(),
    competitions: await competitionRepository.list(),
    opponentReports: await opponentReportRepository.list(),
  };
  // A backup made before opponent reports existed says nothing about them:
  // read it as "same as here", so no local report looks deleted remotely.
  const remote: ArchivedDataSnapshot = parsed.manifest.includesOpponentReports
    ? parsed.archives
    : { ...parsed.archives, opponentReports: local.opponentReports };

  const archiveSyncState = await getArchiveSyncState(peerDeviceId);
  // No recorded sync with this peer yet: fall back to `base = local`, so
  // anything only local has is kept, anything remote has that differs is
  // adopted, and nothing is silently deleted (see mergeIdKeyedArray).
  const archiveBase = archiveSyncState?.baseSnapshot ?? local;
  const result = mergeArchives(archiveBase, local, remote);

  const keepName = (name: string) => name;
  const receptionMerge = mergeReceptionSystemImport(
    useReceptionSystemStore.getState().receptionSystemBlocks,
    parsed.systems.receptionSystems,
    keepName,
  );
  const defenseMerge = mergeDefenseSystemImport(
    useDefenseSystemStore.getState().defenseSystemBlocks,
    parsed.systems.defenseSystems,
    keepName,
  );

  // A backup is a restore: its print look and logo replace the ones here when
  // they differ, even if those were changed after the backup was made.
  const appAssetRecords = parsed.appAssets.filter(isUsableAppAsset);
  let differingAppAssets = 0;
  for (const record of appAssetRecords) {
    if (await differsFromLocalAppAsset(record)) differingAppAssets += 1;
  }

  return {
    peerDeviceId,
    matchPreviews,
    archivePreview: { local, remote, result },
    systemsPreview: {
      receptionSystems: parsed.systems.receptionSystems,
      defenseSystems: parsed.systems.defenseSystems,
      added: receptionMerge.added + defenseMerge.added,
      unchanged: receptionMerge.unchanged + defenseMerge.unchanged,
    },
    appAssetsPreview: {
      records: appAssetRecords,
      added: differingAppAssets,
      unchanged: appAssetRecords.length - differingAppAssets,
    },
  };
}
