import type { RosterExportFormat, RosterExportPayload } from './types';
import { downloadTextFile, getRosterExportFileName } from './utils/roster-file-utils';
import { serializeRosterExportToCsv } from './exporters/roster-csv-exporter';
import { serializeRosterExportToJson } from './exporters/roster-json-exporter';
import { validateRosterCsv, validateRosterJson } from './validation/roster-export-validation';

export function exportRosterPayload(
  payload: RosterExportPayload,
  format: RosterExportFormat,
  fileName: string,
): { diagnostics: readonly import('./types').RosterExportDiagnostic[]; fileName: string } {
  const content = format === 'json'
    ? serializeRosterExportToJson(payload)
    : serializeRosterExportToCsv(payload);

  const diagnostics = format === 'json'
    ? validateRosterJson(content)
    : validateRosterCsv(content);

  const mimeType = format === 'json'
    ? 'application/json;charset=utf-8'
    : 'text/csv;charset=utf-8';

  downloadTextFile(fileName, content, mimeType);

  return { diagnostics, fileName };
}

export function getDefaultRosterExportFileName(
  teamName: string,
  format: RosterExportFormat,
  allTeams = false,
) {
  return getRosterExportFileName(teamName, format, allTeams);
}
