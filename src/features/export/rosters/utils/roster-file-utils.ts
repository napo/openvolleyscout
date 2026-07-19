import type { RosterExportFormat } from '../types';
import { saveFile } from '../../../../lib/utils/save-file';

const INVALID_FILE_NAME_CHARACTERS = /[^\w\-. ]+/g;

export function sanitizeFileName(name: string): string {
  const normalized = name
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(INVALID_FILE_NAME_CHARACTERS, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .normalize('NFC');

  return normalized || 'OpenVolleyScout';
}

export function getRosterExportFileName(
  teamName: string,
  format: RosterExportFormat,
  allTeams = false,
): string {
  const baseName = allTeams
    ? 'OpenVolleyScout-rosters'
    : `${sanitizeFileName(teamName)}-roster`;

  return `${baseName}.${format}`;
}

export async function downloadTextFile(fileName: string, text: string, mimeType: string): Promise<void> {
  await saveFile(fileName, text, mimeType);
}
