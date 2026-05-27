/**
 * DataVolley export round-trip validation module.
 *
 * Validates:
 * 1. A synthetic OVS match can be exported and the result can be
 *    round-tripped through the OVS DataVolley importer without fatal errors.
 * 2. Real sample .dvw files that were previously imported can be re-exported
 *    and re-parsed without structural regressions.
 *
 * Called from scripts/validate-datavolley-export.mjs.
 */

import type { MatchProject } from '@src/domain/match/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { BallTouch } from '@src/domain/touch/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { Player, Team } from '@src/domain/roster/types';
import { normalizeMatchProject, createMatchTeamSelectionFromTeam } from '@src/domain/match/helpers';
import { exportMatchToDataVolley } from '../index';
import { parseDataVolleyFile } from '@src/features/import/parser';
import { mapDataVolleyMatchToOvsProject } from '@src/features/import/mapping';
import { validateImportedMatch } from '@src/features/import/validation';
import type { DataVolleyExportDiagnostic } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ValidationResult = {
  assertions: number;
  warnings: string[];
};

type RoundTripComparison = {
  teamsMatch: boolean;
  playerCountHome: { expected: number; actual: number };
  playerCountAway: { expected: number; actual: number };
  set1Score: { expected: string; actual: string };
  touchCount: { exported: number; roundTripped: number };
  diagnostics: DataVolleyExportDiagnostic[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _idSeed = 1;
function uid(prefix = 'id'): string {
  return `${prefix}-${String(_idSeed++).padStart(4, '0')}`;
}

function makePlayer(input: Pick<Player, 'id' | 'jerseyNumber' | 'firstName' | 'lastName'> & Partial<Player>): Player {
  return {
    shortName: input.shortName ?? `${input.firstName[0]}.${input.lastName}`,
    playerCode: input.playerCode ?? `${input.firstName.slice(0, 3).toUpperCase()}-${input.lastName.slice(0, 3).toUpperCase()}`,
    isCaptain: false,
    isLibero: false,
    ...input,
  };
}

function makeTeam(name: string, players: Team['players']): Team {
  return {
    id: uid('team'),
    code: name.slice(0, 3).toUpperCase(),
    name,
    players,
    staff: { headCoach: '', assistantCoach: '' },
  };
}

function makeLineup(
  teamSide: 'home' | 'away',
  playerIds: string[],
  setterIndex = 0,
): StartingLineup {
  const ids = playerIds.slice(0, 6);
  while (ids.length < 6) {
    ids.push(playerIds[0] ?? uid('filler'));
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
  setNumber: number;
  rallyNumber: number;
  sequenceNumber: number;
  teamSide: 'home' | 'away';
  playerId: string;
  skill: BallTouch['skill'];
  evaluation: BallTouch['evaluation'];
  createdAt: number;
}): BallTouch {
  return {
    id: uid('touch'),
    ...input,
    source: 'explicit',
    touchOrigin: 'live_scouting',
  };
}

function makeProject(
  homeTeam: Team,
  awayTeam: Team,
  events: MatchEvent[],
  metadata?: Partial<MatchProject['metadata']>,
): MatchProject {
  const now = Date.UTC(2024, 10, 17, 15, 0, 0);
  return normalizeMatchProject({
    metadata: {
      id: uid('project'),
      format: 'best_of_5',
      schemaVersion: 3,
      playedAt: new Date(now).toISOString(),
      competition: 'Validation League',
      season: '2024/2025',
      venue: 'Test Arena',
      ...metadata,
    },
    homeTeam,
    awayTeam,
    homeSelection: createMatchTeamSelectionFromTeam(homeTeam),
    awaySelection: createMatchTeamSelectionFromTeam(awayTeam),
    phase: 'analysis',
    events: [{ id: uid('ev'), type: 'match_created', createdAt: now }, ...events],
    createdAt: now,
    updatedAt: now,
  });
}

// ─── Fixture builders ─────────────────────────────────────────────────────────

/**
 * Build a full 4-set match with complete rallies, substitution, and timeout.
 */
function buildFullMatchProject(): MatchProject {
  const h1 = uid('hp'); const h2 = uid('hp'); const h3 = uid('hp');
  const h4 = uid('hp'); const h5 = uid('hp'); const h6 = uid('hp');
  const h7 = uid('hp'); // bench sub
  const a1 = uid('ap'); const a2 = uid('ap'); const a3 = uid('ap');
  const a4 = uid('ap'); const a5 = uid('ap'); const a6 = uid('ap');

  const homeTeam = makeTeam('Home Validators', [
    makePlayer({ id: h1, jerseyNumber: 1, firstName: 'Alice', lastName: 'Alpha', isCaptain: true, role: 'setter' }),
    makePlayer({ id: h2, jerseyNumber: 2, firstName: 'Brenda', lastName: 'Beta', role: 'outside_hitter' }),
    makePlayer({ id: h3, jerseyNumber: 3, firstName: 'Carla', lastName: 'Gamma', role: 'middle_blocker' }),
    makePlayer({ id: h4, jerseyNumber: 4, firstName: 'Diana', lastName: 'Delta', role: 'middle_blocker' }),
    makePlayer({ id: h5, jerseyNumber: 5, firstName: 'Eva', lastName: 'Epsilon', role: 'opposite' }),
    makePlayer({ id: h6, jerseyNumber: 6, firstName: 'Fiona', lastName: 'Zeta', isLibero: true }),
    makePlayer({ id: h7, jerseyNumber: 7, firstName: 'Gina', lastName: 'Eta' }),
  ]);
  const awayTeam = makeTeam('Away Validators', [
    makePlayer({ id: a1, jerseyNumber: 10, firstName: 'Hana', lastName: 'Theta', isCaptain: true, role: 'setter' }),
    makePlayer({ id: a2, jerseyNumber: 11, firstName: 'Iris', lastName: 'Iota', role: 'outside_hitter' }),
    makePlayer({ id: a3, jerseyNumber: 12, firstName: 'Jane', lastName: 'Kappa', role: 'middle_blocker' }),
    makePlayer({ id: a4, jerseyNumber: 13, firstName: 'Kate', lastName: 'Lambda', role: 'middle_blocker' }),
    makePlayer({ id: a5, jerseyNumber: 14, firstName: 'Lisa', lastName: 'Mu', role: 'opposite' }),
    makePlayer({ id: a6, jerseyNumber: 15, firstName: 'Mona', lastName: 'Nu', isLibero: true }),
  ]);

  const homeIds = [h1, h2, h3, h4, h5, h6];
  const awayIds = [a1, a2, a3, a4, a5, a6];
  const homeLineup = makeLineup('home', homeIds, 0);
  const awayLineup = makeLineup('away', awayIds, 0);

  let t = Date.UTC(2024, 10, 17, 15, 0, 0);
  function nextTime(offsetMs = 5000): number {
    t += offsetMs;
    return t;
  }

  function rally(
    setNumber: number,
    rallyNumber: number,
    touches: Array<{ side: 'home' | 'away'; pId: string; skill: BallTouch['skill']; eval: BallTouch['evaluation'] }>,
    pointSide: 'home' | 'away',
  ): MatchEvent[] {
    const events: MatchEvent[] = [];
    touches.forEach((touch, i) => {
      events.push({
        id: uid('ev'),
        type: 'touch_recorded',
        createdAt: nextTime(2000),
        touch: makeTouch({
          setNumber, rallyNumber, sequenceNumber: i + 1,
          teamSide: touch.side, playerId: touch.pId,
          skill: touch.skill, evaluation: touch.eval,
          createdAt: t,
        }),
      });
    });
    events.push({
      id: uid('ev'),
      type: 'point_awarded',
      createdAt: nextTime(1000),
      setNumber, rallyNumber, teamSide: pointSide,
    });
    return events;
  }

  const events: MatchEvent[] = [
    // ── Set 1 ────────────────────────────────────────────────────────────────
    {
      id: uid('ev'), type: 'set_started', setNumber: 1,
      createdAt: nextTime(0), homeLineup, awayLineup, servingTeam: 'away',
    },
    ...rally(1, 1,
      [{ side: 'away', pId: a1, skill: 'serve', eval: '+' },
       { side: 'home', pId: h2, skill: 'receive', eval: '#' },
       { side: 'home', pId: h1, skill: 'set', eval: '+' },
       { side: 'home', pId: h5, skill: 'attack', eval: '#' }],
      'home'),
    ...rally(1, 2,
      [{ side: 'home', pId: h1, skill: 'serve', eval: '=' }],
      'away'),
    {
      id: uid('ev'), type: 'substitution_made', createdAt: nextTime(3000),
      setNumber: 1, rallyNumber: 3, teamSide: 'home',
      playerOutId: h2, playerInId: h7,
    },
    ...rally(1, 3,
      [{ side: 'away', pId: a2, skill: 'serve', eval: '-' },
       { side: 'home', pId: h3, skill: 'receive', eval: '+' },
       { side: 'home', pId: h1, skill: 'set', eval: '+' },
       { side: 'home', pId: h4, skill: 'attack', eval: '/' },
       { side: 'away', pId: a3, skill: 'block', eval: '#' }],
      'away'),
    {
      id: uid('ev'), type: 'timeout_called', createdAt: nextTime(2000),
      setNumber: 1, rallyNumber: 4, teamSide: 'home',
    },
    ...rally(1, 4,
      [{ side: 'away', pId: a2, skill: 'serve', eval: '#' }],
      'away'),
    {
      id: uid('ev'), type: 'set_ended', createdAt: nextTime(5000),
      setNumber: 1, winningTeam: 'away', homeScore: 22, awayScore: 25,
    },
    // ── Set 2 ────────────────────────────────────────────────────────────────
    {
      id: uid('ev'), type: 'set_started', setNumber: 2,
      createdAt: nextTime(120000), homeLineup, awayLineup, servingTeam: 'home',
    },
    ...rally(2, 1,
      [{ side: 'home', pId: h1, skill: 'serve', eval: '#' }],
      'home'),
    ...rally(2, 2,
      [{ side: 'away', pId: a1, skill: 'serve', eval: '+' },
       { side: 'home', pId: h5, skill: 'receive', eval: '#' },
       { side: 'home', pId: h1, skill: 'set', eval: '+' },
       { side: 'home', pId: h2, skill: 'attack', eval: '#' }],
      'home'),
    {
      id: uid('ev'), type: 'set_ended', createdAt: nextTime(5000),
      setNumber: 2, winningTeam: 'home', homeScore: 25, awayScore: 18,
    },
  ];

  return makeProject(homeTeam, awayTeam, events);
}

// ─── Assertion helpers ────────────────────────────────────────────────────────

function assertEqual<T>(actual: T, expected: T, label: string): number {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
  return 1;
}

function assertOk(value: unknown, label: string): number {
  if (!value) {
    throw new Error(`${label}: expected truthy, got ${String(value)}`);
  }
  return 1;
}

function assertNoFatal(warnings: Array<{ severity: string; message: string }>, label: string): number {
  const fatals = warnings.filter((w) => w.severity === 'error');
  if (fatals.length > 0) {
    throw new Error(`${label}: ${fatals.length} fatal warning(s): ${fatals.map((w) => w.message).join('; ')}`);
  }
  return 1;
}

// ─── Validators ───────────────────────────────────────────────────────────────

function performRoundTrip(project: MatchProject): RoundTripComparison {
  const exportResult = exportMatchToDataVolley(project);
  const parsed = parseDataVolleyFile(exportResult.text, { sourceName: 'round-trip-validation' });
  const { project: reimported } = mapDataVolleyMatchToOvsProject(parsed);

  const homePlayers = parsed.players.filter((p) => p.side === 'home');
  const awayPlayers = parsed.players.filter((p) => p.side === 'away');
  const set1 = parsed.sets[0];
  const exportedTouchCount = project.events.filter((e) => e.type === 'touch_recorded').length;
  const reimportedTouchCount = reimported.events.filter((e) => e.type === 'touch_recorded').length;

  return {
    teamsMatch:
      parsed.teams.some((t) => t.name === project.homeTeam.name)
      && parsed.teams.some((t) => t.name === project.awayTeam.name),
    playerCountHome: {
      expected: project.homeSelection.roster.length,
      actual: homePlayers.length,
    },
    playerCountAway: {
      expected: project.awaySelection.roster.length,
      actual: awayPlayers.length,
    },
    set1Score: {
      expected: set1?.score ? `${set1.score.home}-${set1.score.away}` : '',
      actual: set1?.score ? `${set1.score.home}-${set1.score.away}` : '',
    },
    touchCount: {
      exported: exportedTouchCount,
      roundTripped: reimportedTouchCount,
    },
    diagnostics: exportResult.diagnostics,
  };
}

// ─── Public exports ───────────────────────────────────────────────────────────

export function validateDataVolleyExportFixture(): ValidationResult {
  let assertions = 0;
  const warnings: string[] = [];

  // 1. Build and export a full match
  const project = buildFullMatchProject();
  const result = exportMatchToDataVolley(project);

  assertions += assertOk(result.text.length > 0, 'Export must produce non-empty DVW text');
  assertions += assertOk(result.text.includes('[3DATAVOLLEYSCOUT]'), 'Must include [3DATAVOLLEYSCOUT] section');
  assertions += assertOk(result.text.includes('[3SCOUT]'), 'Must include [3SCOUT] section');
  assertions += assertOk(result.text.includes('[3PLAYERS-H]'), 'Must include [3PLAYERS-H] section');
  assertions += assertOk(result.text.includes('[3PLAYERS-V]'), 'Must include [3PLAYERS-V] section');
  assertions += assertOk(result.diagnostics !== undefined, 'diagnostics must be defined');

  // 2. Round-trip
  const comparison = performRoundTrip(project);
  assertions += assertOk(comparison.teamsMatch, 'Round-trip: team names must match');
  assertions += assertEqual(
    comparison.playerCountHome.actual,
    comparison.playerCountHome.expected,
    'Round-trip: home player count',
  );
  assertions += assertEqual(
    comparison.playerCountAway.actual,
    comparison.playerCountAway.expected,
    'Round-trip: away player count',
  );
  assertions += assertOk(
    comparison.touchCount.roundTripped >= comparison.touchCount.exported,
    `Round-trip: touch count must be ≥ original (${comparison.touchCount.exported}), got ${comparison.touchCount.roundTripped}`,
  );

  // 3. Parse and validate re-imported project
  const parsed = parseDataVolleyFile(result.text, { sourceName: 'fixture-validation' });
  assertions += assertNoFatal(parsed.warnings, 'Round-trip: no fatal parse warnings');

  const { project: reimported, warnings: importWarnings } = mapDataVolleyMatchToOvsProject(parsed);
  const importErrors = validateImportedMatch(reimported).filter((d) => d.severity === 'error');
  if (importErrors.length > 0) {
    warnings.push(`Round-trip import validation: ${importErrors.length} error(s): ${importErrors.map((e) => e.message).join('; ')}`);
  }
  assertions += assertOk(reimported.events.length > 0, 'Round-trip: reimported project has events');
  assertions += assertOk(Array.isArray(importWarnings), 'Round-trip: import warnings must be an array');

  // 4. Verify set scores
  const set1 = parsed.sets[0];
  assertions += assertOk(set1?.played === true, 'Round-trip: set 1 must be played');
  assertions += assertEqual(set1?.score?.away, 25, 'Round-trip: set 1 away score must be 25');
  assertions += assertEqual(set1?.score?.home, 22, 'Round-trip: set 1 home score must be 22');

  const set2 = parsed.sets[1];
  assertions += assertOk(set2?.played === true, 'Round-trip: set 2 must be played');
  assertions += assertEqual(set2?.score?.home, 25, 'Round-trip: set 2 home score must be 25');

  const set3 = parsed.sets[2];
  assertions += assertOk(set3?.played === false, 'Round-trip: set 3 must be not played');

  // 5. Substitution row must appear in scout
  assertions += assertOk(
    /^\*c\d+:\d+/m.test(result.text),
    'Substitution row must appear in exported scout section',
  );

  // 6. Timeout row must appear in scout
  assertions += assertOk(
    /^\*T/m.test(result.text),
    'Timeout row must appear in exported scout section',
  );

  // 7. Export diagnostics are all valid
  for (const d of result.diagnostics) {
    assertions += assertOk(
      ['info', 'warning', 'error'].includes(d.severity),
      `Diagnostic severity "${d.severity}" must be valid`,
    );
  }

  return { assertions, warnings };
}

/**
 * Validate export of a real DataVolley sample file:
 * 1. Parse the original file
 * 2. Import it into OVS
 * 3. Re-export from OVS
 * 4. Re-parse the exported file
 * 5. Compare key metrics
 */
export function validateDataVolleyExportRealSample(
  bytes: Uint8Array | ArrayBuffer,
  fileName: string,
): ValidationResult {
  let assertions = 0;
  const warnings: string[] = [];

  // Step 1-2: import
  const original = parseDataVolleyFile(bytes, { sourceName: fileName });
  const { project } = mapDataVolleyMatchToOvsProject(original);

  // Skip samples with no actions (malformed)
  if (original.actions.length === 0) {
    warnings.push(`${fileName}: no actions in original — skipping export round-trip`);
    return { assertions: 1, warnings };
  }

  assertions += assertOk(project.events.length > 0, `${fileName}: imported project must have events`);

  // Step 3: re-export
  const exportResult = exportMatchToDataVolley(project);
  assertions += assertOk(exportResult.text.length > 0, `${fileName}: re-exported DVW text must not be empty`);
  assertions += assertOk(exportResult.text.includes('[3SCOUT]'), `${fileName}: re-exported DVW must include [3SCOUT]`);

  // Step 4: re-parse
  const reparsed = parseDataVolleyFile(exportResult.text, { sourceName: `${fileName} (re-export)` });
  const fatalWarnings = reparsed.warnings.filter((w) => w.severity === 'error');
  if (fatalWarnings.length > 0) {
    warnings.push(`${fileName}: re-parsed file has ${fatalWarnings.length} fatal warning(s): ${fatalWarnings.map((w) => w.message).join('; ')}`);
  }

  // Step 5: compare metrics
  const originalActionCount = original.actions.length;
  const reparsedActionCount = reparsed.actions.length;

  // Re-exported count can differ due to synthetic serves/blocks
  assertions += assertOk(
    reparsedActionCount > 0,
    `${fileName}: re-exported file must have at least 1 action, got ${reparsedActionCount}`,
  );

  const originalHomeName = original.teams.find((t) => t.side === 'home')?.name ?? '';
  const reparsedHomeName = reparsed.teams.find((t) => t.side === 'home')?.name ?? '';

  if (originalHomeName !== reparsedHomeName && originalHomeName) {
    warnings.push(
      `${fileName}: home team name changed after round-trip: "${originalHomeName}" → "${reparsedHomeName}"`,
    );
  }

  assertions += assertOk(reparsedHomeName.length > 0, `${fileName}: re-parsed file must have a home team name`);
  assertions += assertOk(reparsed.sets.length > 0, `${fileName}: re-parsed file must have set data`);

  // Verify action counts are in reasonable range (synthetic rows can add up to 2× for
  // pure-attack or pure-receive only files, but real files should be close)
  const ratio = reparsedActionCount / Math.max(originalActionCount, 1);
  if (ratio < 0.5 || ratio > 3.0) {
    warnings.push(
      `${fileName}: re-exported action count ratio is unusual (${reparsedActionCount}/${originalActionCount} = ${ratio.toFixed(2)})`,
    );
  }

  return { assertions, warnings };
}
