import type { TeamStaff } from '@src/domain/roster/types';
import type { ArchivedPlayer, ArchivedTeam, ArchivedRoster } from '@src/domain/team/types';
import {
  addPlayerToTeam,
  createTeam as createStoredTeam,
  deletePlayer as deleteStoredPlayer,
  deleteTeam as deleteStoredTeam,
  findArchivedTeamsByName,
  getAllArchivedTeams,
  getArchivedTeamById,
  getArchivedTeamByName,
  getLatestRosterForTeam,
  getTeamRecord,
  updatePlayer as updateStoredPlayer,
  updateTeam as updateStoredTeam,
} from '../storage/archived-team-storage';
import { createEmptyArchivedRoster } from '@src/domain/team/factories';
import { cloneEntity, withRepositoryError } from './shared';

type TeamRecordInput = {
  id?: string;
  teamCode?: string;
  name: string;
  staff?: TeamStaff;
  players?: ArchivedPlayer[];
  createdAt?: number;
  updatedAt?: number;
};

export type ArchivedTeamAggregate = {
  team: ArchivedTeam;
  roster: ArchivedRoster;
};

const REPOSITORY_NAME = 'teamRepository';

function cloneAggregate(record: ArchivedTeamAggregate): ArchivedTeamAggregate {
  return {
    team: cloneEntity(record.team),
    roster: cloneEntity(record.roster),
  };
}

async function getRequiredTeamRecord(teamId: string): Promise<ArchivedTeamAggregate> {
  const record = await getTeamRecord(teamId);
  if (!record) {
    throw new Error(`Archived team ${teamId} not found`);
  }

  return cloneAggregate(record);
}

export const teamRepository = {
  async create(input: TeamRecordInput): Promise<ArchivedTeamAggregate> {
    return withRepositoryError(REPOSITORY_NAME, 'create team', async () => {
      const created = await createStoredTeam(cloneEntity(input));
      return getRequiredTeamRecord(created.team.id);
    });
  },

  async getById(teamId: string): Promise<ArchivedTeamAggregate | null> {
    return withRepositoryError(REPOSITORY_NAME, 'read team by id', async () => {
      const record = await getTeamRecord(teamId);
      return record ? cloneAggregate(record) : null;
    });
  },

  async getByName(name: string): Promise<ArchivedTeamAggregate | null> {
    return withRepositoryError(REPOSITORY_NAME, 'read team by name', async () => {
      const team = await getArchivedTeamByName(name.trim());
      if (!team) {
        return null;
      }

      return getRequiredTeamRecord(team.id);
    });
  },

  async list(): Promise<ArchivedTeam[]> {
    return withRepositoryError(REPOSITORY_NAME, 'list teams', async () => {
      const teams = await getAllArchivedTeams();
      return teams.map((team) => cloneEntity(team));
    });
  },

  async getAllRecords(): Promise<ArchivedTeamAggregate[]> {
    return withRepositoryError(REPOSITORY_NAME, 'list teams with rosters', async () => {
      const teams = await getAllArchivedTeams();
      const records = await Promise.all(
        teams.map(async (team) => {
          const roster = await getLatestRosterForTeam(team.id);
          return {
            team: cloneEntity(team),
            roster: cloneEntity(roster ?? createEmptyArchivedRoster(team.id)),
          };
        }),
      );

      return records;
    });
  },

  async searchByName(searchText: string): Promise<ArchivedTeam[]> {
    return withRepositoryError(REPOSITORY_NAME, 'search teams', async () => {
      const teams = await findArchivedTeamsByName(searchText);
      return teams.map((team) => cloneEntity(team));
    });
  },

  async update(
    teamId: string,
    updates: {
      name?: string;
      staff?: TeamStaff;
      players?: ArchivedPlayer[];
    },
  ): Promise<ArchivedTeamAggregate> {
    return withRepositoryError(REPOSITORY_NAME, 'update team', async () => {
      const updated = await updateStoredTeam(teamId, cloneEntity(updates));
      return getRequiredTeamRecord(updated.team.id);
    });
  },

  async delete(teamId: string): Promise<void> {
    return withRepositoryError(REPOSITORY_NAME, 'delete team', async () => {
      await deleteStoredTeam(teamId);
    });
  },

  async addPlayer(teamId: string, player: ArchivedPlayer): Promise<ArchivedTeamAggregate> {
    return withRepositoryError(REPOSITORY_NAME, 'add player', async () => {
      const updated = await addPlayerToTeam(teamId, cloneEntity(player));
      return getRequiredTeamRecord(updated.team.id);
    });
  },

  async updatePlayer(
    teamId: string,
    playerId: string,
    updates: Partial<ArchivedPlayer>,
  ): Promise<ArchivedTeamAggregate> {
    return withRepositoryError(REPOSITORY_NAME, 'update player', async () => {
      const updated = await updateStoredPlayer(teamId, playerId, cloneEntity(updates));
      return getRequiredTeamRecord(updated.team.id);
    });
  },

  async deletePlayer(teamId: string, playerId: string): Promise<ArchivedTeamAggregate> {
    return withRepositoryError(REPOSITORY_NAME, 'delete player', async () => {
      const updated = await deleteStoredPlayer(teamId, playerId);
      return getRequiredTeamRecord(updated.team.id);
    });
  },

  async getArchivedTeamById(teamId: string): Promise<ArchivedTeam | null> {
    return withRepositoryError(REPOSITORY_NAME, 'read archived team', async () => {
      const team = await getArchivedTeamById(teamId);
      return team ? cloneEntity(team) : null;
    });
  },

  async getLatestRoster(teamId: string): Promise<ArchivedRoster | null> {
    return withRepositoryError(REPOSITORY_NAME, 'read latest roster', async () => {
      const roster = await getLatestRosterForTeam(teamId);
      return roster ? cloneEntity(roster) : null;
    });
  },
};
