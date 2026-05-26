import type { RosterExportDiagnostic, RosterExportPayload } from '../types';
import { createRosterExportDiagnostic, ROASTER_DIAGNOSTIC_CODES } from '../diagnostics/roster-diagnostics';
import { getRosterCsvHeaders, parseRosterCsv } from '../exporters/roster-csv-exporter';

const REQUIRED_JSON_FIELDS = ['format', 'version', 'teams'];
const SUPPORTED_TEAM_KEYS = new Set([
  'teamId',
  'teamName',
  'shortName',
  'federation',
  'club',
  'createdAt',
  'updatedAt',
  'staff',
  'players',
]);
const SUPPORTED_PLAYER_KEYS = new Set([
  'playerId',
  'playerCode',
  'jerseyNumber',
  'firstName',
  'lastName',
  'displayName',
  'role',
  'isCaptain',
  'isLibero',
  'handedness',
  'birthDate',
  'notes',
]);
const REQUIRED_CSV_HEADERS = ['TeamName', 'JerseyNumber', 'FirstName', 'LastName'];

function isUtf8Encodable(text: string): boolean {
  try {
    new TextEncoder().encode(text);
    return true;
  } catch {
    return false;
  }
}

export function validateRosterExport(payload: RosterExportPayload): RosterExportDiagnostic[] {
  const diagnostics: RosterExportDiagnostic[] = [];

  if (payload.format !== 'ovs-roster') {
    diagnostics.push(createRosterExportDiagnostic(
      'error',
      ROASTER_DIAGNOSTIC_CODES.invalidJson,
      `Invalid export format: ${String(payload.format)}`,
    ));
  }

  if (payload.version !== 1) {
    diagnostics.push(createRosterExportDiagnostic(
      'warning',
      ROASTER_DIAGNOSTIC_CODES.invalidJson,
      `Unsupported export version: ${String(payload.version)}`,
    ));
  }

  if (!Array.isArray(payload.teams)) {
    diagnostics.push(createRosterExportDiagnostic(
      'error',
      ROASTER_DIAGNOSTIC_CODES.invalidJson,
      'Export payload must contain a teams array.',
    ));
    return diagnostics;
  }

  payload.teams.forEach((team) => {
    if (!team.teamId) {
      diagnostics.push(createRosterExportDiagnostic(
        'error',
        ROASTER_DIAGNOSTIC_CODES.missingTeamId,
        'Team is missing an identifier.',
      ));
    }

    if (!team.teamName) {
      diagnostics.push(createRosterExportDiagnostic(
        'warning',
        ROASTER_DIAGNOSTIC_CODES.missingTeamName,
        'Team is missing a name.',
        team.teamId,
      ));
    }

    const teamFields = Object.keys(team);
    teamFields.forEach((field) => {
      if (!SUPPORTED_TEAM_KEYS.has(field)) {
        diagnostics.push(createRosterExportDiagnostic(
          'warning',
          ROASTER_DIAGNOSTIC_CODES.unsupportedTeamField,
          `Unsupported team field: ${field}`,
          team.teamId,
        ));
      }
    });

    const jerseyNumbers = new Map<number, string>();

    team.players.forEach((player) => {
      if (!player.firstName || !player.lastName) {
        diagnostics.push(createRosterExportDiagnostic(
          'warning',
          ROASTER_DIAGNOSTIC_CODES.missingPlayerName,
          'Player is missing first name or last name.',
          team.teamId,
          player.playerId,
        ));
      }

      if (!Number.isFinite(player.jerseyNumber) || player.jerseyNumber <= 0) {
        diagnostics.push(createRosterExportDiagnostic(
          'warning',
          ROASTER_DIAGNOSTIC_CODES.missingJerseyNumber,
          'Player is missing a valid jersey number.',
          team.teamId,
          player.playerId,
        ));
      }

      const existingPlayerId = jerseyNumbers.get(player.jerseyNumber);
      if (existingPlayerId) {
        diagnostics.push(createRosterExportDiagnostic(
          'warning',
          ROASTER_DIAGNOSTIC_CODES.duplicateJerseyNumber,
          `Duplicate jersey number ${player.jerseyNumber} for players ${existingPlayerId} and ${player.playerId}.`,
          team.teamId,
          player.playerId,
        ));
      } else {
        jerseyNumbers.set(player.jerseyNumber, player.playerId);
      }

      if (player.role && typeof player.role !== 'string') {
        diagnostics.push(createRosterExportDiagnostic(
          'warning',
          ROASTER_DIAGNOSTIC_CODES.invalidRole,
          `Unsupported role type for player ${player.playerId}.`,
          team.teamId,
          player.playerId,
        ));
      }

      Object.keys(player).forEach((field) => {
        if (!SUPPORTED_PLAYER_KEYS.has(field)) {
          diagnostics.push(createRosterExportDiagnostic(
            'warning',
            ROASTER_DIAGNOSTIC_CODES.unsupportedPlayerField,
            `Unsupported player field: ${field}`,
            team.teamId,
            player.playerId,
          ));
        }
      });
    });
  });

  if (!isUtf8Encodable(JSON.stringify(payload))) {
    diagnostics.push(createRosterExportDiagnostic(
      'error',
      ROASTER_DIAGNOSTIC_CODES.invalidUtf8,
      'Roster export payload cannot be encoded as UTF-8.',
    ));
  }

  return diagnostics;
}

export function validateRosterJson(jsonText: string): RosterExportDiagnostic[] {
  try {
    const parsed = JSON.parse(jsonText);
    if (typeof parsed !== 'object' || parsed === null) {
      return [createRosterExportDiagnostic('error', ROASTER_DIAGNOSTIC_CODES.invalidJson, 'JSON payload must contain an object.')];
    }

    const missingFields = REQUIRED_JSON_FIELDS.filter((field) => !(field in parsed));
    if (missingFields.length > 0) {
      return [createRosterExportDiagnostic(
        'error',
        ROASTER_DIAGNOSTIC_CODES.invalidJson,
        `JSON payload missing required fields: ${missingFields.join(', ')}`,
      )];
    }

    return validateRosterExport(parsed as RosterExportPayload);
  } catch (error) {
    return [createRosterExportDiagnostic(
      'error',
      ROASTER_DIAGNOSTIC_CODES.invalidJson,
      `Invalid JSON: ${(error as Error).message}`,
    )];
  }
}

export function validateRosterCsv(csvText: string): RosterExportDiagnostic[] {
  if (!isUtf8Encodable(csvText)) {
    return [createRosterExportDiagnostic('error', ROASTER_DIAGNOSTIC_CODES.invalidUtf8, 'CSV text cannot be encoded as UTF-8.')];
  }

  const rows = parseRosterCsv(csvText);
  if (rows.length === 0) {
    return [createRosterExportDiagnostic('error', ROASTER_DIAGNOSTIC_CODES.invalidCsv, 'CSV export must contain at least one row.')];
  }

  const headerRow = Object.keys(rows[0]);
  const missingHeaders = REQUIRED_CSV_HEADERS.filter((column) => !headerRow.includes(column));
  if (missingHeaders.length > 0) {
    return [createRosterExportDiagnostic(
      'error',
      ROASTER_DIAGNOSTIC_CODES.invalidCsvHeader,
      `CSV header missing required columns: ${missingHeaders.join(', ')}`,
    )];
  }

  return [];
}
