import { matchProjectDb } from '../db/match-project-db';
import type { MatchProject } from '@src/domain/match/types';
import { normalizeMatchProject } from '@src/domain/match';

/** Stores the project and returns exactly what was stored (the normalized project). */
export async function saveMatchProject(project: MatchProject): Promise<MatchProject> {
  const normalized = normalizeMatchProject(project);
  await matchProjectDb.matchProjects.put(normalized);
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
  await matchProjectDb.matchProjects.delete(id);
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
