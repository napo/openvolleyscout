import type { ArchivedRoster, ArchivedTeam } from '@src/domain/team/types';
import type { CompetitionArchiveEntry } from '@src/domain/archive/types';

/**
 * Bookkeeping for whole-database `.ovs` backup sync — one row per peer
 * device, covering all three archive collections together (there's only one
 * "archive" per device, unlike matches which each get their own sync state).
 */
export interface ArchiveSyncStateRecord {
  id: string;
  peerDeviceId: string;
  baseSnapshot: {
    teams: ArchivedTeam[];
    rosters: ArchivedRoster[];
    competitions: CompetitionArchiveEntry[];
  };
  lastSyncedAt: number;
}
