import { matchProjectDb } from '../db/match-project-db';
import type { ArchiveSyncStateRecord } from '../db/archive-sync-state-types';

export async function getArchiveSyncState(peerDeviceId: string): Promise<ArchiveSyncStateRecord | null> {
  const record = await matchProjectDb.archiveSyncState.get(peerDeviceId);
  return record ?? null;
}

export async function saveArchiveSyncState(
  peerDeviceId: string,
  baseSnapshot: ArchiveSyncStateRecord['baseSnapshot'],
  lastSyncedAt: number = Date.now(),
): Promise<void> {
  await matchProjectDb.archiveSyncState.put({
    id: peerDeviceId,
    peerDeviceId,
    baseSnapshot,
    lastSyncedAt,
  });
}
