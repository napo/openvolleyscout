import type { RosterImportDiagnostic, RosterImportPayload, RosterImportPlayer, RosterImportTeam } from './types';

export function parseRosterJsonImport(jsonText: string): RosterImportPayload {
  const diagnostics: RosterImportDiagnostic[] = [];
  const teams: RosterImportTeam[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    diagnostics.push({
      severity: 'error',
      code: 'invalid_json',
      message: `Invalid JSON: ${(error as Error).message}`,
    });
    return { teams, diagnostics };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    diagnostics.push({ severity: 'error', code: 'invalid_json', message: 'JSON payload must be an object.' });
    return { teams, diagnostics };
  }

  const obj = parsed as Record<string, unknown>;

  if (obj['format'] !== 'ovs-roster') {
    diagnostics.push({
      severity: 'error',
      code: 'invalid_format',
      message: `Expected format "ovs-roster", got "${String(obj['format'] ?? '')}"`,
    });
    return { teams, diagnostics };
  }

  if (!Array.isArray(obj['teams'])) {
    diagnostics.push({ severity: 'error', code: 'missing_teams', message: 'JSON payload must have a "teams" array.' });
    return { teams, diagnostics };
  }

  for (const rawTeam of obj['teams'] as unknown[]) {
    if (typeof rawTeam !== 'object' || rawTeam === null) {
      diagnostics.push({ severity: 'warning', code: 'invalid_team', message: 'Skipping non-object team entry.' });
      continue;
    }

    const teamObj = rawTeam as Record<string, unknown>;
    const teamName = typeof teamObj['teamName'] === 'string' ? teamObj['teamName'].trim() : '';

    if (!teamName) {
      diagnostics.push({ severity: 'warning', code: 'missing_team_name', message: 'Skipping team with no name.' });
      continue;
    }

    const rawPlayers = Array.isArray(teamObj['players']) ? (teamObj['players'] as unknown[]) : [];
    const players: RosterImportPlayer[] = [];

    for (const rawPlayer of rawPlayers) {
      if (typeof rawPlayer !== 'object' || rawPlayer === null) continue;
      const playerObj = rawPlayer as Record<string, unknown>;

      const firstName = typeof playerObj['firstName'] === 'string' ? playerObj['firstName'] : '';
      const lastName = typeof playerObj['lastName'] === 'string' ? playerObj['lastName'] : '';
      const jerseyNumber = typeof playerObj['jerseyNumber'] === 'number' ? playerObj['jerseyNumber'] : 0;

      players.push({
        jerseyNumber,
        firstName,
        lastName,
        playerCode: typeof playerObj['playerCode'] === 'string' ? playerObj['playerCode'] : undefined,
        role: typeof playerObj['role'] === 'string' ? playerObj['role'] : undefined,
        isCaptain: typeof playerObj['isCaptain'] === 'boolean' ? playerObj['isCaptain'] : false,
        isLibero: typeof playerObj['isLibero'] === 'boolean' ? playerObj['isLibero'] : false,
      });
    }

    teams.push({ teamName, players });
  }

  if (teams.length === 0) {
    diagnostics.push({ severity: 'warning', code: 'no_teams', message: 'No valid teams found in JSON.' });
  }

  return { teams, diagnostics };
}
