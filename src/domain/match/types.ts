import type { MatchFormat, MatchPhase } from '../common/enums';
import type { MatchEvent } from '../events/types';
import type { Team, TeamStaff, Player } from '../roster/types';
import type { ScoutingSession } from '../scouting/types';

export type MatchTeamSelectionSource = 'archived_team' | 'manual_entry';
export type MatchRosterPlayerSource = 'archived_roster' | 'manual_entry';

export interface MatchMetadata {
  id: string;
  title?: string;
  competition?: string;
  season?: string;
  round?: string;
  venue?: string;
  playedAt?: string;
  format: MatchFormat;
  notes?: string;
  schemaVersion: number;
}

export interface MatchRosterPlayer extends Player {
  archivedPlayerId?: string;
  archivedTeamId?: string;
  source: MatchRosterPlayerSource;
}

export interface MatchTeamSelection {
  teamId: string;
  archivedTeamId?: string;
  teamName: string;
  teamCode?: string;
  source: MatchTeamSelectionSource;
  staff: TeamStaff;
  roster: MatchRosterPlayer[];
}

export interface MatchProject {
  metadata: MatchMetadata;
  homeTeam: Team;
  awayTeam: Team;
  homeSelection: MatchTeamSelection;
  awaySelection: MatchTeamSelection;
  phase: MatchPhase;
  events: MatchEvent[];
  scoutingSession?: ScoutingSession;
  linkedSystemIds?: string[];
  linkedAttackCombinationIds?: string[];
  linkedSetterCallIds?: string[];
  createdAt: number;
  updatedAt: number;
}
