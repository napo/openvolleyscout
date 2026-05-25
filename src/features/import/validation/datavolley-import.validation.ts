import { buildMatchStats, validateTeamTotals } from '@src/features/scouting/model/match-stats';
import { getLiveMatchReplayStatus } from '@src/features/scouting/model/replay';
import {
  mapDataVolleyMatchToOvsProject,
  parseDataVolleyFile,
  validateImportedMatch,
  validateImportedStats,
} from '..';

type ValidationResult = {
  assertions: number;
};

function expectEqual<T>(actual: T, expected: T, label: string): number {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }

  return 1;
}

function expectOk(value: unknown, label: string): number {
  if (!value) {
    throw new Error(`${label}: expected truthy value`);
  }

  return 1;
}

function createPlayerRow(input: {
  jersey: number;
  firstName: string;
  lastName: string;
  roleCode?: number;
  specialRole?: string;
  set1Position?: number | '*';
}): string {
  const fields = Array.from({ length: 14 }, () => '');
  fields[1] = String(input.jersey).padStart(2, '0');
  fields[3] = input.set1Position ? String(input.set1Position) : '';
  fields[8] = `P${String(input.jersey).padStart(2, '0')}`;
  fields[9] = input.lastName;
  fields[10] = input.firstName;
  fields[12] = input.specialRole ?? '';
  fields[13] = input.roleCode ? String(input.roleCode) : '';
  return fields.join(';');
}

function createPlayerRows(prefix: string): string {
  return [
    createPlayerRow({ jersey: 1, firstName: prefix, lastName: 'Setter', roleCode: 5, set1Position: 1 }),
    createPlayerRow({ jersey: 2, firstName: prefix, lastName: 'Outside', roleCode: 2, set1Position: 2 }),
    createPlayerRow({ jersey: 3, firstName: prefix, lastName: 'Opposite', roleCode: 3, set1Position: 3 }),
    createPlayerRow({ jersey: 4, firstName: prefix, lastName: 'Middle', roleCode: 4, set1Position: 4 }),
    createPlayerRow({ jersey: 5, firstName: prefix, lastName: 'Captain', roleCode: 2, specialRole: 'C', set1Position: 5 }),
    createPlayerRow({ jersey: 6, firstName: prefix, lastName: 'Libero', roleCode: 1, specialRole: 'L', set1Position: 6 }),
    createPlayerRow({ jersey: 7, firstName: prefix, lastName: 'Bench', roleCode: 2 }),
  ].join('\n');
}

function createScoutRow(code: string, setNumber = 1, home = [1, 2, 3, 4, 5, 6], away = [1, 2, 3, 4, 5, 6]): string {
  const fields = Array.from({ length: 26 }, () => '');
  fields[0] = code;
  fields[7] = '00:00';
  fields[8] = String(setNumber);
  fields[9] = '1';
  fields[10] = '1';
  home.forEach((number, index) => {
    fields[14 + index] = String(number);
  });
  away.forEach((number, index) => {
    fields[20 + index] = String(number);
  });
  return fields.join(';');
}

function createDataVolleyFile(input: {
  setScore?: string;
  scoutRows: string[];
  secondSetRows?: string[];
  malformedLine?: string;
}): string {
  return [
    '[3DATAVOLLEYSCOUT]',
    '[3MATCH]',
    '01/01/2026;18:00;2026;Validation League;Round 1;;;M1;;indoor;',
    '[3TEAMS]',
    'H01;Home Test;1;Home Coach;Home Assistant',
    'A01;Away Test;0;Away Coach;Away Assistant',
    '[3SET]',
    `True;;;;${input.setScore ?? '2-0'};4`,
    input.secondSetRows ? 'True;;;;1-0;2' : 'False;;;;;',
    'False;;;;;',
    'False;;;;;',
    'False;;;;;',
    '[3PLAYERS-H]',
    createPlayerRows('Home'),
    '[3PLAYERS-V]',
    createPlayerRows('Away'),
    '[3SCOUT]',
    ...input.scoutRows,
    ...(input.malformedLine ? [input.malformedLine] : []),
    ...(input.secondSetRows ?? []),
  ].join('\n');
}

