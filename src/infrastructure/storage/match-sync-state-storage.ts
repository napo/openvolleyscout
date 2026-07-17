import { matchProjectDb } from '../db/match-project-db';
import { getMatchSyncStateId, type MatchSyncStateRecord } from '../db/match-sync-state-types';
import type { MatchProject } from '@src/domain/match/types';

export async function getSyncState(matchId: string, peerDeviceId: string): Promise<MatchSyncStateRecord | null> {
  const record = await matchProjectDb.matchSyncState.get(getMatchSyncStateId(matchId, peerDeviceId));
  return record ?? null;
}

export async function saveSyncState(
  matchId: string,
  peerDeviceId: string,
  baseSnapshot: MatchProject,
  lastSyncedAt: number = Date.now(),
): Promise<void> {
  await matchProjectDb.matchSyncState.put({
    id: getMatchSyncStateId(matchId, peerDeviceId),
    matchId,
    peerDeviceId,
    baseSnapshot,
    lastSyncedAt,
  });
}
