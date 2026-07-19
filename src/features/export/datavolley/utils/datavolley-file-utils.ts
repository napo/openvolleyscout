import type { MatchProject } from '@src/domain/match/types';
import { saveFile } from '../../../../lib/utils/save-file';
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

export async function downloadDataVolleyFile(fileName: string, text: string): Promise<void> {
  await saveFile(fileName, text, 'application/octet-stream');
}
