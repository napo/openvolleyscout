import { matchProjectDb } from '../db/match-project-db';
import type { MatchProject } from '@src/domain/match/types';
import { normalizeMatchProject } from '@src/domain/match';

export async function saveMatchProject(project: MatchProject) {
  await matchProjectDb.matchProjects.put(normalizeMatchProject(project));
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

export async function getAllMatchProjects(): Promise<MatchProject[]> {
  const projects = await matchProjectDb.matchProjects.orderBy('updatedAt').reverse().toArray();
  return projects.map(normalizeMatchProject);
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
