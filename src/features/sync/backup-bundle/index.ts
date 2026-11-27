/**
 * `.ovs` backup bundle - public API for whole-database export/import.
 *
 * Usage:
 *   import { exportBackupToOvsBundle, parseOvsBackupBundleFile } from '@src/features/sync/backup-bundle';
 */

import type { MatchEvent } from '@src/domain/events/types';
import type { MatchProject } from '@src/domain/match/types';
import { runMatchMigrations } from '@src/infrastructure/storage/match-migrations';
import { competitionRepository } from '@src/infrastructure/repositories/competition-repository';
import { opponentReportRepository } from '@src/infrastructure/repositories/opponent-report-repository';
import { matchRepository } from '@src/infrastructure/repositories/match-repository';
import { teamRepository } from '@src/infrastructure/repositories/team-repository';
import { getOrCreateDeviceId } from '../ovs-bundle/device-id';
import { applyMetaJson } from '../ovs-bundle/serializer/meta-json';
import { buildOvsBackupBundle, readOvsBackupBundle, reconstructMatchEvents } from './zip-backup-bundle';
import type { ArchivedDataSnapshot, BackupSelection, OvsBackupManifest, ParsedOvsBackupBundle } from './types';
import { todayLocalDate } from '../../../lib/utils/local-date';
import { useDefenseSystemStore } from '@src/features/systems/model/defense-system-store';
import { useReceptionSystemStore } from '@src/features/systems/model/reception-system-store';
import { loadAppAssets } from '@src/infrastructure/storage/app-asset-storage';
import type { AppAssetRecord } from '@src/infrastructure/db/match-project-db';
import { readAppAssetRecords } from '@src/features/branding/app-asset-records';

export { OVS_BACKUP_FORMAT_VERSION } from './types';
export type { ArchivedDataSnapshot, BackupSelection, OvsBackupManifest, ParsedOvsBackupBundle } from './types';

export interface OvsBackupBundleExport {
  fileName: string;
  bytes: Uint8Array;
}

export function getOvsBackupExportFileName(): string {
  const date = todayLocalDate();
  return `openvolleyscout-backup-${date}.ovs`;
}

export async function exportBackupToOvsBundle(selection: BackupSelection = {}): Promise<OvsBackupBundleExport> {
  const allProjects = await matchRepository.list();
  const matchIds = selection.matchIds;
  const projects = matchIds ? allProjects.filter((project) => matchIds.includes(project.metadata.id)) : allProjects;

  const includeTeams = selection.includeArchivedTeams ?? true;
  const includeRosters = selection.includeArchivedRosters ?? true;
  const includeCompetitions = selection.includeArchivedCompetitions ?? true;
  const includeOpponentReports = selection.includeOpponentReports ?? true;

  const archives: ArchivedDataSnapshot = {
    teams: includeTeams ? await teamRepository.list() : [],
    rosters: includeRosters ? await teamRepository.listAllRosters() : [],
    competitions: includeCompetitions ? await competitionRepository.list() : [],
    opponentReports: includeOpponentReports ? await opponentReportRepository.list() : [],
  };

  const systems = {
    receptionSystems: useReceptionSystemStore.getState().receptionSystemBlocks,
    defenseSystems: useDefenseSystemStore.getState().defenseSystemBlocks,
  };

  const appAssets = (selection.includeAppAssets ?? true) ? await loadAppAssets() : undefined;

  const deviceId = getOrCreateDeviceId();
  const bytes = buildOvsBackupBundle(projects, archives, selection, deviceId, systems, appAssets);

  return { fileName: getOvsBackupExportFileName(), bytes };
}

export interface ParsedOvsBackupMatch {
  matchId: string;
  meta: Omit<MatchProject, 'events' | 'homeTeam' | 'awayTeam' | 'scoutingSession'>;
  events: MatchEvent[];
  migrationWarning?: string;
}

export interface ParsedOvsBackup {
  manifest: OvsBackupManifest;
  matches: ParsedOvsBackupMatch[];
  archives: ArchivedDataSnapshot;
  systems: ParsedOvsBackupBundle['systems'];
  /** Print look and club logo, checked; empty for backups without them. */
  appAssets: AppAssetRecord[];
}

export function parseOvsBackupBundleFile(bytes: Uint8Array): ParsedOvsBackup {
  const parsed = readOvsBackupBundle(bytes);
  const eventsByMatch = reconstructMatchEvents(parsed);

  const matches: ParsedOvsBackupMatch[] = parsed.manifest.matchIds.map((matchId) => {
    const meta = applyMetaJson(parsed.matchMeta[matchId]);
    const events = eventsByMatch[matchId] ?? [];
    const candidate: MatchProject = {
      ...meta,
      events,
      homeTeam: { id: meta.homeSelection.teamId, code: meta.homeSelection.teamCode ?? '', name: meta.homeSelection.teamName, players: meta.homeSelection.roster, staff: meta.homeSelection.staff },
      awayTeam: { id: meta.awaySelection.teamId, code: meta.awaySelection.teamCode ?? '', name: meta.awaySelection.teamName, players: meta.awaySelection.roster, staff: meta.awaySelection.staff },
    };
    const migrated = runMatchMigrations(candidate);
    return {
      matchId,
      meta: migrated.changed ? { ...meta, metadata: migrated.project.metadata } : meta,
      events: migrated.changed ? migrated.project.events : events,
      ...(migrated.warning ? { migrationWarning: migrated.warning } : {}),
    };
  });

  return {
    manifest: parsed.manifest,
    matches,
    archives: parsed.archives,
    systems: parsed.systems,
    appAssets: readAppAssetRecords(parsed.appAssets),
  };
}
