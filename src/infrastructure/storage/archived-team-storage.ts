import { matchProjectDb } from '../db/match-project-db';
import type { ArchivedPlayer, ArchivedTeam, ArchivedRoster } from '@src/domain/team/types';
import type { TeamStaff } from '@src/domain/roster/types';
import { createEmptyArchivedRoster, createEmptyArchivedTeam } from '@src/domain/team/factories';
import { generateTeamCode } from '@src/domain/team/team-code';

type TeamRecordInput = {
  id?: string;
  teamCode?: string;
  name: string;
  staff?: TeamStaff;
  players?: ArchivedPlayer[];
  createdAt?: number;
  updatedAt?: number;
};

export type ArchivedTeamRecord = {
  team: ArchivedTeam;
  roster: ArchivedRoster;
};

function isTeamCodeInUse(teamCode: string, teams: ArchivedTeam[], currentTeamId?: string): boolean {
  return teams.some((team) => team.teamCode === teamCode && team.id !== currentTeamId);
}

function createUniqueTeamCode(teamName: string, teamId: string, teams: ArchivedTeam[], currentTeamId?: string): string {
  const suffixLengths = [4, 6, 8];

  for (const suffixLength of suffixLengths) {
    const candidateCode = generateTeamCode(teamName, teamId, suffixLength);
    if (!isTeamCodeInUse(candidateCode, teams, currentTeamId)) {
      return candidateCode;
    }
  }

  return `${generateTeamCode(teamName, teamId, 8)}-${teamId.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4)}`;
}

async function ensureTeamIdentity(team: ArchivedTeam): Promise<ArchivedTeam> {
  if (team.teamCode) {
    return team;
  }

  const allTeams = await matchProjectDb.archivedTeams.toArray();
  const updatedTeam: ArchivedTeam = {
    ...team,
    teamCode: createUniqueTeamCode(team.name, team.id, allTeams, team.id),
  };

  await matchProjectDb.archivedTeams.put(updatedTeam);
  return updatedTeam;
}

async function getOrCreateActiveRoster(teamId: string): Promise<ArchivedRoster> {
  const existingRoster = await getLatestRosterForTeam(teamId);
  if (existingRoster) {
    return existingRoster;
  }

  const roster = createEmptyArchivedRoster(teamId);
  await matchProjectDb.archivedRosters.put(roster);
  return roster;
}

async function saveRosterPlayers(teamId: string, players: ArchivedPlayer[]): Promise<ArchivedRoster> {
  const roster = await getOrCreateActiveRoster(teamId);
  const updatedRoster: ArchivedRoster = {
    ...roster,
    players,
  };

  await matchProjectDb.archivedRosters.put(updatedRoster);
  return updatedRoster;
}

async function ensureTeamRosterLink(team: ArchivedTeam, rosterId: string, updatedAt: number): Promise<ArchivedTeam> {
  const rosterIds = team.rosterIds.includes(rosterId) ? team.rosterIds : [...team.rosterIds, rosterId];
  const updatedTeam: ArchivedTeam = {
    ...team,
    rosterIds,
    updatedAt,
  };

  await matchProjectDb.archivedTeams.put(updatedTeam);
  return updatedTeam;
}

async function getTeamRecordOrThrow(teamId: string): Promise<ArchivedTeamRecord> {
  const team = await getArchivedTeamById(teamId);
  if (!team) {
    throw new Error(`Team ${teamId} not found`);
  }

  const roster = await getOrCreateActiveRoster(teamId);
  const linkedTeam = await ensureTeamRosterLink(team, roster.id, team.updatedAt);

  return {
    team: linkedTeam,
    roster,
  };
}

/**
 * Archived team storage functions
 * Manages team archive and historical rosters
 */

// ------ Archived Teams ------

export async function saveArchivedTeam(team: ArchivedTeam) {
  const normalizedTeam = await ensureTeamIdentity(team);
  await matchProjectDb.archivedTeams.put(normalizedTeam);
}

export async function getArchivedTeamById(id: string): Promise<ArchivedTeam | null> {
  const team = (await matchProjectDb.archivedTeams.get(id)) ?? null;
  return team ? ensureTeamIdentity(team) : null;
}

export async function getArchivedTeamByName(name: string): Promise<ArchivedTeam | null> {
  const team = (await matchProjectDb.archivedTeams.where('name').equals(name).first()) ?? null;
  return team ? ensureTeamIdentity(team) : null;
}

