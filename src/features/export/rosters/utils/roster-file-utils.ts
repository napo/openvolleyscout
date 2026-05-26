import type { RosterExportFormat } from '../types';

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

export function downloadTextFile(fileName: string, text: string, mimeType: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const blob = new Blob([text], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
