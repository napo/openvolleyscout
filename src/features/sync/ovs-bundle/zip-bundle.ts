import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { MatchProject } from '@src/domain/match/types';
import { APP_VERSION } from '@src/lib/constants/app';
import { decodeEventsTable, decodeTouchesTable, encodeEventsTable, encodeTouchesTable } from './serializer/arrow-codec';
import { flattenNonTouchEvents, unflattenEventRows } from './serializer/events-flatten';
import { buildMetaJson } from './serializer/meta-json';
import { flattenTouchEvents, unflattenTouchRows } from './serializer/touches-flatten';
import { OVS_FORMAT_VERSION, type OvsManifest, type ParsedOvsBundle } from './types';

export const MANIFEST_ENTRY = 'manifest.json';
const META_ENTRY = 'meta.json';
const TOUCHES_ENTRY = 'touches.arrow';
const EVENTS_ENTRY = 'events.arrow';

/**
 * The only module that imports `fflate` — the zip container is assembled
 * here from the outputs of the (also independently isolated) Arrow codec.
 */
export function buildOvsBundle(project: MatchProject, deviceId: string): Uint8Array {
  const manifest: OvsManifest = {
    ovsFormatVersion: OVS_FORMAT_VERSION,
    kind: 'match',
    matchId: project.metadata.id,
    exportedAt: new Date().toISOString(),
    exportedByDeviceId: deviceId,
    appVersion: APP_VERSION,
  };

  const touchRows = flattenTouchEvents(project.events);
  const eventRows = flattenNonTouchEvents(project.events);
  const meta = buildMetaJson(project);

  return zipSync({
    [MANIFEST_ENTRY]: strToU8(JSON.stringify(manifest)),
    [META_ENTRY]: strToU8(JSON.stringify(meta)),
    [TOUCHES_ENTRY]: encodeTouchesTable(touchRows),
    [EVENTS_ENTRY]: encodeEventsTable(eventRows),
  });
}

export function readOvsBundle(bytes: Uint8Array): ParsedOvsBundle {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (error) {
    throw new Error(`Invalid .ovs file: ${error instanceof Error ? error.message : String(error)}`);
  }

  const manifestEntry = entries[MANIFEST_ENTRY];
  const metaEntry = entries[META_ENTRY];
  const touchesEntry = entries[TOUCHES_ENTRY];
  const eventsEntry = entries[EVENTS_ENTRY];

  if (!manifestEntry || !metaEntry || !touchesEntry || !eventsEntry) {
    throw new Error('Invalid .ovs file: missing required entries');
  }

  const manifest = JSON.parse(strFromU8(manifestEntry)) as OvsManifest;
  if (manifest.ovsFormatVersion > OVS_FORMAT_VERSION) {
    throw new Error(
      `This .ovs file was exported by a newer app version (format v${manifest.ovsFormatVersion}) and can't be read here (supported: v${OVS_FORMAT_VERSION})`,
    );
  }

  return {
    manifest,
    meta: JSON.parse(strFromU8(metaEntry)),
    touchRows: decodeTouchesTable(touchesEntry),
    eventRows: decodeEventsTable(eventsEntry),
  };
}

export function reconstructEvents(parsed: Pick<ParsedOvsBundle, 'touchRows' | 'eventRows'>) {
  const touchEvents = unflattenTouchRows(parsed.touchRows);
  const nonTouchEvents = unflattenEventRows(parsed.eventRows);

  return [...touchEvents, ...nonTouchEvents]
    .sort((a, b) => a.sequenceIndex - b.sequenceIndex)
    .map(({ sequenceIndex: _sequenceIndex, ...event }) => event);
}

/** Minimal shape shared by both `OvsManifest` (`kind: 'match'`) and the backup
 * bundle's manifest (`kind: 'backup'`, defined in `backup-bundle/types.ts`) —
 * kept loose here so this module doesn't need to depend on that one. */
export interface OvsAnyManifest {
  kind: string;
  ovsFormatVersion: number;
}

/**
 * Reads just `manifest.json` from a `.ovs` file, without requiring the rest
 * of the single-match entries to be present — used to decide whether an
 * imported file is a single-match bundle or a whole-database backup bundle
 * before committing to either parser.
 */
export function peekOvsManifest(bytes: Uint8Array): OvsAnyManifest {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (error) {
    throw new Error(`Invalid .ovs file: ${error instanceof Error ? error.message : String(error)}`);
  }

  const manifestEntry = entries[MANIFEST_ENTRY];
  if (!manifestEntry) {
    throw new Error('Invalid .ovs file: missing manifest.json');
  }

  return JSON.parse(strFromU8(manifestEntry)) as OvsAnyManifest;
}
