/**
 * DataVolley export tests.
 *
 * Runs under Node.js via ts-node/esm (same runner as roster-export.test.ts).
 */

import assert from 'node:assert';
import type { MatchProject } from '@src/domain/match/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { BallTouch } from '@src/domain/touch/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { Player, Team } from '@src/domain/roster/types';
// Value imports must use relative paths (ts-node/esm cannot resolve @src/ aliases at runtime)
// From src/features/export/datavolley/ → ../../../ reaches src/
import { normalizeMatchProject, createMatchTeamSelectionFromTeam } from '../../../domain/match/helpers';
import { exportMatchToDataVolley } from './index';
import { serializeDataVolleyModel } from './serializer/datavolley-serializer';
import { getDataVolleyExportFileName } from './utils/datavolley-file-utils';
import { extractOvsMatchForDataVolley } from './model/ovs-match-extractor';
import { sanitizeDataVolleyFileNamePart } from './utils/datavolley-file-utils';
import { parseDataVolleyFile } from '../../import/parser';

// ─── Helpers ────────────────────────────────────────────────────────────────

let idCounter = 1;
function nextId(prefix = 'id'): string {
  return `${prefix}-${String(idCounter++).padStart(4, '0')}`;
}

function makePlayer(overrides: Partial<Player> & Pick<Player, 'id' | 'jerseyNumber' | 'firstName' | 'lastName'>): Player {
  return {
    shortName: overrides.shortName ?? `${overrides.firstName[0]}.${overrides.lastName}`,
    playerCode: overrides.playerCode ?? `${overrides.firstName.slice(0, 3).toUpperCase()}-${overrides.lastName.slice(0, 3).toUpperCase()}`,
    isCaptain: false,
    isLibero: false,
    ...overrides,
  };
}

function makeTeam(input: { name: string; code?: string; players?: Player[]; headCoach?: string }): Team {
  return {
    id: nextId('team'),
    code: input.code ?? input.name.slice(0, 3).toUpperCase(),
    name: input.name,
    players: input.players ?? [],
    staff: { headCoach: input.headCoach ?? 'Coach', assistantCoach: '' },
  };
}

function makeLineup(teamSide: 'home' | 'away', playerIds: string[], setterIndex = 0): StartingLineup {
  const ids = playerIds.slice(0, 6);
  while (ids.length < 6) {
    ids.push(ids[0] ?? 'filler');
  }
  return {
    teamSide,
    setterPlayerId: ids[setterIndex],
    liberoPlayerIds: [],
    slots: ids.map((playerId, i) => ({
      courtPosition: (i + 1) as 1 | 2 | 3 | 4 | 5 | 6,
      playerId,
    })),
    displaySide: teamSide === 'home' ? 'left' : 'right',
  };
}

function makeTouch(input: {
  id?: string;
  setNumber: number;
  rallyNumber: number;
  sequenceNumber: number;
  teamSide: 'home' | 'away';
  playerId: string;
  skill: BallTouch['skill'];
  evaluation: BallTouch['evaluation'];
  createdAt?: number;
}): BallTouch {
  return {
    id: input.id ?? nextId('touch'),
    setNumber: input.setNumber,
    rallyNumber: input.rallyNumber,
    sequenceNumber: input.sequenceNumber,
    teamSide: input.teamSide,
    playerId: input.playerId,
    skill: input.skill,
    evaluation: input.evaluation,
    source: 'explicit',
    touchOrigin: 'live_scouting',
    createdAt: input.createdAt ?? 0,
  };
}

