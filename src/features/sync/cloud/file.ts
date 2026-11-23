// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Serializes and deserializes a `CloudSnapshot` as a standard `.ovs` backup
 * zip bundle with an extra `deletions.json` entry for cloud tombstones.
 * Because it is a standard `.ovs` backup, the file on Google Drive, Dropbox,
 * or OneDrive can also be downloaded and imported manually via Load Data.
 */

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { MatchProject } from '@src/domain/match/types';
import { buildOvsBackupBundle } from '../backup-bundle/zip-backup-bundle';
import { parseOvsBackupBundleFile } from '../backup-bundle';
import { getOrCreateDeviceId } from '../ovs-bundle/device-id';
import type { CloudSnapshot, CloudSystemRecord, DeletionMap } from './merge';
import { EMPTY_PRESENCE, type Presence, parsePresence } from './presence';

const DELETIONS_ENTRY = 'deletions.json';
const PRESENCE_ENTRY = 'presence.json';

/** Thrown when the remote `.ovs` file cannot be read (corrupt or written by a newer app version). */
export class CloudFileError extends Error {}

function asSystemRecords(items: readonly unknown[]): CloudSystemRecord[] {
  return items.filter((item): item is CloudSystemRecord => (
    Boolean(item) && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string'
  ));
}

export function writeCloudSyncFile(snapshot: CloudSnapshot, presence: Presence = snapshot.presence ?? EMPTY_PRESENCE): Uint8Array {
  const baseBytes = buildOvsBackupBundle(
    [...snapshot.matches],
    {
      teams: [...snapshot.teams],
      rosters: [...snapshot.rosters],
      competitions: [...snapshot.competitions],
      opponentReports: [...snapshot.opponentReports],
    },
    {
      includeArchivedTeams: true,
      includeArchivedRosters: true,
      includeArchivedCompetitions: true,
      includeOpponentReports: true,
      includeSystems: true,
    },
    getOrCreateDeviceId(),
    {
      receptionSystems: [...snapshot.receptionSystems],
      defenseSystems: [...snapshot.defenseSystems],
    },
  );
  const entries = unzipSync(baseBytes);
  entries[DELETIONS_ENTRY] = strToU8(JSON.stringify(snapshot.deletions));
  entries[PRESENCE_ENTRY] = strToU8(JSON.stringify(presence));
  return zipSync(entries);
}

export function readCloudSyncFile(bytes: Uint8Array): CloudSnapshot {
  try {
    const parsed = parseOvsBackupBundleFile(bytes);
    const entries = unzipSync(bytes);
    const rawDeletions = entries[DELETIONS_ENTRY]
      ? (JSON.parse(strFromU8(entries[DELETIONS_ENTRY])) as unknown)
      : {};
    const deletions: DeletionMap = {};
    if (rawDeletions && typeof rawDeletions === 'object' && !Array.isArray(rawDeletions)) {
      for (const [k, v] of Object.entries(rawDeletions as Record<string, unknown>)) {
        if (typeof v === 'string') deletions[k] = v;
      }
    }

    const matches: MatchProject[] = parsed.matches.map(({ meta, events }) => ({
      ...meta,
      events,
      homeTeam: {
        id: meta.homeSelection.teamId,
        code: meta.homeSelection.teamCode ?? '',
        name: meta.homeSelection.teamName,
        players: meta.homeSelection.roster,
        staff: meta.homeSelection.staff,
      },
      awayTeam: {
        id: meta.awaySelection.teamId,
        code: meta.awaySelection.teamCode ?? '',
        name: meta.awaySelection.teamName,
        players: meta.awaySelection.roster,
        staff: meta.awaySelection.staff,
      },
    }));

    return {
      matches,
      teams: parsed.archives.teams,
      rosters: parsed.archives.rosters,
      competitions: parsed.archives.competitions,
      opponentReports: parsed.archives.opponentReports ?? [],
      receptionSystems: asSystemRecords(parsed.systems.receptionSystems),
      defenseSystems: asSystemRecords(parsed.systems.defenseSystems),
      deletions,
      presence: entries[PRESENCE_ENTRY]
        ? parsePresence(JSON.parse(strFromU8(entries[PRESENCE_ENTRY])))
        : EMPTY_PRESENCE,
    };
  } catch (error) {
    throw new CloudFileError(error instanceof Error ? error.message : String(error));
  }
}
