import { competitionRepository } from '@src/infrastructure/repositories/competition-repository';
import { teamRepository } from '@src/infrastructure/repositories/team-repository';
import { getArchiveSyncState } from '@src/infrastructure/storage/archive-sync-state-storage';
import { parseOvsBackupBundleFile } from '../backup-bundle';
import type { ArchivedDataSnapshot } from '../backup-bundle/types';
import { mergeArchives, type ArchiveMergeResult } from '../merge/archive-merge';
import { buildMatchImportPreview, buildProjectFromParsed, type OvsImportPreview } from './build-ovs-import-preview';

export interface ArchivePreview {
  local: ArchivedDataSnapshot;
  remote: ArchivedDataSnapshot;
  result: ArchiveMergeResult;
}

export interface OvsBackupImportPreview {
  peerDeviceId: string;
  matchPreviews: OvsImportPreview[];
  archivePreview: ArchivePreview;
}

/**
 * Inspects a whole-database `.ovs` backup against local state without
 * writing anything — one `OvsImportPreview` per match (reusing the exact
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
  };

  const archiveSyncState = await getArchiveSyncState(peerDeviceId);
  // No recorded sync with this peer yet: fall back to `base = local`, so
  // anything only local has is kept, anything remote has that differs is
  // adopted, and nothing is silently deleted (see mergeIdKeyedArray).
  const archiveBase = archiveSyncState?.baseSnapshot ?? local;
  const result = mergeArchives(archiveBase, local, parsed.archives);

  return {
    peerDeviceId,
    matchPreviews,
    archivePreview: { local, remote: parsed.archives, result },
  };
}