export async function getAllArchivedTeams(): Promise<ArchivedTeam[]> {
  const teams = await matchProjectDb.archivedTeams.orderBy('name').toArray();
  return Promise.all(teams.map((team) => ensureTeamIdentity(team)));
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

export async function getAllArchivedRosters(): Promise<ArchivedRoster[]> {
  return await matchProjectDb.archivedRosters.toArray();
}

export async function deleteArchivedRoster(id: string) {
  await matchProjectDb.archivedRosters.delete(id);
}

export async function getTeamRecord(teamId: string): Promise<ArchivedTeamRecord | null> {
  const team = await getArchivedTeamById(teamId);
  if (!team) {
    return null;
  }

  const roster = await getOrCreateActiveRoster(teamId);
  const linkedTeam = await ensureTeamRosterLink(team, roster.id, team.updatedAt);

  return {
    team: linkedTeam,
    roster,
  };
}

export async function createTeam(input: TeamRecordInput): Promise<ArchivedTeamRecord> {
  const now = input.updatedAt ?? Date.now();
  const trimmedName = input.name.trim();
  const baseTeam = input.id
    ? {
        id: input.id,
        name: trimmedName,
        teamCode: input.teamCode ?? '',
        staff: input.staff ?? { headCoach: '', assistantCoach: '' },
        rosterIds: [],
        createdAt: input.createdAt ?? now,
        updatedAt: now,
      }
    : createEmptyArchivedTeam(trimmedName, input.staff ?? { headCoach: '', assistantCoach: '' });
  const allTeams = await matchProjectDb.archivedTeams.toArray();
  const team: ArchivedTeam = {
    ...baseTeam,
    teamCode: input.teamCode ?? createUniqueTeamCode(trimmedName, baseTeam.id, allTeams, baseTeam.id),
  };

  const roster = createEmptyArchivedRoster(team.id);
  roster.players = input.players ?? [];

  const savedTeam: ArchivedTeam = {
    ...team,
    rosterIds: [roster.id],
    updatedAt: now,
  };

  await matchProjectDb.transaction('rw', matchProjectDb.archivedTeams, matchProjectDb.archivedRosters, async () => {
    await matchProjectDb.archivedTeams.put(savedTeam);
    await matchProjectDb.archivedRosters.put(roster);
  });

  return {
    team: savedTeam,
    roster,
  };
}

export async function updateTeam(
  teamId: string,
  updates: {
    name?: string;
    staff?: TeamStaff;
    players?: ArchivedPlayer[];
  },
): Promise<ArchivedTeamRecord> {
  const { team, roster } = await getTeamRecordOrThrow(teamId);
  const now = Date.now();

  const updatedTeam: ArchivedTeam = {
    ...team,
    name: updates.name !== undefined ? updates.name.trim() : team.name,
    staff: updates.staff ?? team.staff,
    updatedAt: now,
  };

  const updatedRoster: ArchivedRoster = {
    ...roster,
    players: updates.players ?? roster.players,
  };

  await matchProjectDb.transaction('rw', matchProjectDb.archivedTeams, matchProjectDb.archivedRosters, async () => {
    await matchProjectDb.archivedTeams.put(updatedTeam);
    await matchProjectDb.archivedRosters.put(updatedRoster);
  });

  return {
    team: updatedTeam,
    roster: updatedRoster,
  };
}

export async function addPlayerToTeam(teamId: string, player: ArchivedPlayer): Promise<ArchivedTeamRecord> {
  const { team, roster } = await getTeamRecordOrThrow(teamId);
  const updatedRoster = await saveRosterPlayers(teamId, [...roster.players, player]);
  const updatedTeam = await ensureTeamRosterLink(team, updatedRoster.id, Date.now());

  return {
    team: updatedTeam,
    roster: updatedRoster,
  };
}

export async function updatePlayer(
  teamId: string,
  playerId: string,
  updates: Partial<ArchivedPlayer>,
): Promise<ArchivedTeamRecord> {
  const { team, roster } = await getTeamRecordOrThrow(teamId);
  const updatedRoster = await saveRosterPlayers(
    teamId,
    roster.players.map((player) =>
      player.id === playerId
        ? {
            ...player,
            ...updates,
          }
        : player,
    ),
  );
  const updatedTeam = await ensureTeamRosterLink(team, updatedRoster.id, Date.now());

  return {
    team: updatedTeam,
    roster: updatedRoster,
  };
}

export async function deletePlayer(teamId: string, playerId: string): Promise<ArchivedTeamRecord> {
  const { team, roster } = await getTeamRecordOrThrow(teamId);
  const updatedRoster = await saveRosterPlayers(
    teamId,
    roster.players.filter((player) => player.id !== playerId),
  );
  const updatedTeam = await ensureTeamRosterLink(team, updatedRoster.id, Date.now());

  return {
    team: updatedTeam,
    roster: updatedRoster,
  };
}

export const teamRepository = {
  createTeam,
  updateTeam,
  deleteTeam,
  addPlayerToTeam,
  updatePlayer,
  deletePlayer,
  getTeamRecord,
  getArchivedTeamById,
  getArchivedTeamByName,
  getAllArchivedTeams,
  getLatestRosterForTeam,
  findArchivedTeamsByName,
};
