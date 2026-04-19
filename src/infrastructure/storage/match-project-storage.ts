import { matchProjectDb } from '../db/match-project-db';
import type { MatchProject } from '@src/domain/match/types';

export async function saveMatchProject(project: MatchProject) {
  await matchProjectDb.matchProjects.put(project);
}

export async function getLatestMatchProject(): Promise<MatchProject | null> {
  const latest = await matchProjectDb.matchProjects.orderBy('updatedAt').last();
  return latest ?? null;
}

export async function getMatchProjectById(id: string): Promise<MatchProject | null> {
  return (await matchProjectDb.matchProjects.get(id)) ?? null;
}

export async function deleteMatchProject(id: string) {
  await matchProjectDb.matchProjects.delete(id);
}

export async function getAllMatchProjects(): Promise<MatchProject[]> {
  return await matchProjectDb.matchProjects.orderBy('updatedAt').reverse().toArray();
}