function makeProject(input: {
  metadata?: Partial<MatchProject['metadata']>;
  homeTeam: Team;
  awayTeam: Team;
  events: MatchEvent[];
}): MatchProject {
  const now = Date.now();
  return normalizeMatchProject({
    metadata: {
      id: nextId('project'),
      format: 'best_of_5',
      schemaVersion: 3,
      ...input.metadata,
    },
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    homeSelection: createMatchTeamSelectionFromTeam(input.homeTeam),
    awaySelection: createMatchTeamSelectionFromTeam(input.awayTeam),
    phase: 'analysis',
    events: [
      { id: nextId('ev'), type: 'match_created', createdAt: now },
      ...input.events,
    ],
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Build a minimal single-set project with real lineups and touches.
 */
function buildMinimalProject(): MatchProject {
  const homeId1 = nextId('hp');
  const homeId2 = nextId('hp');
  const awayId1 = nextId('ap');
  const awayId2 = nextId('ap');

  const homeTeam = makeTeam({
    name: 'Home Volley',
    players: [
      makePlayer({ id: homeId1, jerseyNumber: 1, firstName: 'Anna', lastName: 'Rossi', isCaptain: true, role: 'setter' }),
      makePlayer({ id: homeId2, jerseyNumber: 2, firstName: 'Maria', lastName: 'Bianchi', role: 'outside_hitter' }),
    ],
  });
  const awayTeam = makeTeam({
    name: 'Away Volley',
    players: [
      makePlayer({ id: awayId1, jerseyNumber: 3, firstName: 'Sara', lastName: 'Verdi', isCaptain: true, role: 'setter' }),
      makePlayer({ id: awayId2, jerseyNumber: 4, firstName: 'Lucia', lastName: 'Neri', role: 'outside_hitter' }),
    ],
  });

  const homeLineup = makeLineup('home', [homeId1, homeId2]);
  const awayLineup = makeLineup('away', [awayId1, awayId2]);

  const t0 = 1_700_000_000_000;

  const events: MatchEvent[] = [
    {
      id: nextId('ev'),
      type: 'set_started',
      setNumber: 1,
      createdAt: t0,
      homeLineup,
      awayLineup,
      servingTeam: 'away',
    },
    {
      id: nextId('ev'),
      type: 'touch_recorded',
      createdAt: t0 + 1000,
      touch: makeTouch({
        setNumber: 1, rallyNumber: 1, sequenceNumber: 1,
        teamSide: 'away', playerId: awayId1, skill: 'serve', evaluation: '+',
        createdAt: t0 + 1000,
      }),
    },
    {
      id: nextId('ev'),
      type: 'touch_recorded',
      createdAt: t0 + 2000,
      touch: makeTouch({
        setNumber: 1, rallyNumber: 1, sequenceNumber: 2,
        teamSide: 'home', playerId: homeId1, skill: 'receive', evaluation: '#',
        createdAt: t0 + 2000,
      }),
    },
    {
      id: nextId('ev'),
      type: 'touch_recorded',
      createdAt: t0 + 3000,
      touch: makeTouch({
        setNumber: 1, rallyNumber: 1, sequenceNumber: 3,
        teamSide: 'home', playerId: homeId2, skill: 'attack', evaluation: '#',
        createdAt: t0 + 3000,
      }),
    },
    {
      id: nextId('ev'),
      type: 'point_awarded',
      createdAt: t0 + 3500,
      setNumber: 1,
      rallyNumber: 1,
      teamSide: 'home',
    },
    {
      id: nextId('ev'),
      type: 'set_ended',
      createdAt: t0 + 60000,
      setNumber: 1,
      winningTeam: 'home',
      homeScore: 25,
      awayScore: 20,
    },
  ];

  return makeProject({ homeTeam, awayTeam, events });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${error instanceof Error ? error.message : String(error)}`);
    failed += 1;
  }
}

// ── File name generation ────────────────────────────────────────────────────

test('sanitizeDataVolleyFileNamePart handles ASCII names', () => {
  assert.strictEqual(sanitizeDataVolleyFileNamePart('Team A'), 'Team-A');
});

test('sanitizeDataVolleyFileNamePart normalizes accented characters', () => {
  const result = sanitizeDataVolleyFileNamePart('Élan Volley');
  assert.ok(!result.includes('É'), `Expected no accented É in "${result}"`);
  assert.ok(result.length > 0);
});

test('sanitizeDataVolleyFileNamePart removes semicolons', () => {
  const result = sanitizeDataVolleyFileNamePart('Team;A');
  assert.ok(!result.includes(';'));
});

test('getDataVolleyExportFileName includes team names and score', () => {
  const project = buildMinimalProject();
  const name = getDataVolleyExportFileName(project);
  assert.ok(name.endsWith('.dvw'), `Expected .dvw extension in "${name}"`);
  assert.ok(name.includes('1-0'), `Expected set score 1-0 in "${name}"`);
  assert.ok(name.includes('25-20'), `Expected set partial 25-20 in "${name}"`);
});

// ── Model extraction ────────────────────────────────────────────────────────

test('extractOvsMatchForDataVolley returns home + away teams', () => {
  const project = buildMinimalProject();
  const { model } = extractOvsMatchForDataVolley(project);
  assert.ok(model.teams.home.name.length > 0, 'Home team name must not be empty');
  assert.ok(model.teams.away.name.length > 0, 'Away team name must not be empty');
});

test('extractOvsMatchForDataVolley returns sets with played=true for completed sets', () => {
  const project = buildMinimalProject();
  const { model } = extractOvsMatchForDataVolley(project);
  assert.strictEqual(model.sets[0].played, true, 'Set 1 must be played');
  assert.strictEqual(model.sets[0].homeScore, 25, 'Set 1 home score must be 25');
  assert.strictEqual(model.sets[0].awayScore, 20, 'Set 1 away score must be 20');
  assert.strictEqual(model.sets[1].played, false, 'Set 2 must not be played');
});

test('extractOvsMatchForDataVolley returns home and away players', () => {
  const project = buildMinimalProject();
  const { model } = extractOvsMatchForDataVolley(project);
  assert.ok(model.players.home.length >= 1, 'Must have at least 1 home player');
  assert.ok(model.players.away.length >= 1, 'Must have at least 1 away player');
  assert.ok(typeof model.players.home[0].jerseyNumber === 'number', 'Player must have jersey number');
});

test('extractOvsMatchForDataVolley returns scout rows', () => {
  const project = buildMinimalProject();
  const { model } = extractOvsMatchForDataVolley(project);
  assert.ok(model.scoutRows.length > 0, 'Must have at least one scout row');
});

test('extractOvsMatchForDataVolley emits diagnostic for missing timestamp when createdAt is 0', () => {
  const homeId1 = nextId('hp');
  const awayId1 = nextId('ap');
  const homeTeam = makeTeam({ name: 'Tstest Home', players: [makePlayer({ id: homeId1, jerseyNumber: 1, firstName: 'A', lastName: 'B' })] });
  const awayTeam = makeTeam({ name: 'Tstest Away', players: [makePlayer({ id: awayId1, jerseyNumber: 2, firstName: 'C', lastName: 'D' })] });

  const noTsProject = makeProject({
    homeTeam,
    awayTeam,
    events: [
      {
        id: nextId('ev'),
        type: 'set_started',
        setNumber: 1,
        createdAt: 0,
        homeLineup: makeLineup('home', [homeId1]),
        awayLineup: makeLineup('away', [awayId1]),
        servingTeam: 'away',
      },
      {
        id: nextId('ev'),
        type: 'touch_recorded',
        createdAt: 0,
        touch: makeTouch({
          setNumber: 1, rallyNumber: 1, sequenceNumber: 1,
          teamSide: 'away', playerId: awayId1, skill: 'serve', evaluation: '+',
          createdAt: 0,
        }),
      },
      {
        id: nextId('ev'),
        type: 'point_awarded',
        createdAt: 0,
        setNumber: 1,
        rallyNumber: 1,
        teamSide: 'away',
      },
      {
        id: nextId('ev'),
        type: 'set_ended',
        createdAt: 0,
        setNumber: 1,
        winningTeam: 'away',
        homeScore: 0,
        awayScore: 25,
      },
    ],
  });
  const { diagnostics } = extractOvsMatchForDataVolley(noTsProject);
  const tsDiagnostics = diagnostics.filter((d) => d.code === 'missing_timestamp');
  assert.ok(tsDiagnostics.length > 0, 'Must emit missing_timestamp diagnostic for ts=0 touches');
});

// ── Serializer ───────────────────────────────────────────────────────────────

test('serializeDataVolleyModel produces a non-empty string', () => {
  const project = buildMinimalProject();
  const { model } = extractOvsMatchForDataVolley(project);
  const text = serializeDataVolleyModel(model);
  assert.ok(text.length > 0, 'DVW text must not be empty');
});

test('serializeDataVolleyModel includes all mandatory sections', () => {
  const project = buildMinimalProject();
  const { model } = extractOvsMatchForDataVolley(project);
  const text = serializeDataVolleyModel(model);

  const requiredSections = [
    '[3DATAVOLLEYSCOUT]',
    '[3MATCH]',
    '[3TEAMS]',
    '[3SET]',
    '[3PLAYERS-H]',
    '[3PLAYERS-V]',
    '[3SCOUT]',
  ];
  for (const section of requiredSections) {
    assert.ok(text.includes(section), `DVW text must include section ${section}`);
  }
});

test('serializeDataVolleyModel scout rows contain action codes for serve and attack', () => {
  const project = buildMinimalProject();
  const { model } = extractOvsMatchForDataVolley(project);
  const text = serializeDataVolleyModel(model);

  const scoutStart = text.indexOf('[3SCOUT]');
  assert.ok(scoutStart >= 0, 'Must have [3SCOUT] section');
  const scoutText = text.slice(scoutStart);

  // Serve row: starts with 'a' (away) + jersey + 'S'
  assert.ok(/^a\d+S/m.test(scoutText), 'Must have an away serve row');
  // Attack row: home attack
  assert.ok(/^\*\d+A/m.test(scoutText), 'Must have a home attack row');
});

test('serializeDataVolleyModel includes point rows', () => {
  const project = buildMinimalProject();
  const { model } = extractOvsMatchForDataVolley(project);
  const text = serializeDataVolleyModel(model);

  const scoutStart = text.indexOf('[3SCOUT]');
  const scoutText = text.slice(scoutStart);
  // Point row: *p or ap followed by score
  assert.ok(/^\*p\d+:\d+/m.test(scoutText) || /^ap\d+:\d+/m.test(scoutText), 'Must have point rows');
});

test('serializeDataVolleyModel scout row has correct column count', () => {
  const project = buildMinimalProject();
  const { model } = extractOvsMatchForDataVolley(project);
  const text = serializeDataVolleyModel(model);

  // Extract a touch row (starts with *nn or aNN and has a skill code)
  const lines = text.split(/\r?\n/).filter((line) => /^[*a]\d+[SREADBF]/i.test(line));
  assert.ok(lines.length > 0, 'Must have touch scout rows');

  const firstLine = lines[0];
  const fields = firstLine.split(';');
  // 26 data columns + trailing empty from trailing semicolon = 27 tokens minimum
  assert.ok(fields.length >= 26, `Scout row must have at least 26 fields, got ${fields.length}: "${firstLine}"`);

  // field[8] must be a set number (non-empty)
  assert.ok(fields[8] !== '' && !Number.isNaN(Number(fields[8])), `fields[8] must be setNumber, got "${fields[8]}"`);
  // field[7] must be a time HH.MM.SS
  assert.ok(/^\d{2}\.\d{2}\.\d{2}$/.test(fields[7]), `fields[7] must be time HH.MM.SS, got "${fields[7]}"`);
});

// ── Composed-code semantics ───────────────────────────────────────────────────

test('receive without prior serve generates a synthetic serve row (when serve is missing)', () => {
  const homeId = nextId('hp');
  const awayId = nextId('ap');
  const homeTeam = makeTeam({ name: 'SynthServe Home', players: [makePlayer({ id: homeId, jerseyNumber: 1, firstName: 'A', lastName: 'B' })] });
  const awayTeam = makeTeam({ name: 'SynthServe Away', players: [makePlayer({ id: awayId, jerseyNumber: 2, firstName: 'C', lastName: 'D' })] });
  const t0 = 1_700_050_000_000;

  // Only a receive — no serve before it — should trigger synthetic serve insertion
  const events: MatchEvent[] = [
    {
      id: nextId('ev'),
      type: 'set_started', setNumber: 1, createdAt: t0,
      homeLineup: makeLineup('home', [homeId]),
      awayLineup: makeLineup('away', [awayId]),
      servingTeam: 'away',
    },
    {
      id: nextId('ev'),
      type: 'touch_recorded', createdAt: t0 + 1000,
      touch: makeTouch({ setNumber: 1, rallyNumber: 1, sequenceNumber: 1, teamSide: 'home', playerId: homeId, skill: 'receive', evaluation: '#', createdAt: t0 + 1000 }),
    },
    { id: nextId('ev'), type: 'point_awarded', createdAt: t0 + 2000, setNumber: 1, rallyNumber: 1, teamSide: 'home' },
    { id: nextId('ev'), type: 'set_ended', createdAt: t0 + 60000, setNumber: 1, winningTeam: 'home', homeScore: 25, awayScore: 0 },
  ];
  const project = makeProject({ homeTeam, awayTeam, events });
  const { model } = extractOvsMatchForDataVolley(project);
  const text = serializeDataVolleyModel(model);

  const scoutStart = text.indexOf('[3SCOUT]');
  const scoutText = text.slice(scoutStart);
  // Synthetic serve from away team should appear before the receive.
  // Synthetic rows use '$$' for unknown player, so match [\d$]+ instead of \d+.
  const scoutLines = scoutText.split(/\r?\n/).filter((l) => /^[*a][\d$]+[SREADBF]/i.test(l));
  assert.ok(scoutLines.length >= 2, `Must have at least 2 action rows (synthetic serve + receive), got ${scoutLines.length}`);
  const serveRows = scoutLines.filter((l) => /^[*a][\d$]+S/i.test(l));
  assert.ok(serveRows.length >= 1, 'Must have at least 1 serve row (synthetic from receive)');
});

test('attack=/ generates a synthetic block=# on the opposing team', () => {
  const homeId = nextId('hp');
  const awayId = nextId('ap');
  const homeTeam = makeTeam({ name: 'Blocky Home', players: [makePlayer({ id: homeId, jerseyNumber: 7, firstName: 'A', lastName: 'B' })] });
  const awayTeam = makeTeam({ name: 'Blocky Away', players: [makePlayer({ id: awayId, jerseyNumber: 8, firstName: 'C', lastName: 'D' })] });
  const t0 = 1_700_100_000_000;

  const events: MatchEvent[] = [
    {
      id: nextId('ev'), type: 'set_started', setNumber: 1, createdAt: t0,
      homeLineup: makeLineup('home', [homeId]),
      awayLineup: makeLineup('away', [awayId]),
      servingTeam: 'home',
    },
    {
      id: nextId('ev'), type: 'touch_recorded', createdAt: t0 + 1000,
      touch: makeTouch({ setNumber: 1, rallyNumber: 1, sequenceNumber: 1, teamSide: 'home', playerId: homeId, skill: 'serve', evaluation: '+', createdAt: t0 + 1000 }),
    },
    {
      id: nextId('ev'), type: 'touch_recorded', createdAt: t0 + 2000,
      // attack '/' should generate synthetic block '#' on away
      touch: makeTouch({ setNumber: 1, rallyNumber: 1, sequenceNumber: 2, teamSide: 'home', playerId: homeId, skill: 'attack', evaluation: '/', createdAt: t0 + 2000 }),
    },
    { id: nextId('ev'), type: 'point_awarded', createdAt: t0 + 2500, setNumber: 1, rallyNumber: 1, teamSide: 'away' },
    { id: nextId('ev'), type: 'set_ended', createdAt: t0 + 30000, setNumber: 1, winningTeam: 'away', homeScore: 0, awayScore: 25 },
  ];

  const project = makeProject({ homeTeam, awayTeam, events });
  const { model } = extractOvsMatchForDataVolley(project);
  const text = serializeDataVolleyModel(model);

  const scoutStart = text.indexOf('[3SCOUT]');
  const scoutText = text.slice(scoutStart);
  // Synthetic block uses '$$' for unknown player; match [\d$]+ to handle both
  const blockRows = scoutText.split(/\r?\n/).filter((line) => /^a[\d$]+B/i.test(line));
  assert.ok(blockRows.length >= 1, 'Must have at least 1 away block row (synthetic from home attack/)');
  // The synthetic block row should contain '#' evaluation
  assert.ok(blockRows.some((r) => r.includes('#')), 'Synthetic block from attack/ must have # evaluation');
});

// ── Set rows ─────────────────────────────────────────────────────────────────

test('exported SET section has False for unplayed sets', () => {
  const project = buildMinimalProject();
  const { model } = extractOvsMatchForDataVolley(project);
  const text = serializeDataVolleyModel(model);

  const setStart = text.indexOf('[3SET]');
  const afterSet = text.slice(setStart);
  const nextSection = afterSet.indexOf('[3PLAYERS-H]');
  const setSection = afterSet.slice(0, nextSection);

  const setLines = setSection.split(/\r?\n/).filter((l) => /^True|^False/.test(l));
  assert.ok(setLines.length >= 5, `Expected 5 SET lines, got ${setLines.length}`);

  assert.ok(setLines[0].startsWith('True'), 'Set 1 row must start with True');
  for (let i = 1; i < 5; i++) {
    assert.ok(setLines[i].startsWith('False'), `Set ${i + 1} row must start with False`);
  }
});

test('exported SET section includes score for played set', () => {
  const project = buildMinimalProject();
  const { model } = extractOvsMatchForDataVolley(project);
  const text = serializeDataVolleyModel(model);
  assert.ok(text.includes('25-20'), 'DVW text must include set score 25-20');
});

// ── Player rows ───────────────────────────────────────────────────────────────

test('exported PLAYERS-H includes jersey numbers', () => {
  const project = buildMinimalProject();
  const { model } = extractOvsMatchForDataVolley(project);
  const text = serializeDataVolleyModel(model);

  const phStart = text.indexOf('[3PLAYERS-H]');
  const phEnd = text.indexOf('[3PLAYERS-V]');
  const homeSection = text.slice(phStart, phEnd);
  assert.ok(homeSection.includes(';1;'), 'Home player with jersey 1 must be in [3PLAYERS-H]');
  assert.ok(homeSection.includes(';2;'), 'Home player with jersey 2 must be in [3PLAYERS-H]');
});

test('exported PLAYERS-V includes away jerseys', () => {
  const project = buildMinimalProject();
  const { model } = extractOvsMatchForDataVolley(project);
  const text = serializeDataVolleyModel(model);

  const pvStart = text.indexOf('[3PLAYERS-V]');
  const nextAfterPv = text.indexOf('[3ATTACKCOMBINATION]');
  const awaySection = text.slice(pvStart, nextAfterPv);
  assert.ok(awaySection.includes(';3;'), 'Away player with jersey 3 must be in [3PLAYERS-V]');
  assert.ok(awaySection.includes(';4;'), 'Away player with jersey 4 must be in [3PLAYERS-V]');
});

// ── Substitutions ─────────────────────────────────────────────────────────────

test('substitution_made event generates a substitution row in scout', () => {
  const homeId1 = nextId('hp');
  const homeId2 = nextId('hp');
  const awayId1 = nextId('ap');
  const homeTeam = makeTeam({
    name: 'Sub Home',
    players: [
      makePlayer({ id: homeId1, jerseyNumber: 10, firstName: 'A', lastName: 'B' }),
      makePlayer({ id: homeId2, jerseyNumber: 11, firstName: 'C', lastName: 'D' }),
    ],
  });
  const awayTeam = makeTeam({
    name: 'Sub Away',
    players: [makePlayer({ id: awayId1, jerseyNumber: 5, firstName: 'E', lastName: 'F', isCaptain: true })],
  });

  const t0 = 1_700_200_000_000;
  const events: MatchEvent[] = [
    {
      id: nextId('ev'), type: 'set_started', setNumber: 1, createdAt: t0,
      homeLineup: makeLineup('home', [homeId1, homeId2]),
      awayLineup: makeLineup('away', [awayId1]),
      servingTeam: 'away',
    },
    {
      id: nextId('ev'), type: 'substitution_made', createdAt: t0 + 5000,
      setNumber: 1, rallyNumber: 1, teamSide: 'home',
      playerOutId: homeId1, playerInId: homeId2,
    },
    { id: nextId('ev'), type: 'set_ended', createdAt: t0 + 60000, setNumber: 1, winningTeam: 'away', homeScore: 0, awayScore: 25 },
  ];

  const project = makeProject({ homeTeam, awayTeam, events });
  const { model } = extractOvsMatchForDataVolley(project);
  const text = serializeDataVolleyModel(model);

  const scoutStart = text.indexOf('[3SCOUT]');
  const scoutText = text.slice(scoutStart);
  // Substitution row: *c10:11
  assert.ok(/^\*c10:11/m.test(scoutText), 'Must have home substitution row *c10:11');
});

// ── Round-trip ───────────────────────────────────────────────────────────────

test('round-trip: exported file parses without fatal errors', () => {
  const project = buildMinimalProject();
  const result = exportMatchToDataVolley(project);
  const parsed = parseDataVolleyFile(result.text, { sourceName: 'round-trip-test' });

  const fatalWarnings = parsed.warnings.filter((w) => w.severity === 'error');
  assert.ok(fatalWarnings.length === 0,
    `Parsed file must have no error-level warnings, got: ${JSON.stringify(fatalWarnings)}`);
});

test('round-trip: exported file preserves team names', () => {
  const project = buildMinimalProject();
  const result = exportMatchToDataVolley(project);
  const parsed = parseDataVolleyFile(result.text);

  const homeTeamName = project.homeTeam.name;
  const awayTeamName = project.awayTeam.name;
  assert.ok(
    parsed.teams.some((t) => t.name === homeTeamName),
    `Parsed teams must include home team "${homeTeamName}"; got ${JSON.stringify(parsed.teams.map((t) => t.name))}`,
  );
  assert.ok(
    parsed.teams.some((t) => t.name === awayTeamName),
    `Parsed teams must include away team "${awayTeamName}"`,
  );
});

test('round-trip: exported file preserves player count', () => {
  const project = buildMinimalProject();
  const result = exportMatchToDataVolley(project);
  const parsed = parseDataVolleyFile(result.text);

  const homePlayers = parsed.players.filter((p) => p.side === 'home');
  const awayPlayers = parsed.players.filter((p) => p.side === 'away');
  assert.strictEqual(homePlayers.length, project.homeSelection.roster.length,
    `Round-trip home player count: expected ${project.homeSelection.roster.length}, got ${homePlayers.length}`);
  assert.strictEqual(awayPlayers.length, project.awaySelection.roster.length,
    `Round-trip away player count: expected ${project.awaySelection.roster.length}, got ${awayPlayers.length}`);
});

test('round-trip: exported file has correct set score', () => {
  const project = buildMinimalProject();
  const result = exportMatchToDataVolley(project);
  const parsed = parseDataVolleyFile(result.text);

  const set1 = parsed.sets[0];
  assert.ok(set1?.played === true, 'Round-trip set 1 must be played=true');
  assert.strictEqual(set1?.score?.home, 25, 'Round-trip set 1 home score must be 25');
  assert.strictEqual(set1?.score?.away, 20, 'Round-trip set 1 away score must be 20');
});

test('round-trip: exported file has scout actions', () => {
  const project = buildMinimalProject();
  const result = exportMatchToDataVolley(project);
  const parsed = parseDataVolleyFile(result.text);

  assert.ok(parsed.actions.length > 0,
    `Round-trip must yield at least 1 parsed action, got ${parsed.actions.length}`);
});

test('round-trip: touch count is preserved (≥ original touches)', () => {
  const project = buildMinimalProject();
  const originalTouchCount = project.events.filter((e) => e.type === 'touch_recorded').length;
  const result = exportMatchToDataVolley(project);
  const parsed = parseDataVolleyFile(result.text);

  // Round-trip count may be higher due to synthetic serves/blocks
  assert.ok(parsed.actions.length >= originalTouchCount,
    `Round-trip action count (${parsed.actions.length}) must be ≥ original touch count (${originalTouchCount})`);
});

// ── Filename generation ───────────────────────────────────────────────────────

test('export filename includes both team names', () => {
  const project = buildMinimalProject();
  const result = exportMatchToDataVolley(project);
  assert.ok(result.fileName.includes('Home-Volley'), `fileName must include "Home-Volley": "${result.fileName}"`);
  assert.ok(result.fileName.includes('Away-Volley'), `fileName must include "Away-Volley": "${result.fileName}"`);
});

test('export filename sanitizes special characters', () => {
  const homeTeam = makeTeam({ name: 'Équipe "A"/B&C' });
  const awayTeam = makeTeam({ name: 'Team B' });
  const project = makeProject({ homeTeam, awayTeam, events: [] });
  const name = getDataVolleyExportFileName(project);
  assert.ok(!name.includes('"'), 'Filename must not contain double-quotes');
  assert.ok(!name.includes('/'), 'Filename must not contain forward-slash');
  assert.ok(!name.includes('&'), 'Filename must not contain ampersand');
  assert.ok(name.endsWith('.dvw'), 'Filename must end with .dvw');
});

// ── Diagnostics ───────────────────────────────────────────────────────────────

test('export returns diagnostics array (possibly empty)', () => {
  const project = buildMinimalProject();
  const result = exportMatchToDataVolley(project);
  assert.ok(Array.isArray(result.diagnostics), 'diagnostics must be an array');
  for (const d of result.diagnostics) {
    assert.ok(['info', 'warning', 'error'].includes(d.severity), `Diagnostic severity must be valid: "${d.severity}"`);
    assert.ok(typeof d.code === 'string', 'Diagnostic code must be a string');
    assert.ok(typeof d.message === 'string', 'Diagnostic message must be a string');
  }
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\ndatavolley export tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
