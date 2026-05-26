import assert from 'node:assert';
import type { ArchivedTeamAggregate } from '@src/infrastructure/repositories/team-repository';
import { mapTeamRecordsToRosterExportPayload } from './mapping/roster-mapper';
import { serializeRosterExportToJson } from './exporters/roster-json-exporter';
import { serializeRosterExportToCsv } from './exporters/roster-csv-exporter';
import { validateRosterExport, validateRosterJson, validateRosterCsv } from './validation/roster-export-validation';
import { sanitizeFileName } from './utils/roster-file-utils';

const teamRecordA = {
  team: {
    id: 'team-a',
    teamCode: 'TEAM-A',
    name: 'Alpha Club',
    staff: { headCoach: 'Coach A', assistantCoach: 'Assistant A' },
    rosterIds: ['roster-a'],
    createdAt: 1680000000000,
    updatedAt: 1680000005000,
  },
  roster: {
    id: 'roster-a',
    teamId: 'team-a',
    players: [
      {
        id: 'player-a1',
        jerseyNumber: 2,
        firstName: 'Éva',
        lastName: 'García',
        playerCode: 'EGA',
        isCaptain: true,
        isLibero: false,
        role: 'setter',
        handedness: 'right',
        birthDate: '1995-01-01',
        notes: 'Key setter',
      },
      {
        id: 'player-a2',
        jerseyNumber: 1,
        firstName: 'Mia',
        lastName: 'Sun',
        playerCode: 'MSU',
        isCaptain: false,
        isLibero: true,
        role: 'libero',
      },
    ],
  },
} satisfies ArchivedTeamAggregate;

const teamRecordB = {
  team: {
    id: 'team-b',
    teamCode: 'TEAM-B',
    name: 'Beta Squad',
    staff: { headCoach: 'Coach B', assistantCoach: '' },
    rosterIds: ['roster-b'],
    createdAt: 1680000000001,
    updatedAt: 1680000005001,
  },
  roster: {
    id: 'roster-b',
    teamId: 'team-b',
    players: [
      {
        id: 'player-b1',
        jerseyNumber: 5,
        firstName: 'Luca',
        lastName: 'Neri',
        playerCode: 'LNE',
        isCaptain: false,
        isLibero: false,
      },
    ],
  },
} satisfies ArchivedTeamAggregate;

type TestDefinition = {
  name: string;
  test: () => void;
};

const tests: TestDefinition[] = [
  {
    name: 'exports a single team to JSON and validates it',
    test: () => {
      const payload = mapTeamRecordsToRosterExportPayload([teamRecordA]);
      const json = serializeRosterExportToJson(payload);

      assert(json.includes('"format": "ovs-roster"'));
      assert(json.includes('"teamName": "Alpha Club"'));
      assert(json.includes('"JerseyNumber": 1') === false, 'JSON output should preserve values but not CSV headers');

      const diagnostics = validateRosterJson(json);
      assert.strictEqual(diagnostics.length, 0);
    },
  },
  {
    name: 'exports a single team to CSV and validates it',
    test: () => {
      const payload = mapTeamRecordsToRosterExportPayload([teamRecordA]);
      const csv = serializeRosterExportToCsv(payload);

      assert(csv.startsWith('"TeamId","TeamName"'));
      assert(csv.includes('"Alpha Club"'));
      assert(csv.includes('"2","Éva","García"'));
      assert(csv.includes('"1","Mia","Sun"'));

      const diagnostics = validateRosterCsv(csv);
      assert.strictEqual(diagnostics.length, 0);
    },
  },
  {
    name: 'exports all teams and preserves stable ordering',
    test: () => {
      const payload = mapTeamRecordsToRosterExportPayload([teamRecordB, teamRecordA]);
      assert.strictEqual(payload.teams[0].teamName, 'Alpha Club');
      assert.strictEqual(payload.teams[1].teamName, 'Beta Squad');

      const csv = serializeRosterExportToCsv(payload);
      const firstRow = csv.split('\r\n')[1];
      assert(firstRow.includes('"Alpha Club"'));
    },
  },
  {
    name: 'preserves UTF-8 characters in export content',
    test: () => {
      const payload = mapTeamRecordsToRosterExportPayload([teamRecordA]);
      const json = serializeRosterExportToJson(payload);
      assert(json.includes('Éva'));
      assert(json.includes('García'));
    },
  },
  {
    name: 'reports missing field diagnostics for invalid payloads',
    test: () => {
      const invalidPayload = mapTeamRecordsToRosterExportPayload([teamRecordA]);
      invalidPayload.teams[0].players[0].firstName = '';
      invalidPayload.teams[0].players.push({
        ...invalidPayload.teams[0].players[0],
        playerId: 'player-a3',
        jerseyNumber: 2,
        firstName: 'Marco',
        lastName: 'Luca',
      });

      const diagnostics = validateRosterExport(invalidPayload);
      assert(diagnostics.some((item) => item.code === 'missing_player_name'));
      assert(diagnostics.some((item) => item.code === 'duplicate_jersey_number'));
    },
  },
  {
    name: 'sanitizes filenames for download',
    test: () => {
      assert.strictEqual(sanitizeFileName('Team Name 123'), 'Team-Name-123');
      assert.strictEqual(sanitizeFileName('Café / Squad'), 'Cafe-Squad');
      assert.strictEqual(sanitizeFileName(' "Illegal<>|*? '), 'Illegal');
    },
  },
];

let failed = false;

for (const { name, test } of tests) {
  try {
    test();
    console.log(`✔ ${name}`);
  } catch (error) {
    failed = true;
    console.error(`✖ ${name}`);
    console.error(error);
  }
}

if (failed) {
  process.exit(1);
}
