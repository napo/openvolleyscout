import { matchProjectDb } from '../db/match-project-db';
import type { ArchivedCompetitionName } from '@src/domain/archive/types';

export async function saveCompetitionName(competition: ArchivedCompetitionName) {
  await matchProjectDb.archivedCompetitions.put(competition);
}

export async function getCompetitionNameById(id: string): Promise<ArchivedCompetitionName | null> {
  return (await matchProjectDb.archivedCompetitions.get(id)) ?? null;
}

export async function getCompetitionNameByName(name: string): Promise<ArchivedCompetitionName | null> {
  return (await matchProjectDb.archivedCompetitions.where('name').equals(name).first()) ?? null;
}

export async function getAllCompetitionNames(): Promise<ArchivedCompetitionName[]> {
  return await matchProjectDb.archivedCompetitions.orderBy('name').toArray();
}

export async function findCompetitionNamesByText(searchText: string): Promise<ArchivedCompetitionName[]> {
  if (searchText.trim().length === 0) {
    return [];
  }

  const search = searchText.toLowerCase();
  const allCompetitions = await getAllCompetitionNames();

  return allCompetitions.filter((competition) =>
    competition.name.toLowerCase().includes(search),
  );
}
