import type { RosterExportPayload } from '../types';

export function serializeRosterExportToJson(payload: RosterExportPayload): string {
  return JSON.stringify(payload, null, 2) + '\n';
}
