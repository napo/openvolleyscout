/**
 * `.ovs` backup bundle — public API for whole-database export/import.
 *
 * Usage:
 *   import { exportBackupToOvsBundle, parseOvsBackupBundleFile } from '@src/features/sync/backup-bundle';
 */

import type { MatchEvent } from '@src/domain/events/types';
import type { MatchProject } from '@src/domain/match/types';
import { competitionRepository } from '@src/infrastructure/repositories/competition-repository';
import { matchRepository } from '@src/infrastructure/repositories/match-repository';
import { teamRepository } from '@src/infrastructure/repositories/team-repository';
import { getOrCreateDeviceId } from '../ovs-bundle/device-id';
import { applyMetaJson } from '../ovs-bundle/serializer/meta-json';
import { buildOvsBackupBundle, readOvsBackupBundle, reconstructMatchEvents } from './zip-backup-bundle';
import type { ArchivedDataSnapshot, BackupSelection, OvsBackupManifest } from './types';

export { OVS_BACKUP_FORMAT_VERSION } from './types';
export type { ArchivedDataSnapshot, BackupSelection, OvsBackupManifest, ParsedOvsBackupBundle } from './types';

export interface OvsBackupBundleExport {
  fileName: string;
  bytes: Uint8Array;
}

export function getOvsBackupExportFileName(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `openvolleyscout-backup-${date}.ovs`;
}

export async function exportBackupToOvsBundle(selection: BackupSelection = {}): Promise<OvsBackupBundleExport> {
  const allProjects = await matchRepository.list();
  const matchIds = selection.matchIds;
  const projects = matchIds ? allProjects.filter((project) => matchIds.includes(project.metadata.id)) : allProjects;

  const includeTeams = selection.includeArchivedTeams ?? true;
  const includeRosters = selection.includeArchivedRosters ?? true;
  const includeCompetitions = selection.includeArchivedCompetitions ?? true;

  const archives: ArchivedDataSnapshot = {
    teams: includeTeams ? await teamRepository.list() : [],
    rosters: includeRosters ? await teamRepository.listAllRosters() : [],
    competitions: includeCompetitions ? await competitionRepository.list() : [],
  };

  const deviceId = getOrCreateDeviceId();
  const bytes = buildOvsBackupBundle(projects, archives, selection, deviceId);

  return { fileName: getOvsBackupExportFileName(), bytes };
}

export interface ParsedOvsBackupMatch {
  matchId: string;
  meta: Omit<MatchProject, 'events' | 'homeTeam' | 'awayTeam' | 'scoutingSession'>;
  events: MatchEvent[];
}

export interface ParsedOvsBackup {
  manifest: OvsBackupManifest;
  matches: ParsedOvsBackupMatch[];
  archives: ArchivedDataSnapshot;
}

export function parseOvsBackupBundleFile(bytes: Uint8Array): ParsedOvsBackup {
  const parsed = readOvsBackupBundle(bytes);
  const eventsByMatch = reconstructMatchEvents(parsed);

  const matches: ParsedOvsBackupMatch[] = parsed.manifest.matchIds.map((matchId) => ({
    matchId,
    meta: applyMetaJson(parsed.matchMeta[matchId]),
    events: eventsByMatch[matchId] ?? [],
  }));

  return { manifest: parsed.manifest, matches, archives: parsed.archives };
}
