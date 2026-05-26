import type { RosterExportPayload } from '../types';

const CSV_HEADERS = [
  'TeamId',
  'TeamName',
  'TeamShortName',
  'Federation',
  'Club',
  'TeamCreatedAt',
  'TeamUpdatedAt',
  'Coach',
  'AssistantCoach',
  'Scout',
  'Statistician',
  'PlayerId',
  'PlayerCode',
  'JerseyNumber',
  'FirstName',
  'LastName',
  'DisplayName',
  'Role',
  'Captain',
  'Libero',
  'Handedness',
  'BirthDate',
  'Notes',
];

function quoteCsv(value: unknown): string {
  const text = value == null ? '' : String(value);
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

function buildRow(values: Array<unknown>): string {
  return values.map(quoteCsv).join(',');
}

export function serializeRosterExportToCsv(payload: RosterExportPayload): string {
  const rows = [buildRow(CSV_HEADERS)];

  payload.teams.forEach((team) => {
    const teamValues = [
      team.teamId,
      team.teamName,
      team.shortName ?? '',
      team.federation ?? '',
      team.club ?? '',
      team.createdAt ?? '',
      team.updatedAt ?? '',
      team.staff?.headCoach ?? '',
      team.staff?.assistantCoach ?? '',
      team.staff?.scout ?? '',
      team.staff?.statistician ?? '',
    ];

    if (team.players.length === 0) {
      rows.push(buildRow([...teamValues, '', '', '', '', '', '', '', '', '', '', '', '']));
      return;
    }

    team.players.forEach((player) => {
      rows.push(
        buildRow([
          ...teamValues,
          player.playerId,
          player.playerCode ?? '',
          player.jerseyNumber,
          player.firstName,
          player.lastName,
          player.displayName,
          player.role ?? '',
          player.isCaptain ? 'true' : 'false',
          player.isLibero ? 'true' : 'false',
          player.handedness ?? '',
          player.birthDate ?? '',
          player.notes ?? '',
        ]),
      );
    });
  });

  return rows.join('\r\n') + '\r\n';
}

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

export function parseRosterCsv(csvText: string): Array<Record<string, string>> {
  const rows = parseCsvRows(csvText);
  if (rows.length === 0) {
    return [];
  }

  const header = rows[0];
  return rows.slice(1).map((row, rowIndex) => {
    const result: Record<string, string> = {};
    for (let columnIndex = 0; columnIndex < header.length; columnIndex += 1) {
      result[header[columnIndex] ?? `Column${columnIndex}`] = row[columnIndex] ?? '';
    }

    if (row.length > header.length) {
      result.__extraRowData = row.slice(header.length).join(',');
    }

    return result;
  });
}

export function getRosterCsvHeaders(): readonly string[] {
  return CSV_HEADERS;
}
