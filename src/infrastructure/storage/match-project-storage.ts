import { matchProjectDb, type MatchSummaryRecord } from '../db/match-project-db';
import type { MatchProject } from '@src/domain/match/types';
import { getMatchTeamSnapshot, normalizeMatchProject } from '@src/domain/match';
import { formatProjectMatchResult } from '@src/features/scouting/model/match-result-format';

export type { MatchSummaryRecord };

export function buildMatchSummary(project: MatchProject): MatchSummaryRecord {
  const home = getMatchTeamSnapshot(project, 'home');
  const away = getMatchTeamSnapshot(project, 'away');
  return {
    id: project.metadata.id,
    title: project.metadata.title,
    competition: project.metadata.competition,
    venue: project.metadata.venue,
    playedAt: project.metadata.playedAt,
    isDemo: project.metadata.isDemo,
    phase: project.phase,
    homeTeamId: project.homeSelection?.archivedTeamId || project.homeSelection?.teamId || home.id,
    homeTeamName: home.name,
    awayTeamId: project.awaySelection?.archivedTeamId || project.awaySelection?.teamId || away.id,
    awayTeamName: away.name,
    result: formatProjectMatchResult(project),
    updatedAt: project.updatedAt,
  };
}

/** Stores the project and returns exactly what was stored (the normalized project). */
export async function saveMatchProject(project: MatchProject): Promise<MatchProject> {
  const normalized = normalizeMatchProject(project);
  const summary = buildMatchSummary(normalized);
  await matchProjectDb.transaction('rw', matchProjectDb.matchProjects, matchProjectDb.matchSummaries, async () => {
    await matchProjectDb.matchProjects.put(normalized);
    await matchProjectDb.matchSummaries.put(summary);
  });
  return normalized;
}

export async function getLatestMatchProject(): Promise<MatchProject | null> {
  const latest = await matchProjectDb.matchProjects.orderBy('updatedAt').last();
  return latest ? normalizeMatchProject(latest) : null;
}

export async function getMatchProjectById(id: string): Promise<MatchProject | null> {
  const project = await matchProjectDb.matchProjects.get(id);
  return project ? normalizeMatchProject(project) : null;
}

export async function deleteMatchProject(id: string) {
  await matchProjectDb.transaction('rw', matchProjectDb.matchProjects, matchProjectDb.matchSummaries, async () => {
    await matchProjectDb.matchProjects.delete(id);
    await matchProjectDb.matchSummaries.delete(id);
  });
}

export interface StorageLoadProgress {
  loaded: number;
  total: number;
  currentName: string;
}

const MATCH_LOAD_BATCH_SIZE = 8;

function yieldFrame(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

export async function getAllMatchProjects(
  onProgress?: (progress: StorageLoadProgress) => void,
): Promise<MatchProject[]> {
  if (!onProgress) {
    const projects = await matchProjectDb.matchProjects.orderBy('updatedAt').reverse().toArray();
    return projects.map(normalizeMatchProject);
  }

  const keys = await matchProjectDb.matchProjects.orderBy('updatedAt').reverse().primaryKeys();
  const total = keys.length;
  onProgress({ loaded: 0, total, currentName: '' });
  if (total === 0) return [];

  const result: MatchProject[] = [];
  let lastYield = Date.now();

  for (let i = 0; i < total; i += MATCH_LOAD_BATCH_SIZE) {
    const slice = keys.slice(i, i + MATCH_LOAD_BATCH_SIZE);
    const batch = await matchProjectDb.matchProjects.bulkGet(slice);
    let lastName = '';
    for (const raw of batch) {
      if (!raw) continue;
      const normalized = normalizeMatchProject(raw);
      result.push(normalized);
      const home = normalized.homeSelection?.teamName || normalized.homeTeam.name;
      const away = normalized.awaySelection?.teamName || normalized.awayTeam.name;
      lastName = home && away ? `${home} - ${away}` : (normalized.metadata.title || normalized.metadata.id);
    }
    onProgress({ loaded: Math.min(i + slice.length, total), total, currentName: lastName });
    if (Date.now() - lastYield >= 16) {
      await yieldFrame();
      lastYield = Date.now();
    }
  }

  return result;
}

/**
 * Returns lightweight match metadata summaries (~400 bytes each instead of ~1 MB).
 * Uses the `matchSummaries` index directly when in sync, and automatically backfills
 * once from `matchProjects` (reporting live progress) after an upgrade.
 */
export async function getAllMatchSummaries(
  onProgress?: (progress: StorageLoadProgress) => void,
): Promise<MatchSummaryRecord[]> {
  const [projectCount, summaryCount] = await Promise.all([
    matchProjectDb.matchProjects.count(),
    matchProjectDb.matchSummaries.count(),
  ]);

  if (projectCount === 0) {
    if (summaryCount > 0) await matchProjectDb.matchSummaries.clear();
    return [];
  }

  if (summaryCount === projectCount) {
    return matchProjectDb.matchSummaries.orderBy('updatedAt').reverse().toArray();
  }

  const allProjects = await getAllMatchProjects(onProgress);
  const summaries = allProjects.map(buildMatchSummary);
  await matchProjectDb.transaction('rw', matchProjectDb.matchSummaries, async () => {
    await matchProjectDb.matchSummaries.clear();
    await matchProjectDb.matchSummaries.bulkPut(summaries);
  });
  return summaries;
}

export async function createMatch(project: MatchProject) {
  await saveMatchProject(project);
}

export async function updateMatch(project: MatchProject) {
  await saveMatchProject(project);
}

export const matchRepository = {
  createMatch,
  updateMatch,
  saveMatchProject,
  deleteMatch: deleteMatchProject,
  getMatchById: getMatchProjectById,
  getLatestMatch: getLatestMatchProject,
  getAllMatches: getAllMatchProjects,
};
