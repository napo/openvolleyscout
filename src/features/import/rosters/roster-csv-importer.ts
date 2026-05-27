import type { RosterImportDiagnostic, RosterImportPayload, RosterImportPlayer, RosterImportTeam } from './types';
import { ROSTER_CSV_TEMPLATE_COLUMNS } from './types';

// Required columns in the import CSV (also valid for both full-export CSV and simple template CSV)
const FULL_EXPORT_REQUIRED_COLUMNS = ['TeamName', 'JerseyNumber', 'FirstName', 'LastName'];
const TEMPLATE_REQUIRED_COLUMNS = ['Team', 'JerseyNumber', 'FirstName', 'LastName'];

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentValue += '"';
        index += 1;
        continue;
      }
      if (char === '"') {
        inQuotes = false;
        continue;
      }
      currentValue += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      current.push(currentValue);
      currentValue = '';
      continue;
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && csvText[index + 1] === '\n') {
        index += 1;
      }
      current.push(currentValue);
      rows.push(current);
      current = [];
      currentValue = '';
      continue;
    }
    currentValue += char;
  }

  if (currentValue.length > 0 || current.length > 0) {
    current.push(currentValue);
    rows.push(current);
  }

  return rows;
}

function parseRawCsvRows(csvText: string): Array<Record<string, string>> {
  const rows = parseCsvRows(csvText).filter((row) => row.some((cell) => cell.trim() !== ''));
  if (rows.length === 0) return [];

  const header = rows[0];
  return rows.slice(1).map((row) => {
    const result: Record<string, string> = {};
    for (let i = 0; i < header.length; i += 1) {
      result[header[i] ?? `Col${i}`] = row[i] ?? '';
    }
    return result;
  });
}

function detectCsvVariant(headerRow: string[]): 'full-export' | 'template' | 'unknown' {
  const hasFullExportColumns = FULL_EXPORT_REQUIRED_COLUMNS.every((col) => headerRow.includes(col));
  if (hasFullExportColumns) return 'full-export';

  const hasTemplateColumns = TEMPLATE_REQUIRED_COLUMNS.every((col) => headerRow.includes(col));
  if (hasTemplateColumns) return 'template';

  return 'unknown';
}

function parseBooleanCell(value: string): boolean {
  const lower = value.trim().toLowerCase();
  return lower === 'true' || lower === '1' || lower === 'yes' || lower === 'x';
}

function parseJerseyNumber(value: string): number {
  const num = parseInt(value.trim(), 10);
  return Number.isFinite(num) ? num : 0;
}

function getPlayerNameFromRow(row: Record<string, string>, teamNameCol: string): { firstName: string; lastName: string } {
  let firstName = (row['FirstName'] ?? '').trim();
  let lastName = (row['LastName'] ?? '').trim();

  // If FirstName/LastName are empty but FullName is available, split it
  if (!firstName && !lastName) {
    const fullName = (row['FullName'] ?? '').trim();
    if (fullName) {
      const parts = fullName.split(/\s+/);
      firstName = parts[0] ?? '';
      lastName = parts.slice(1).join(' ');
    }
  }

  return { firstName, lastName };
}

export function parseRosterCsvImport(csvText: string): RosterImportPayload {
  const diagnostics: RosterImportDiagnostic[] = [];
  const teams: RosterImportTeam[] = [];

  const rawRows = parseCsvRows(csvText).filter((row) => row.some((cell) => cell.trim() !== ''));
  if (rawRows.length === 0) {
    diagnostics.push({ severity: 'error', code: 'empty_csv', message: 'CSV file is empty.' });
    return { teams, diagnostics };
  }

  const headerRow = rawRows[0];
  const variant = detectCsvVariant(headerRow);

  if (variant === 'unknown') {
    diagnostics.push({
      severity: 'error',
      code: 'invalid_csv_header',
      message: `CSV is missing required columns. Expected either [${FULL_EXPORT_REQUIRED_COLUMNS.join(', ')}] or [${TEMPLATE_REQUIRED_COLUMNS.join(', ')}].`,
    });
    return { teams, diagnostics };
  }

  const teamNameCol = variant === 'template' ? 'Team' : 'TeamName';
  const dataRows = rawRows.slice(1).map((row) => {
    const result: Record<string, string> = {};
    for (let i = 0; i < headerRow.length; i += 1) {
      result[headerRow[i] ?? `Col${i}`] = row[i] ?? '';
    }
    return result;
  });

  const teamMap = new Map<string, RosterImportPlayer[]>();

  for (const row of dataRows) {
    const teamName = (row[teamNameCol] ?? '').trim();
    if (!teamName) continue;

    const { firstName, lastName } = getPlayerNameFromRow(row, teamNameCol);
    const jerseyNumber = parseJerseyNumber(row['JerseyNumber'] ?? '');

    if (!firstName && !lastName) continue; // skip empty rows

    const player: RosterImportPlayer = {
      jerseyNumber,
      firstName,
      lastName,
      playerCode: (row['PlayerCode'] ?? '').trim() || undefined,
      role: (row['Role'] ?? '').trim() || undefined,
      isCaptain: parseBooleanCell(row['Captain'] ?? ''),
      isLibero: parseBooleanCell(row['Libero'] ?? ''),
    };

    if (!teamMap.has(teamName)) {
      teamMap.set(teamName, []);
    }
    teamMap.get(teamName)!.push(player);
  }

  for (const [teamName, players] of teamMap) {
    teams.push({ teamName, players });
  }

  if (teams.length === 0) {
    diagnostics.push({ severity: 'warning', code: 'no_teams', message: 'No teams found in CSV.' });
  }

  return { teams, diagnostics };
}

export function generateRosterCsvTemplate(): string {
  const header = ROSTER_CSV_TEMPLATE_COLUMNS.join(',');
  const exampleRow = [
    'My Team',
    '10',
    'Anna',
    'Rossi',
    'Anna Rossi',
    'setter',
    'false',
    'false',
    'ANR',
  ].join(',');
  return `${header}\r\n${exampleRow}\r\n`;
}
