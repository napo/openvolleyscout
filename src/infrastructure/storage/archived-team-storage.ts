import { matchProjectDb } from '../db/match-project-db';
import type { ArchivedTeam, ArchivedRoster } from '@src/domain/team/types';

/**
 * Archived team storage functions
 * Manages team archive and historical rosters
 */

// ------ Archived Teams ------

export async function saveArchivedTeam(team: ArchivedTeam) {
  await matchProjectDb.archivedTeams.put(team);
}

export async function getArchivedTeamById(id: string): Promise<ArchivedTeam | null> {
  return (await matchProjectDb.archivedTeams.get(id)) ?? null;
}

export async function getArchivedTeamByName(name: string): Promise<ArchivedTeam | null> {
  return (await matchProjectDb.archivedTeams.where('name').equals(name).first()) ?? null;
}

export async function getAllArchivedTeams(): Promise<ArchivedTeam[]> {
  return await matchProjectDb.archivedTeams.orderBy('name').toArray();
}

/**
 * Find teams by partial name match (case-insensitive)
 */
export async function findArchivedTeamsByName(
  searchText: string,
): Promise<ArchivedTeam[]> {
  if (searchText.trim().length === 0) {
    return [];
  }

  const search = searchText.toLowerCase();
  const allTeams = await getAllArchivedTeams();

  return allTeams.filter((team) =>
    team.name.toLowerCase().includes(search),
  );
}

export async function deleteTeam(teamId: string) {
  await matchProjectDb.transaction('rw', matchProjectDb.archivedTeams, matchProjectDb.archivedRosters, async () => {
    const rosters = await matchProjectDb.archivedRosters.where('teamId').equals(teamId).toArray();

    for (const roster of rosters) {
      await matchProjectDb.archivedRosters.delete(roster.id);
    }

    await matchProjectDb.archivedTeams.delete(teamId);
  });
}

export async function deleteArchivedTeam(id: string) {
  await deleteTeam(id);
}

// ------ Archived Rosters ------

export async function saveArchivedRoster(roster: ArchivedRoster) {
  await matchProjectDb.archivedRosters.put(roster);
}

export async function getArchivedRosterById(id: string): Promise<ArchivedRoster | null> {
  return (await matchProjectDb.archivedRosters.get(id)) ?? null;
}

export async function getLatestRosterForTeam(teamId: string): Promise<ArchivedRoster | null> {
  return (
    (await matchProjectDb.archivedRosters.where('teamId').equals(teamId).last()) ??
    null
  );
}

export async function getHistoricalRostersForTeam(teamId: string): Promise<ArchivedRoster[]> {
  return await matchProjectDb.archivedRosters.where('teamId').equals(teamId).toArray();
}

export async function deleteArchivedRoster(id: string) {
  await matchProjectDb.archivedRosters.delete(id);
}
