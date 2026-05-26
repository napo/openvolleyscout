import type { ArchivedTeamAggregate } from '@src/infrastructure/repositories/team-repository';

export type RosterExportFormat = 'json' | 'csv';

export type RosterExportDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface RosterExportDiagnostic {
  severity: RosterExportDiagnosticSeverity;
  code: string;
  message: string;
  teamId?: string;
  playerId?: string;
}

export interface RosterExportStaff {
  headCoach?: string;
  assistantCoach?: string;
  scout?: string;
  statistician?: string;
}

export interface RosterExportPlayer {
  playerId: string;
  playerCode?: string;
  jerseyNumber: number;
  firstName: string;
  lastName: string;
  displayName: string;
  role?: string;
  isCaptain?: boolean;
  isLibero?: boolean;
  handedness?: string;
  birthDate?: string;
  notes?: string;
}

export interface RosterExportTeam {
  teamId: string;
  teamName: string;
  shortName?: string;
  federation?: string;
  club?: string;
  createdAt?: number;
  updatedAt?: number;
  staff?: RosterExportStaff;
  players: RosterExportPlayer[];
}

export interface RosterExportPayload {
  format: 'ovs-roster';
  version: 1;
  teams: RosterExportTeam[];
}

export type RosterExportTeamRecord = ArchivedTeamAggregate;
