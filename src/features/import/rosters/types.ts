export type RosterImportFormat = 'ovs-json' | 'csv';

export type RosterImportDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface RosterImportDiagnostic {
  severity: RosterImportDiagnosticSeverity;
  code: string;
  message: string;
  teamName?: string;
}

export interface RosterImportPlayer {
  jerseyNumber: number;
  firstName: string;
  lastName: string;
  playerCode?: string;
  role?: string;
  isCaptain?: boolean;
  isLibero?: boolean;
}

export interface RosterImportTeam {
  teamName: string;
  players: RosterImportPlayer[];
}

export interface RosterImportPayload {
  teams: RosterImportTeam[];
  diagnostics: RosterImportDiagnostic[];
}

export const ROSTER_CSV_TEMPLATE_COLUMNS = [
  'Team',
  'JerseyNumber',
  'FirstName',
  'LastName',
  'FullName',
  'Role',
  'Captain',
  'Libero',
  'PlayerCode',
] as const;

export type RosterCsvTemplateColumn = typeof ROSTER_CSV_TEMPLATE_COLUMNS[number];
