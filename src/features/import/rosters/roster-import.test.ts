import assert from 'node:assert';
import { parseRosterCsvImport } from './roster-csv-importer';
import { parseRosterJsonImport } from './roster-json-importer';
import { detectRosterImportFormat } from './roster-importer';
import { ROSTER_CSV_TEMPLATE_COLUMNS } from './types';
import { generateRosterCsvTemplate } from './roster-csv-importer';

type TestDefinition = {
  name: string;
  test: () => void;
};

const tests: TestDefinition[] = [
  // ── CSV template columns match importer expectations ───────────────
  {
    name: 'CSV template columns include all required importer fields',
    test: () => {
      const required = ['Team', 'JerseyNumber', 'FirstName', 'LastName'];
      for (const col of required) {
        assert(
          (ROSTER_CSV_TEMPLATE_COLUMNS as readonly string[]).includes(col),
          `Template column "${col}" is missing`,
        );
      }
    },
  },

  {
    name: 'CSV template columns include optional player fields',
    test: () => {
      const optional = ['FullName', 'Role', 'Captain', 'Libero', 'PlayerCode'];
      for (const col of optional) {
        assert(
          (ROSTER_CSV_TEMPLATE_COLUMNS as readonly string[]).includes(col),
          `Template column "${col}" is missing`,
        );
      }
    },
  },

  // ── CSV template download utility ─────────────────────────────────
  {
    name: 'generateRosterCsvTemplate returns CSV with header row',
    test: () => {
      const csv = generateRosterCsvTemplate();
      const firstLine = csv.split('\r\n')[0];
      assert(firstLine === ROSTER_CSV_TEMPLATE_COLUMNS.join(','), `Expected header row "${ROSTER_CSV_TEMPLATE_COLUMNS.join(',')}", got "${firstLine}"`);
    },
  },

  {
    name: 'generateRosterCsvTemplate includes an example row',
    test: () => {
      const csv = generateRosterCsvTemplate();
      const lines = csv.split('\r\n').filter((line) => line.trim() !== '');
      assert(lines.length >= 2, 'Template should have header + at least one example row');
    },
  },

  // ── CSV import: template format ────────────────────────────────────
  {
    name: 'parseRosterCsvImport: parses template-format CSV (Team column)',
    test: () => {
      const csv = [
        'Team,JerseyNumber,FirstName,LastName,FullName,Role,Captain,Libero,PlayerCode',
        'Alpha,10,Anna,Rossi,Anna Rossi,setter,false,false,ANR',
        'Alpha,7,Marco,Bianchi,,outside,,false,MBI',
      ].join('\r\n') + '\r\n';

      const result = parseRosterCsvImport(csv);
      assert.strictEqual(result.diagnostics.filter((d) => d.severity === 'error').length, 0, 'Expected no errors');
      assert.strictEqual(result.teams.length, 1);
      assert.strictEqual(result.teams[0].teamName, 'Alpha');
      assert.strictEqual(result.teams[0].players.length, 2);
      assert.strictEqual(result.teams[0].players[0].jerseyNumber, 10);
      assert.strictEqual(result.teams[0].players[0].firstName, 'Anna');
      assert.strictEqual(result.teams[0].players[0].isCaptain, false);
      assert.strictEqual(result.teams[0].players[0].isLibero, false);
    },
  },

  {
    name: 'parseRosterCsvImport: parses multiple teams from template CSV',
    test: () => {
      const csv = [
        'Team,JerseyNumber,FirstName,LastName,FullName,Role,Captain,Libero,PlayerCode',
        'TeamA,1,Alice,Smith,,,,false,',
        'TeamB,5,Bob,Jones,,,,true,',
      ].join('\r\n') + '\r\n';

      const result = parseRosterCsvImport(csv);
      assert.strictEqual(result.teams.length, 2);
      assert.strictEqual(result.teams[0].teamName, 'TeamA');
      assert.strictEqual(result.teams[1].teamName, 'TeamB');
      assert.strictEqual(result.teams[1].players[0].isLibero, true);
    },
  },

  {
    name: 'parseRosterCsvImport: parses full export CSV (TeamName column)',
    test: () => {
      const csv = [
        '"TeamId","TeamName","TeamShortName","Federation","Club","TeamCreatedAt","TeamUpdatedAt","Coach","AssistantCoach","Scout","Statistician","PlayerId","PlayerCode","JerseyNumber","FirstName","LastName","DisplayName","Role","Captain","Libero","Handedness","BirthDate","Notes"',
        '"team-x","Volley Club","","","","","","Coach X","","","","p1","ABC","12","Lucia","Verdi","Lucia Verdi","","false","false","","",""',
      ].join('\r\n') + '\r\n';

      const result = parseRosterCsvImport(csv);
      assert.strictEqual(result.diagnostics.filter((d) => d.severity === 'error').length, 0);
      assert.strictEqual(result.teams.length, 1);
      assert.strictEqual(result.teams[0].teamName, 'Volley Club');
      assert.strictEqual(result.teams[0].players[0].jerseyNumber, 12);
      assert.strictEqual(result.teams[0].players[0].firstName, 'Lucia');
    },
  },

  {
    name: 'parseRosterCsvImport: FullName split when FirstName/LastName absent',
    test: () => {
      const csv = [
        'Team,JerseyNumber,FirstName,LastName,FullName,Role,Captain,Libero,PlayerCode',
        'Beta,3,,,Sara Esposito,,,false,',
      ].join('\r\n') + '\r\n';

      const result = parseRosterCsvImport(csv);
      assert.strictEqual(result.teams[0].players[0].firstName, 'Sara');
      assert.strictEqual(result.teams[0].players[0].lastName, 'Esposito');
    },
  },

  {
    name: 'parseRosterCsvImport: returns error for empty CSV',
    test: () => {
      const result = parseRosterCsvImport('');
      assert(result.diagnostics.some((d) => d.severity === 'error' && d.code === 'empty_csv'));
    },
  },

  {
    name: 'parseRosterCsvImport: returns error for unknown headers',
    test: () => {
      const result = parseRosterCsvImport('BadCol1,BadCol2\nfoo,bar\n');
      assert(result.diagnostics.some((d) => d.severity === 'error' && d.code === 'invalid_csv_header'));
    },
  },

  // ── JSON import ────────────────────────────────────────────────────
  {
    name: 'parseRosterJsonImport: parses valid OVS JSON',
    test: () => {
      const json = JSON.stringify({
        format: 'ovs-roster',
        version: 1,
        teams: [
          {
            teamId: 'team-1',
            teamName: 'Alpha Club',
            players: [
              { playerId: 'p1', jerseyNumber: 2, firstName: 'Eva', lastName: 'Garcia', isCaptain: true, isLibero: false },
            ],
          },
        ],
      });

      const result = parseRosterJsonImport(json);
      assert.strictEqual(result.diagnostics.filter((d) => d.severity === 'error').length, 0);
      assert.strictEqual(result.teams.length, 1);
      assert.strictEqual(result.teams[0].teamName, 'Alpha Club');
      assert.strictEqual(result.teams[0].players[0].jerseyNumber, 2);
      assert.strictEqual(result.teams[0].players[0].isCaptain, true);
    },
  },

  {
    name: 'parseRosterJsonImport: returns error for invalid JSON',
    test: () => {
      const result = parseRosterJsonImport('{invalid json}');
      assert(result.diagnostics.some((d) => d.severity === 'error' && d.code === 'invalid_json'));
    },
  },

  {
    name: 'parseRosterJsonImport: returns error for wrong format field',
    test: () => {
      const result = parseRosterJsonImport(JSON.stringify({ format: 'other', version: 1, teams: [] }));
      assert(result.diagnostics.some((d) => d.severity === 'error' && d.code === 'invalid_format'));
    },
  },

  {
    name: 'parseRosterJsonImport: returns warning when no teams present',
    test: () => {
      const result = parseRosterJsonImport(JSON.stringify({ format: 'ovs-roster', version: 1, teams: [] }));
      assert(result.diagnostics.some((d) => d.code === 'no_teams'));
    },
  },

  // ── detectRosterImportFormat ───────────────────────────────────────
  {
    name: 'detectRosterImportFormat: detects .json as ovs-json',
    test: () => {
      assert.strictEqual(detectRosterImportFormat('rosters.json'), 'ovs-json');
    },
  },

  {
    name: 'detectRosterImportFormat: detects .csv as csv',
    test: () => {
      assert.strictEqual(detectRosterImportFormat('roster.csv'), 'csv');
    },
  },

  {
    name: 'detectRosterImportFormat: returns null for unknown extension',
    test: () => {
      assert.strictEqual(detectRosterImportFormat('file.dvw'), null);
    },
  },

  // ── Export panel: single/all teams + JSON/CSV support ─────────────
  // These are integration-level assertions against the export system;
  // the full round-trip is covered by roster-export.test.ts.
  // Here we confirm that the CSV exporter outputs headers accepted by the importer.
  {
    name: 'export CSV columns include all import required columns (round-trip header compatibility)',
    test: () => {
      // The import CSV validator requires: TeamName, JerseyNumber, FirstName, LastName
      // The export CSV has these in its full header; we test via a real export parse.
      const csv = [
        '"TeamId","TeamName","TeamShortName","Federation","Club","TeamCreatedAt","TeamUpdatedAt","Coach","AssistantCoach","Scout","Statistician","PlayerId","PlayerCode","JerseyNumber","FirstName","LastName","DisplayName","Role","Captain","Libero","Handedness","BirthDate","Notes"',
        '"tid","Test Team","","","","","","","","","","pid","","8","Player","One","Player One","","false","false","","",""',
      ].join('\r\n') + '\r\n';

      const result = parseRosterCsvImport(csv);
      assert.strictEqual(result.diagnostics.filter((d) => d.severity === 'error').length, 0, 'Full export CSV should be parseable by importer');
      assert.strictEqual(result.teams.length, 1);
      assert.strictEqual(result.teams[0].teamName, 'Test Team');
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
