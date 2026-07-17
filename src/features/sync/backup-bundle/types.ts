import type { ArchivedRoster, ArchivedTeam } from '@src/domain/team/types';
import type { CompetitionArchiveEntry } from '@src/domain/archive/types';
import type { BackupOvsEventRow, BackupOvsTouchRow, OvsMetaJson } from '../ovs-bundle/types';

export const OVS_BACKUP_FORMAT_VERSION = 1;

export interface OvsBackupManifest {
  ovsFormatVersion: number;
  kind: 'backup';
  matchIds: string[];
  includesArchivedTeams: boolean;
  includesArchivedRosters: boolean;
  includesArchivedCompetitions: boolean;
  exportedAt: string;
  exportedByDeviceId: string;
  appVersion: string;
}

/** What to include in a backup export. Omitted `matchIds` = every match. */
export interface BackupSelection {
  matchIds?: string[];
  includeArchivedTeams?: boolean;
  includeArchivedRosters?: boolean;
  includeArchivedCompetitions?: boolean;
}

export interface ArchivedDataSnapshot {
  teams: ArchivedTeam[];
  rosters: ArchivedRoster[];
  competitions: CompetitionArchiveEntry[];
}

export interface ParsedOvsBackupBundle {
  manifest: OvsBackupManifest;
  matchMeta: Record<string, OvsMetaJson>;
  touchRows: BackupOvsTouchRow[];
  eventRows: BackupOvsEventRow[];
  archives: ArchivedDataSnapshot;
}
