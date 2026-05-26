import type { RosterExportDiagnostic, RosterExportDiagnosticSeverity } from '../types';

export const ROASTER_DIAGNOSTIC_CODES = {
  invalidJson: 'invalid_json',
  invalidCsv: 'invalid_csv',
  invalidCsvHeader: 'invalid_csv_header',
  invalidUtf8: 'invalid_utf8',
  missingTeamId: 'missing_team_id',
  missingTeamName: 'missing_team_name',
  missingPlayerName: 'missing_player_name',
  missingJerseyNumber: 'missing_jersey_number',
  duplicateJerseyNumber: 'duplicate_jersey_number',
  invalidRole: 'invalid_role',
  unsupportedTeamField: 'unsupported_team_field',
  unsupportedPlayerField: 'unsupported_player_field',
} as const;

export function createRosterExportDiagnostic(
  severity: RosterExportDiagnosticSeverity,
  code: string,
  message: string,
  teamId?: string,
  playerId?: string,
): RosterExportDiagnostic {
  return {
    severity,
    code,
    message,
    teamId,
    playerId,
  };
}
