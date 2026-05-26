import type { TeamSide } from '@src/domain/common/enums';
import type { MatchProject } from '@src/domain/match/types';
import type { ArchivedPlayer, ArchivedRoster, ArchivedTeam } from '@src/domain/team/types';
import type { TeamStaff } from '@src/domain/roster/types';
import type { ParsedImportWarning } from '../diagnostics';

export type DataVolleyTeamPersistenceAction = 'create' | 'update';

export interface DataVolleyTeamRosterChangeSummary {
  importedPlayers: number;
  playersAdded: number;
  playersUpdated: number;
  playersUnchanged: number;
}

export interface DataVolleyTeamPersistencePreview {
  side: TeamSide;
  teamName: string;
  normalizedTeamName: string;
  action: DataVolleyTeamPersistenceAction;
  existingTeamId?: string;
  existingTeamName?: string;
  collisionTeamIds: string[];
  rosterChanges: DataVolleyTeamRosterChangeSummary;
}

export interface DataVolleyPersistedTeam extends DataVolleyTeamPersistencePreview {
  team: ArchivedTeam;
  roster: ArchivedRoster;
  playerIdMap: Record<string, string>;
}

export interface DataVolleyTeamPersistenceAnalysis {
  teamPreviews: DataVolleyTeamPersistencePreview[];
  warnings: ParsedImportWarning[];
}

export interface DataVolleyTeamPersistenceResult extends DataVolleyTeamPersistenceAnalysis {
  project: MatchProject;
  persistedTeams: DataVolleyPersistedTeam[];
}

export interface DataVolleyTeamRecordInput {
  id?: string;
  teamCode?: string;
  name: string;
  staff?: TeamStaff;
  players?: ArchivedPlayer[];
  createdAt?: number;
  updatedAt?: number;
}

export interface DataVolleyTeamRepositoryRecord {
  team: ArchivedTeam;
  roster: ArchivedRoster;
}

export interface DataVolleyTeamPersistenceRepository {
  list(): Promise<ArchivedTeam[]>;
  getById(teamId: string): Promise<DataVolleyTeamRepositoryRecord | null>;
  create(input: DataVolleyTeamRecordInput): Promise<DataVolleyTeamRepositoryRecord>;
  update(
    teamId: string,
    updates: {
      name?: string;
      staff?: TeamStaff;
      players?: ArchivedPlayer[];
    },
  ): Promise<DataVolleyTeamRepositoryRecord>;
}
