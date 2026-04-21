import { matchProjectDb } from '../db/match-project-db';
import type { CompetitionArchiveEntry } from '@src/domain/archive/types';

export async function saveCompetitionName(competition: CompetitionArchiveEntry) {
  await matchProjectDb.archivedCompetitions.put(competition);
}

export async function getCompetitionNameById(id: string): Promise<CompetitionArchiveEntry | null> {
  return (await matchProjectDb.archivedCompetitions.get(id)) ?? null;
}

export async function getCompetitionNameByName(name: string): Promise<CompetitionArchiveEntry | null> {
  return (await matchProjectDb.archivedCompetitions.where('name').equals(name).first()) ?? null;
}

export async function getAllCompetitionNames(): Promise<CompetitionArchiveEntry[]> {
  return await matchProjectDb.archivedCompetitions.orderBy('name').toArray();
}

export async function findCompetitionNamesByText(searchText: string): Promise<CompetitionArchiveEntry[]> {
  if (searchText.trim().length === 0) {
    return [];
  }

  const search = searchText.toLowerCase();
  const allCompetitions = await getAllCompetitionNames();

  return allCompetitions.filter((competition) =>
    competition.name.toLowerCase().includes(search),
  );
}

export async function deleteCompetitionName(id: string) {
  await matchProjectDb.archivedCompetitions.delete(id);
}

export const competitionRepository = {
  saveCompetitionName,
  getCompetitionNameById,
  getCompetitionNameByName,
  getAllCompetitionNames,
  findCompetitionNamesByText,
  deleteCompetitionName,
};
