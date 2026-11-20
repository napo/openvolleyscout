/**
 * `.ovs` bundle - public API.
 *
 * Usage:
 *   import { exportMatchToOvsBundle, parseOvsBundleFile } from '@src/features/sync/ovs-bundle';
 */

import type { MatchEvent } from '@src/domain/events/types';
import type { MatchProject } from '@src/domain/match/types';
import { getMatchTeamSnapshot, normalizeMatchProject } from '@src/domain/match';
import { runMatchMigrations } from '@src/infrastructure/storage/match-migrations';
import { sanitizeDataVolleyFileNamePart } from '../../export/datavolley/utils/datavolley-file-utils';
import { getOrCreateDeviceId } from './device-id';
import { applyMetaJson } from './serializer/meta-json';
import { buildOvsBundle,  readOvsBundle, reconstructEvents } from './zip-bundle';
import type { OvsManifest } from './types';

export { OVS_FORMAT_VERSION } from './types';
export type { OvsManifest, OvsMetaJson, ParsedOvsBundle, BackupOvsTouchRow, BackupOvsEventRow } from './types';
export { peekOvsManifest } from './zip-bundle';
export type { OvsAnyManifest } from './zip-bundle';
export { getOrCreateDeviceId } from './device-id';

export interface OvsBundleExport {
  fileName: string;
  bytes: Uint8Array;
}

export function getOvsExportFileName(project: MatchProject): string {
  const homeTeam = getMatchTeamSnapshot(project, 'home');
  const awayTeam = getMatchTeamSnapshot(project, 'away');
  const teams = `${sanitizeDataVolleyFileNamePart(homeTeam.name)}-${sanitizeDataVolleyFileNamePart(awayTeam.name)}`;

  return `${teams}.ovs`;
}

export function exportMatchToOvsBundle(project: MatchProject): OvsBundleExport {
  const deviceId = getOrCreateDeviceId();
  const bytes = buildOvsBundle(project, deviceId);

  return { fileName: getOvsExportFileName(project), bytes };
}

export interface ParsedOvsMatch {
  manifest: OvsManifest;
  matchId: string;
  meta: Omit<MatchProject, 'events' | 'homeTeam' | 'awayTeam' | 'scoutingSession'>;
  events: MatchEvent[];
  migrationWarning?: string;
}

export function parseOvsBundleFile(bytes: Uint8Array): ParsedOvsMatch {
  const parsed = readOvsBundle(bytes);
  const meta = applyMetaJson(parsed.meta);
  const events = reconstructEvents(parsed);
  const candidate = normalizeMatchProject({
    ...meta,
    events,
    homeTeam: { id: meta.homeSelection.teamId, name: meta.homeSelection.teamName, players: meta.homeSelection.roster },
    awayTeam: { id: meta.awaySelection.teamId, name: meta.awaySelection.teamName, players: meta.awaySelection.roster },
  });
  const migrated = runMatchMigrations(candidate);

  return {
    manifest: parsed.manifest,
    matchId: parsed.manifest.matchId,
    meta: migrated.changed ? { ...meta, metadata: migrated.project.metadata } : meta,
    events: migrated.changed ? migrated.project.events : events,
    ...(migrated.warning ? { migrationWarning: migrated.warning } : {}),
  };
}