function getTouchEvents(project: ReturnType<typeof mapDataVolleyMatchToOvsProject>['project']) {
  return project.events.filter((event) => event.type === 'touch_recorded');
}

function getImportErrors(project: ReturnType<typeof mapDataVolleyMatchToOvsProject>['project']) {
  return [
    ...validateImportedMatch(project),
    ...validateImportedStats(project),
  ].filter((diagnostic) => diagnostic.severity === 'error');
}

export function validateDataVolleyImportFixture(): ValidationResult {
  let assertions = 0;

  const minimal = parseDataVolleyFile(createDataVolleyFile({
    scoutRows: [
      createScoutRow('*01SQ#~~~~~~~~~'),
      createScoutRow('a01RM+~~~~~~~~~'),
      createScoutRow('*01EH+K1~~~~~~~'),
      createScoutRow('*02AH#X5~~~~~~~'),
      createScoutRow('*p01:00'),
      createScoutRow('*05SQ#~~~~~~~~~'),
      createScoutRow('*p02:00'),
      createScoutRow('**1set'),
    ],
  }), { sourceName: 'minimal.dvw' });
  assertions += expectEqual(minimal.teams.length, 2, 'minimal teams parsed');
  assertions += expectEqual(minimal.players.length, 14, 'minimal players parsed');
  assertions += expectEqual(minimal.actions.length, 5, 'minimal actions parsed');

  const minimalProject = mapDataVolleyMatchToOvsProject(minimal, {
    importId: 'validation-minimal',
    createdAt: 1_000,
  }).project;
  const minimalErrors = getImportErrors(minimalProject);
  assertions += expectEqual(getLiveMatchReplayStatus(minimalProject.metadata.id, minimalProject.events).canReplay, true, 'minimal replayable');
  assertions += expectEqual(minimalErrors.length, 0, `minimal validation errors: ${minimalErrors.map((error) => error.message).join(' | ')}`);
  const minimalStats = buildMatchStats({
    homeTeam: minimalProject.homeTeam,
    awayTeam: minimalProject.awayTeam,
    eventLog: minimalProject.events,
  });
  assertions += expectOk(minimalStats.totalTouches > 0, 'minimal stats generated');
  assertions += expectEqual(validateTeamTotals(minimalStats).length, 0, 'minimal team totals consistent');

  const malformed = parseDataVolleyFile(createDataVolleyFile({
    scoutRows: [
      createScoutRow('*01SQ#~~~~~~~~~'),
      createScoutRow('*p01:00'),
      createScoutRow('**1set'),
    ],
    setScore: '1-0',
    malformedLine: createScoutRow('*99Z!unknown'),
  }), { sourceName: 'malformed.dvw' });
  assertions += expectOk(malformed.warnings.some((warning) => warning.message.includes('Unsupported')), 'malformed warning emitted');

  const composedReceive = parseDataVolleyFile(createDataVolleyFile({
    scoutRows: [
      createScoutRow('a02RM=~~~~~~~~~'),
      createScoutRow('*p01:00'),
      createScoutRow('**1set'),
    ],
    setScore: '1-0',
  }), { sourceName: 'composed-receive.dvw' });
  const receiveProject = mapDataVolleyMatchToOvsProject(composedReceive, {
    importId: 'validation-composed-receive',
    createdAt: 2_000,
  }).project;
  const receiveTouches = getTouchEvents(receiveProject).map((event) => event.touch);
  assertions += expectEqual(receiveTouches.length, 2, 'receive composed touch count');
  assertions += expectEqual(receiveTouches[0].skill, 'serve', 'receive composed inferred serve skill');
  assertions += expectEqual(receiveTouches[0].evaluation, '#', 'receive composed inferred serve evaluation');
  assertions += expectEqual(receiveTouches[0].source, 'inferred', 'receive composed inferred source');

  const composedAttack = parseDataVolleyFile(createDataVolleyFile({
    scoutRows: [
      createScoutRow('*03AH/~~~~~~~~~'),
      createScoutRow('ap00:01'),
      createScoutRow('**1set'),
    ],
    setScore: '0-1',
  }), { sourceName: 'composed-attack.dvw' });
  const attackProject = mapDataVolleyMatchToOvsProject(composedAttack, {
    importId: 'validation-composed-attack',
    createdAt: 3_000,
  }).project;
  const attackTouches = getTouchEvents(attackProject).map((event) => event.touch);
  assertions += expectEqual(attackTouches.length, 2, 'attack composed touch count');
  assertions += expectEqual(attackTouches[1].skill, 'block', 'attack composed inferred block skill');
  assertions += expectEqual(attackTouches[1].evaluation, '#', 'attack composed inferred block evaluation');

  const explicitBlock = parseDataVolleyFile(createDataVolleyFile({
    scoutRows: [
      createScoutRow('*03AH/~~~~~~~~~'),
      createScoutRow('a04BH#~~~~~~~~~'),
      createScoutRow('ap00:01'),
      createScoutRow('**1set'),
    ],
    setScore: '0-1',
  }), { sourceName: 'explicit-block.dvw' });
  const explicitBlockProject = mapDataVolleyMatchToOvsProject(explicitBlock, {
    importId: 'validation-explicit-block',
    createdAt: 4_000,
  }).project;
  assertions += expectEqual(getTouchEvents(explicitBlockProject).length, 2, 'explicit block not duplicated');

  const substitutions = parseDataVolleyFile(createDataVolleyFile({
    scoutRows: [
      createScoutRow('*01SQ#~~~~~~~~~'),
      createScoutRow('*p01:00'),
      createScoutRow('*c01:07'),
      createScoutRow('*07SQ#~~~~~~~~~', 1, [7, 2, 3, 4, 5, 6]),
      createScoutRow('*p02:00', 1, [7, 2, 3, 4, 5, 6]),
      createScoutRow('**1set'),
    ],
  }), { sourceName: 'substitution.dvw' });
  const substitutionProject = mapDataVolleyMatchToOvsProject(substitutions, {
    importId: 'validation-substitution',
    createdAt: 5_000,
  }).project;
  assertions += expectOk(substitutionProject.events.some((event) => event.type === 'substitution_made'), 'substitution event mapped');
  assertions += expectEqual(getLiveMatchReplayStatus(substitutionProject.metadata.id, substitutionProject.events).canReplay, true, 'substitution replayable');

  assertions += expectOk(minimal.players.some((player) => player.isLibero), 'libero marker parsed');
  assertions += expectOk(minimal.players.some((player) => player.isCaptain), 'captain marker parsed');

  const multiSet = parseDataVolleyFile(createDataVolleyFile({
    scoutRows: [
      createScoutRow('*01SQ#~~~~~~~~~'),
      createScoutRow('*p01:00'),
      createScoutRow('**1set'),
    ],
    setScore: '1-0',
    secondSetRows: [
      createScoutRow('a01SQ#~~~~~~~~~', 2),
      createScoutRow('ap00:01', 2),
      createScoutRow('**2set', 2),
    ],
  }), { sourceName: 'multi-set.dvw' });
  const multiSetProject = mapDataVolleyMatchToOvsProject(multiSet, {
    importId: 'validation-multi-set',
    createdAt: 6_000,
  }).project;
  assertions += expectEqual(multiSetProject.events.filter((event) => event.type === 'set_started').length, 2, 'multi-set starts');
  assertions += expectEqual(multiSetProject.events.filter((event) => event.type === 'set_ended').length, 2, 'multi-set endings');

  return { assertions };
}

export function validateDataVolleyRealSample(input: string | Uint8Array, sourceName: string): ValidationResult {
  let assertions = 0;
  const parsed = parseDataVolleyFile(input, { sourceName });
  assertions += expectEqual(parsed.teams.length, 2, `${sourceName} teams parsed`);
  assertions += expectOk(parsed.players.length >= 12, `${sourceName} players parsed`);
  assertions += expectOk(parsed.actions.length > 0, `${sourceName} actions parsed`);

  const mapped = mapDataVolleyMatchToOvsProject(parsed, {
    importId: `validation-real-${sourceName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
    createdAt: 10_000,
  });
  assertions += expectOk(mapped.project.events.some((event) => event.type === 'touch_recorded'), `${sourceName} touches mapped`);
  assertions += expectEqual(getLiveMatchReplayStatus(mapped.project.metadata.id, mapped.project.events).canReplay, true, `${sourceName} replayable`);

  return { assertions };
}
