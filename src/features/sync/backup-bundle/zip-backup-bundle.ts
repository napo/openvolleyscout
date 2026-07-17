import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { MatchEvent } from '@src/domain/events/types';
import type { MatchProject } from '@src/domain/match/types';
import { APP_VERSION } from '@src/lib/constants/app';
import {
  decodeBackupEventsTable,
  decodeBackupTouchesTable,
  encodeBackupEventsTable,
  encodeBackupTouchesTable,
} from '../ovs-bundle/serializer/arrow-codec';
import { flattenNonTouchEvents } from '../ovs-bundle/serializer/events-flatten';
import { buildMetaJson } from '../ovs-bundle/serializer/meta-json';
import { flattenTouchEvents } from '../ovs-bundle/serializer/touches-flatten';
import { MANIFEST_ENTRY, reconstructEvents } from '../ovs-bundle/zip-bundle';
import type { BackupOvsEventRow, BackupOvsTouchRow } from '../ovs-bundle/types';
import {
  OVS_BACKUP_FORMAT_VERSION,
  type ArchivedDataSnapshot,
  type BackupSelection,
  type OvsBackupManifest,
  type ParsedOvsBackupBundle,
} from './types';

const MATCH_META_ENTRY = 'matches-meta.json';
const TOUCHES_ENTRY = 'touches.arrow';
const EVENTS_ENTRY = 'events.arrow';
const ARCHIVED_TEAMS_ENTRY = 'archived_teams.json';
const ARCHIVED_ROSTERS_ENTRY = 'archived_rosters.json';
const ARCHIVED_COMPETITIONS_ENTRY = 'archived_competitions.json';

export function buildOvsBackupBundle(
  projects: MatchProject[],
  archives: ArchivedDataSnapshot,
  selection: BackupSelection,
  deviceId: string,
): Uint8Array {
  const includesArchivedTeams = selection.includeArchivedTeams ?? true;
  const includesArchivedRosters = selection.includeArchivedRosters ?? true;
  const includesArchivedCompetitions = selection.includeArchivedCompetitions ?? true;

  const manifest: OvsBackupManifest = {
    ovsFormatVersion: OVS_BACKUP_FORMAT_VERSION,
    kind: 'backup',
    matchIds: projects.map((project) => project.metadata.id),
    includesArchivedTeams,
    includesArchivedRosters,
    includesArchivedCompetitions,
    exportedAt: new Date().toISOString(),
    exportedByDeviceId: deviceId,
    appVersion: APP_VERSION,
  };

  const touchRows: BackupOvsTouchRow[] = [];
  const eventRows: BackupOvsEventRow[] = [];
  const matchMeta: Record<string, ReturnType<typeof buildMetaJson>> = {};

  for (const project of projects) {
    const matchId = project.metadata.id;
    for (const row of flattenTouchEvents(project.events)) {
      touchRows.push({ ...row, matchId });
    }
    for (const row of flattenNonTouchEvents(project.events)) {
      eventRows.push({ ...row, matchId });
    }
    matchMeta[matchId] = buildMetaJson(project);
  }

  const entries: Record<string, Uint8Array> = {
    [MANIFEST_ENTRY]: strToU8(JSON.stringify(manifest)),
    [MATCH_META_ENTRY]: strToU8(JSON.stringify(matchMeta)),
    [TOUCHES_ENTRY]: encodeBackupTouchesTable(touchRows),
    [EVENTS_ENTRY]: encodeBackupEventsTable(eventRows),
  };

  if (includesArchivedTeams) {
    entries[ARCHIVED_TEAMS_ENTRY] = strToU8(JSON.stringify(archives.teams));
  }
  if (includesArchivedRosters) {
    entries[ARCHIVED_ROSTERS_ENTRY] = strToU8(JSON.stringify(archives.rosters));
  }
  if (includesArchivedCompetitions) {
    entries[ARCHIVED_COMPETITIONS_ENTRY] = strToU8(JSON.stringify(archives.competitions));
  }

  return zipSync(entries);
}

export function readOvsBackupBundle(bytes: Uint8Array): ParsedOvsBackupBundle {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (error) {
    throw new Error(`Invalid .ovs backup file: ${error instanceof Error ? error.message : String(error)}`);
  }

  const manifestEntry = entries[MANIFEST_ENTRY];
  const matchMetaEntry = entries[MATCH_META_ENTRY];
  const touchesEntry = entries[TOUCHES_ENTRY];
  const eventsEntry = entries[EVENTS_ENTRY];

  if (!manifestEntry || !matchMetaEntry || !touchesEntry || !eventsEntry) {
    throw new Error('Invalid .ovs backup file: missing required entries');
  }

  const manifest = JSON.parse(strFromU8(manifestEntry)) as OvsBackupManifest;
  if (manifest.ovsFormatVersion > OVS_BACKUP_FORMAT_VERSION) {
    throw new Error(
      `This .ovs backup was exported by a newer app version (format v${manifest.ovsFormatVersion}) and can't be read here (supported: v${OVS_BACKUP_FORMAT_VERSION})`,
    );
  }

  const archivedTeamsEntry = entries[ARCHIVED_TEAMS_ENTRY];
  const archivedRostersEntry = entries[ARCHIVED_ROSTERS_ENTRY];
  const archivedCompetitionsEntry = entries[ARCHIVED_COMPETITIONS_ENTRY];

  return {
    manifest,
    matchMeta: JSON.parse(strFromU8(matchMetaEntry)),
    touchRows: decodeBackupTouchesTable(touchesEntry),
    eventRows: decodeBackupEventsTable(eventsEntry),
    archives: {
      teams: archivedTeamsEntry ? JSON.parse(strFromU8(archivedTeamsEntry)) : [],
      rosters: archivedRostersEntry ? JSON.parse(strFromU8(archivedRostersEntry)) : [],
      competitions: archivedCompetitionsEntry ? JSON.parse(strFromU8(archivedCompetitionsEntry)) : [],
    },
  };
}

/** Splits the combined touches/events tables back into one `MatchEvent[]` per match id. */
export function reconstructMatchEvents(parsed: ParsedOvsBackupBundle): Record<string, MatchEvent[]> {
  const touchesByMatch = new Map<string, BackupOvsTouchRow[]>();
  for (const row of parsed.touchRows) {
    const list = touchesByMatch.get(row.matchId) ?? [];
    list.push(row);
    touchesByMatch.set(row.matchId, list);
  }

  const eventsByMatch = new Map<string, BackupOvsEventRow[]>();
  for (const row of parsed.eventRows) {
    const list = eventsByMatch.get(row.matchId) ?? [];
    list.push(row);
    eventsByMatch.set(row.matchId, list);
  }

  const result: Record<string, MatchEvent[]> = {};
  for (const matchId of parsed.manifest.matchIds) {
    result[matchId] = reconstructEvents({
      touchRows: touchesByMatch.get(matchId) ?? [],
      eventRows: eventsByMatch.get(matchId) ?? [],
    });
  }

  return result;
}
