/**
 * `.ovs` bundle — public API.
 *
 * Usage:
 *   import { exportMatchToOvsBundle, parseOvsBundleFile } from '@src/features/sync/ovs-bundle';
 */

import type { MatchEvent } from '@src/domain/events/types';
import type { MatchProject } from '@src/domain/match/types';
import { getMatchTeamSnapshot } from '@src/domain/match';
import { sanitizeDataVolleyFileNamePart } from '../../export/datavolley/utils/datavolley-file-utils';
import { getOrCreateDeviceId } from './device-id';
import { applyMetaJson } from './serializer/meta-json';
import { buildOvsBundle, readOvsBundle, reconstructEvents } from './zip-bundle';
import type { OvsManifest } from './types';

export { OVS_FORMAT_VERSION } from './types';
export type { OvsManifest, OvsMetaJson, ParsedOvsBundle } from './types';

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
}

export function parseOvsBundleFile(bytes: Uint8Array): ParsedOvsMatch {
  const parsed = readOvsBundle(bytes);

  return {
    manifest: parsed.manifest,
    matchId: parsed.manifest.matchId,
    meta: applyMetaJson(parsed.meta),
    events: reconstructEvents(parsed),
  };
}
