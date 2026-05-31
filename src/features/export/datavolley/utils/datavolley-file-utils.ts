import type { MatchProject } from '@src/domain/match/types';
import { getMatchTeamSnapshot } from '../../../../domain/match';
import { getCompletedSetsFromEvents, getCompletedSetsWinnerCount } from '../../../../domain/scouting';

const INVALID_FILE_NAME_CHARACTERS = /[^\w\-. (),]+/g;

export function sanitizeDataVolleyFileNamePart(value: string): string {
  const cleaned = value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(INVALID_FILE_NAME_CHARACTERS, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .normalize('NFC');

  return cleaned || 'OpenVolleyScout';
}

export function getDataVolleyExportFileName(project: MatchProject): string {
  const homeTeam = getMatchTeamSnapshot(project, 'home');
  const awayTeam = getMatchTeamSnapshot(project, 'away');
  const completedSets = getCompletedSetsFromEvents(project.events);
  const setsWon = getCompletedSetsWinnerCount(completedSets);
  const setScores = completedSets.map((set) => `${set.homeScore}-${set.awayScore}`).join(', ');
  const teams = `${sanitizeDataVolleyFileNamePart(homeTeam.name)}-${sanitizeDataVolleyFileNamePart(awayTeam.name)}`;
  const result = `${setsWon.home}-${setsWon.away}`;
  const suffix = setScores ? ` (${setScores})` : '';

  return `${teams} ${result}${suffix}.dvw`;
}

export function downloadDataVolleyFile(fileName: string, text: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const blob = new Blob([text], { type: 'application/octet-stream' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
