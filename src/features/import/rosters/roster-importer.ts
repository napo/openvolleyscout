import type { RosterImportFormat, RosterImportPayload } from './types';
import { parseRosterCsvImport, generateRosterCsvTemplate } from './roster-csv-importer';
import { parseRosterJsonImport } from './roster-json-importer';
import { downloadTextFile } from '../../export/rosters/utils/roster-file-utils';

export function detectRosterImportFormat(fileName: string): RosterImportFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.json')) return 'ovs-json';
  if (lower.endsWith('.csv')) return 'csv';
  return null;
}

export function parseRosterFile(text: string, format: RosterImportFormat): RosterImportPayload {
  if (format === 'ovs-json') {
    return parseRosterJsonImport(text);
  }
  return parseRosterCsvImport(text);
}

export function downloadRosterCsvTemplate(): void {
  const content = generateRosterCsvTemplate();
  downloadTextFile('roster-template.csv', content, 'text/csv;charset=utf-8');
}
