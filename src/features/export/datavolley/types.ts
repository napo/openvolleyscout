import type { TeamSide } from '@src/domain/common/enums';
import type { MatchProject } from '@src/domain/match/types';

export type DataVolleyExportDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface DataVolleyExportDiagnostic {
  severity: DataVolleyExportDiagnosticSeverity;
  code: string;
  message: string;
  touchId?: string;
  eventId?: string;
  setNumber?: number;
  rallyNumber?: number;
}

export interface DataVolleyExportTeam {
  side: TeamSide;
  teamId: string;
  name: string;
  setsWon: number;
  headCoach: string;
  assistantCoach: string;
}

export interface DataVolleyExportPlayer {
  id: string;
  side: TeamSide;
  jerseyNumber: number;
  firstName: string;
  lastName: string;
  playerCode: string;
  specialRole: string;
  roleCode: string;
  startingPositions: Array<string | undefined>;
}

export interface DataVolleyExportSet {
  setNumber: number;
  played: boolean;
  homeScore?: number;
  awayScore?: number;
  durationMinutes?: number;
}

export interface DataVolleyScoutRow {
  code: string;
  pointPhase?: string;
  attackPhase?: string;
  startCoordinate?: string;
  midCoordinate?: string;
  endCoordinate?: string;
  time: string;
  setNumber: number;
  homeSetterPosition?: number;
  awaySetterPosition?: number;
  videoFileNumber?: string;
  videoTime?: number;
  homeLineup: Array<number | undefined>;
  awayLineup: Array<number | undefined>;
  touchId?: string;
  eventId?: string;
  rallyNumber?: number;
}

export interface DataVolleyExportModel {
  projectId: string;
  metadata: MatchProject['metadata'];
  generatedAt: number;
  matchDate?: string;
  matchTime?: string;
  teams: Record<TeamSide, DataVolleyExportTeam>;
  players: Record<TeamSide, DataVolleyExportPlayer[]>;
  sets: DataVolleyExportSet[];
  scoutRows: DataVolleyScoutRow[];
}

export interface DataVolleyExportResult {
  model: DataVolleyExportModel;
  text: string;
  fileName: string;
  diagnostics: DataVolleyExportDiagnostic[];
}
