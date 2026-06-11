import type { CompetitionArchiveEntry } from '../archive/types';
import type { MatchFormat, MatchPhase } from '../common/enums';
import type { MatchEvent } from '../events/types';
import type { Team, TeamStaff, Player } from '../roster/types';
import type { ScoutingMatchConfig, ScoutingSession } from '../scouting/types';
import type { MatchVideoAnalysis } from '../video/types';

export type MatchTeamSelectionSource = 'archived_team' | 'manual_entry';
export type MatchRosterPlayerSource = 'archived_roster' | 'manual_entry';
export type MatchTeamSide = 'home' | 'away';
export type MatchTeamSelectionKey = 'homeSelection' | 'awaySelection';

export interface MatchMetadata {
  id: string;
  title?: string;
  competition?: string;
  competitionEntryId?: CompetitionArchiveEntry['id'];
  matchNumber?: string;
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

export interface MatchRosterSelectionPlayer extends MatchRosterPlayer {
  isSelectedForMatch?: boolean;
  isFromArchive?: boolean;
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
  /**
   * Derived read model for UI consumers; never write match edits here.
   * The canonical home team data lives in homeSelection.
   */
  readonly homeTeam: Readonly<Team>;
  /**
   * Derived read model for UI consumers; never write match edits here.
   * The canonical away team data lives in awaySelection.
   */
  readonly awayTeam: Readonly<Team>;
  /**
   * Canonical match-specific source of truth for the home side.
   */
  homeSelection: MatchTeamSelection;
  /**
   * Canonical match-specific source of truth for the away side.
   */
  awaySelection: MatchTeamSelection;
  phase: MatchPhase;
  events: MatchEvent[];
  scoutingConfig?: ScoutingMatchConfig;
  scoutingSession?: ScoutingSession;
  linkedSystemIds?: string[];
  linkedAttackCombinationIds?: string[];
  linkedSetterCallIds?: string[];
  /**
   * Video analysis settings: path/URL of the match video and its sync points.
   * OVS stores only the reference to the video, never the video itself.
   */
  videoAnalysis?: MatchVideoAnalysis;
  createdAt: number;
  updatedAt: number;
}
