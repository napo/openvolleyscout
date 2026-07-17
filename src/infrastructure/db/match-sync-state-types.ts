import type { MatchProject } from '@src/domain/match/types';

/**
 * Bookkeeping for `.ovs` sync — kept out of `MatchProject` entirely, since
 * it's a transport/merge concern, not part of the match domain model.
 *
 * `baseSnapshot` is the full project state at the moment of the last
 * successful export/import with `peerDeviceId` — the common ancestor a
 * future 3-way merge with that same peer will diff against.
 */
export interface MatchSyncStateRecord {
  id: string;
  matchId: string;
  peerDeviceId: string;
  baseSnapshot: MatchProject;
  lastSyncedAt: number;
}

export function getMatchSyncStateId(matchId: string, peerDeviceId: string): string {
  return `${matchId}::${peerDeviceId}`;
}
