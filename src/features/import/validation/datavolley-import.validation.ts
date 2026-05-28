import { buildMatchStats, validateTeamTotals } from '@src/features/scouting/model/match-stats';
import { extractHeatmapEvents } from '@src/features/analytics/heatmaps/aggregation/heatmap-aggregation';
import { getLiveMatchReplayStatus } from '@src/features/scouting/model/replay';
import {
  mapDataVolleyMatchToOvsProject,
  persistDataVolleyImportedTeams,
  parseDataVolleyFile,
  previewDataVolleyTeamPersistence,
  validateImportedMatch,
  validateImportedStats,
  type DataVolleyTeamPersistenceRepository,
  type DataVolleyTeamRepositoryRecord,
} from '..';
import type { ArchivedPlayer, ArchivedTeam } from '@src/domain/team/types';
import type { TeamStaff } from '@src/domain/roster/types';

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

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
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
  homePlayerRows?: string;
  awayPlayerRows?: string;
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
    input.homePlayerRows ?? createPlayerRows('Home'),
    '[3PLAYERS-V]',
    input.awayPlayerRows ?? createPlayerRows('Away'),
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

function createMemoryTeamRepository(initialRecords: DataVolleyTeamRepositoryRecord[] = []) {
  let teamCounter = 1;
  let rosterCounter = 1;
  const records = new Map<string, DataVolleyTeamRepositoryRecord>();

  initialRecords.forEach((record) => {
    records.set(record.team.id, clone(record));
  });

  const repository: DataVolleyTeamPersistenceRepository & {
    getRecords: () => DataVolleyTeamRepositoryRecord[];
  } = {
    async list() {
      return [...records.values()]
        .map((record) => clone(record.team))
        .sort((left, right) => left.name.localeCompare(right.name));
    },

    async getById(teamId: string) {
      const record = records.get(teamId);
      return record ? clone(record) : null;
    },

    async create(input) {
      const now = input.updatedAt ?? Date.now();
      const id = input.id ?? `memory-team-${teamCounter}`;
      teamCounter += 1;
      const rosterId = `memory-roster-${rosterCounter}`;
      rosterCounter += 1;
      const team: ArchivedTeam = {
        id,
        teamCode: input.teamCode ?? `TEAM-${teamCounter}`,
        name: input.name.trim(),
        staff: input.staff ?? { headCoach: '', assistantCoach: '' },
        rosterIds: [rosterId],
        createdAt: input.createdAt ?? now,
        updatedAt: now,
      };
      const record: DataVolleyTeamRepositoryRecord = {
        team,
        roster: {
          id: rosterId,
          teamId: team.id,
          players: input.players ?? [],
        },
      };
      records.set(team.id, clone(record));
      return clone(record);
    },

    async update(teamId, updates) {
      const record = records.get(teamId);
      if (!record) {
        throw new Error(`Team ${teamId} not found`);
      }

      const updatedRecord: DataVolleyTeamRepositoryRecord = {
        team: {
          ...record.team,
          name: updates.name ? updates.name.trim() : record.team.name,
          staff: updates.staff ?? record.team.staff,
          updatedAt: Date.now(),
        },
        roster: {
          ...record.roster,
          players: updates.players ?? record.roster.players,
        },
      };
      records.set(teamId, clone(updatedRecord));
      return clone(updatedRecord);
    },

    getRecords() {
      return [...records.values()].map(clone);
    },
  };

  return repository;
}

function createArchivedPlayer(input: {
  id: string;
  jerseyNumber: number;
  firstName: string;
  lastName: string;
  playerCode?: string;
  isCaptain?: boolean;
  isLibero?: boolean;
}): ArchivedPlayer {
  return {
    id: input.id,
    jerseyNumber: input.jerseyNumber,
    firstName: input.firstName,
    lastName: input.lastName,
    playerCode: input.playerCode ?? `${input.firstName.slice(0, 3).toUpperCase()}-${input.lastName.slice(0, 3).toUpperCase()}`,
    isCaptain: input.isCaptain,
    isLibero: input.isLibero,
  };
}

function createArchivedTeamRecord(input: {
  id: string;
  name: string;
  staff?: TeamStaff;
  players?: ArchivedPlayer[];
  updatedAt?: number;
}): DataVolleyTeamRepositoryRecord {
  const rosterId = `${input.id}-roster`;
  return {
    team: {
      id: input.id,
      teamCode: input.id.toUpperCase(),
      name: input.name,
      staff: input.staff ?? { headCoach: '', assistantCoach: '' },
      rosterIds: [rosterId],
      createdAt: input.updatedAt ?? 1,
      updatedAt: input.updatedAt ?? 1,
    },
    roster: {
      id: rosterId,
      teamId: input.id,
      players: input.players ?? [],
    },
  };
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

  // --- ballDirection: serve with zone codes ---
  const serveWithZones = parseDataVolleyFile(createDataVolleyFile({
    scoutRows: [
      createScoutRow('*01SM#~~~61B~~~~'),  // serve player 1, startZone=6, endZone=1
      createScoutRow('a01RM-~~~61C~~~~'),  // receive, startZone=6, endZone=1
      createScoutRow('*p01:00'),
      createScoutRow('**1set'),
    ],
    setScore: '1-0',
  }), { sourceName: 'serve-with-zones.dvw' });
  const serveWithZonesProject = mapDataVolleyMatchToOvsProject(serveWithZones, {
    importId: 'validation-serve-with-zones',
    createdAt: 20_000,
  }).project;
  const serveWithZonesTouches = getTouchEvents(serveWithZonesProject)
    .map((event) => event.touch);
  const explicitServeTouch = serveWithZonesTouches.find((t) => t.skill === 'serve' && t.source === 'explicit');
  assertions += expectOk(
    explicitServeTouch?.ballDirection !== undefined,
    'serve with zone codes must have ballDirection set',
  );
  assertions += expectOk(
    explicitServeTouch?.ballDirection?.courtZoneStart === '6',
    'serve ballDirection courtZoneStart must be preserved',
  );
  assertions += expectOk(
    explicitServeTouch?.ballDirection?.courtZoneEnd === '1',
    'serve ballDirection courtZoneEnd must be preserved',
  );

  // Heatmap events must be non-empty for touches with ballDirection
  const allTouchesWithDirection = serveWithZonesTouches.filter((t) => t.ballDirection);
  const heatmapEvents = extractHeatmapEvents(allTouchesWithDirection);
  assertions += expectOk(heatmapEvents.length > 0, 'heatmap events extracted from imported ballDirection touches');

  // Receive touch has cross-net direction (start on opposite side)
  const receiveTouch = serveWithZonesTouches.find((t) => t.skill === 'receive' && t.source === 'explicit');
  assertions += expectOk(
    receiveTouch?.ballDirection !== undefined,
    'receive with zone codes must have ballDirection set',
  );
  // Start of receive direction is on the OPPOSITE side (serving team's side)
  // In this fixture: home (*) is left side (x<50), away (a) is right side (x>50)
  // Receive by away team (a): selfDisplaySide='right', oppositeDisplaySide='left'
  // receive start should be on left (home's = opposite) side → x < 50
  assertions += expectOk(
    receiveTouch?.ballDirection?.start !== undefined &&
    (receiveTouch.ballDirection.start.x < 50),
    'receive ballDirection start should be on opposite (serving) side',
  );

  // Inferred serve from receive-only fixture (no preceding explicit serve)
  const receiveOnlyFixture = parseDataVolleyFile(createDataVolleyFile({
    scoutRows: [
      createScoutRow('a01RM-~~~61C~~~~'),  // receive with zones, no preceding serve
      createScoutRow('*p01:00'),
      createScoutRow('**1set'),
    ],
    setScore: '1-0',
  }), { sourceName: 'receive-only-zones.dvw' });
  const receiveOnlyProject = mapDataVolleyMatchToOvsProject(receiveOnlyFixture, {
    importId: 'validation-receive-only-zones',
    createdAt: 22_000,
  }).project;
  const receiveOnlyTouches = getTouchEvents(receiveOnlyProject).map((event) => event.touch);
  const inferredServeTouch = receiveOnlyTouches.find((t) => t.skill === 'serve' && t.source === 'inferred');
  assertions += expectOk(
    inferredServeTouch !== undefined,
    'inferred serve must be created from receive action without preceding serve',
  );
  assertions += expectOk(
    inferredServeTouch?.ballDirection !== undefined,
    'inferred serve must have ballDirection generated from receive action zone codes',
  );

  // Touch without zones should NOT have ballDirection
  const touchWithoutZones = serveWithZonesTouches.find((t) => t.skill === 'serve' && !t.startZoneCode);
  // (no such touch in this fixture, but verify via a separate fixture)
  const noZoneFixture = parseDataVolleyFile(createDataVolleyFile({
    scoutRows: [
      createScoutRow('*01SQ#~~~~~~~~~'),  // serve, NO zone codes
      createScoutRow('*p01:00'),
      createScoutRow('**1set'),
    ],
    setScore: '1-0',
  }), { sourceName: 'no-zones.dvw' });
  const noZoneProject = mapDataVolleyMatchToOvsProject(noZoneFixture, {
    importId: 'validation-no-zones',
    createdAt: 21_000,
  }).project;
  const noZoneTouches = getTouchEvents(noZoneProject).map((event) => event.touch);
  const noZoneServe = noZoneTouches.find((t) => t.skill === 'serve');
  assertions += expectOk(
    !noZoneServe?.ballDirection,
    'serve without zone codes must NOT have ballDirection',
  );

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

  // --- ballDirection: verify synthetic directions are generated from zone codes ---
  const allTouches = mapped.project.events
    .filter((event): event is Extract<typeof event, { type: 'touch_recorded' }> => event.type === 'touch_recorded')
    .map((event) => event.touch);

  // Actions with zone codes should get a ballDirection
  const touchesWithZones = allTouches.filter((t) => t.startZoneCode);
  assertions += expectOk(
    touchesWithZones.length > 0,
    `${sourceName}: expected at least some touches to have zone codes`,
  );

  const touchesWithDirection = touchesWithZones.filter((t) => t.ballDirection);
  assertions += expectOk(
    touchesWithDirection.length > 0,
    `${sourceName}: expected at least some touches with zone codes to have synthetic ballDirection`,
  );

  // Heatmap should not be empty for this imported match
  const heatmapEvents = extractHeatmapEvents(allTouches);
  assertions += expectOk(
    heatmapEvents.length > 0,
    `${sourceName}: heatmap must not be empty after synthetic ballDirection generation`,
  );

  // Coverage rate: at least 20% of all touches should produce heatmap events
  const coverageRate = allTouches.length > 0 ? heatmapEvents.length / allTouches.length : 0;
  assertions += expectOk(
    coverageRate >= 0.2,
    `${sourceName}: heatmap coverage rate must be ≥ 20% (got ${(coverageRate * 100).toFixed(1)}%)`,
  );

  return { assertions };
}

export async function validateDataVolleyTeamPersistenceFixture(): Promise<ValidationResult> {
  let assertions = 0;
  const parsed = parseDataVolleyFile(createDataVolleyFile({
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
  }), { sourceName: 'persistence.dvw' });
  const mapped = mapDataVolleyMatchToOvsProject(parsed, {
    importId: 'validation-persistence',
    createdAt: 7_000,
  });

  const repository = createMemoryTeamRepository();
  const newPreview = await previewDataVolleyTeamPersistence(mapped.project, repository);
  assertions += expectEqual(newPreview.teamPreviews.filter((team) => team.action === 'create').length, 2, 'preview marks both imported teams as new');

  const persisted = await persistDataVolleyImportedTeams(mapped.project, repository);
  assertions += expectEqual(repository.getRecords().length, 2, 'DataVolley import creates reusable archived teams');
  assertions += expectOk(persisted.project.homeSelection.archivedTeamId, 'home imported match references archived team');
  assertions += expectOk(persisted.project.awaySelection.archivedTeamId, 'away imported match references archived team');
  assertions += expectEqual(persisted.project.homeSelection.source, 'archived_team', 'home selection is linked to archive');
  assertions += expectEqual(
    persisted.project.homeSelection.roster.every((player) => player.source === 'archived_roster' && Boolean(player.archivedPlayerId)),
    true,
    'home roster players reference archived players',
  );
  assertions += expectEqual(getLiveMatchReplayStatus(persisted.project.metadata.id, persisted.project.events).canReplay, true, 'linked imported match opens/replays');
  assertions += expectEqual(getImportErrors(persisted.project).length, 0, 'linked imported match validates');

  const homeRecord = await repository.getById(persisted.project.homeSelection.archivedTeamId ?? '');
  assertions += expectOk(homeRecord, 'home archived team can be loaded for reuse');
  assertions += expectEqual(homeRecord?.roster.players.length, 7, 'home archived roster stores imported players');
  assertions += expectEqual(Boolean(homeRecord?.roster.players.find((player) => player.jerseyNumber === 6)?.isLibero), true, 'libero marker persisted');
  assertions += expectEqual(Boolean(homeRecord?.roster.players.find((player) => player.jerseyNumber === 5)?.isCaptain), true, 'captain marker persisted');

  const secondMapped = mapDataVolleyMatchToOvsProject(parsed, {
    importId: 'validation-persistence-repeat',
    createdAt: 8_000,
  });
  await persistDataVolleyImportedTeams(secondMapped.project, repository);
  assertions += expectEqual(repository.getRecords().length, 2, 'importing same DataVolley file twice does not duplicate teams');
  const homeRecordAfterRepeat = await repository.getById(persisted.project.homeSelection.archivedTeamId ?? '');
  assertions += expectEqual(homeRecordAfterRepeat?.roster.players.length, 7, 'repeat import does not duplicate roster players');

  const existingRepository = createMemoryTeamRepository([
    createArchivedTeamRecord({
      id: 'manual-home',
      name: 'Home Test',
      staff: { headCoach: 'Manual Coach', assistantCoach: '' },
      players: [
        createArchivedPlayer({
          id: 'manual-home-1',
          jerseyNumber: 1,
          firstName: 'Manual',
          lastName: 'Setter Edited',
          playerCode: 'MAN-SET',
          isCaptain: true,
        }),
        createArchivedPlayer({
          id: 'manual-home-6',
          jerseyNumber: 6,
          firstName: 'Home',
          lastName: 'Libero',
          playerCode: 'HOM-LIB',
          isLibero: false,
        }),
      ],
    }),
  ]);
  const existingPreview = await previewDataVolleyTeamPersistence(mapped.project, existingRepository);
  const homePreview = existingPreview.teamPreviews.find((team) => team.side === 'home');
  assertions += expectEqual(homePreview?.action, 'update', 'preview marks matching archived team for update');
  assertions += expectOk((homePreview?.rosterChanges.playersAdded ?? 0) > 0, 'preview reports roster changes for existing team');

  const merged = await persistDataVolleyImportedTeams(mapped.project, existingRepository);
  assertions += expectEqual(existingRepository.getRecords().length, 2, 'existing home plus new away are stored without duplicate home team');
  const manualHome = await existingRepository.getById('manual-home');
  assertions += expectEqual(manualHome?.team.staff.headCoach, 'Manual Coach', 'existing staff is not overwritten destructively');
  const manualSetter = manualHome?.roster.players.find((player) => player.jerseyNumber === 1);
  assertions += expectEqual(manualSetter?.firstName, 'Manual', 'existing player first name is preserved');
  assertions += expectEqual(manualSetter?.lastName, 'Setter Edited', 'existing player last name is preserved');
  assertions += expectEqual(Boolean(manualHome?.roster.players.find((player) => player.jerseyNumber === 6)?.isLibero), true, 'roster merge updates imported libero marker safely');
  assertions += expectEqual(manualHome?.roster.players.length, 7, 'roster merge adds missing imported players');
  assertions += expectEqual(getLiveMatchReplayStatus(merged.project.metadata.id, merged.project.events).canReplay, true, 'merged imported match still opens/replays');
  assertions += expectEqual(getImportErrors(merged.project).length, 0, 'merged imported match validates');

  const diagnosticParsed = parseDataVolleyFile(createDataVolleyFile({
    homePlayerRows: [
      createPlayerRow({ jersey: 1, firstName: 'Home', lastName: 'Captain', specialRole: 'C' }),
      createPlayerRow({ jersey: 1, firstName: 'Home', lastName: 'Libero', specialRole: 'L' }),
      createPlayerRow({ jersey: 8, firstName: '', lastName: '' }),
    ].join('\n'),
    scoutRows: [
      createScoutRow('*01SQ#~~~~~~~~~'),
      createScoutRow('*p01:00'),
      createScoutRow('**1set'),
    ],
    setScore: '1-0',
  }), { sourceName: 'diagnostics.dvw' });
  const diagnosticProject = mapDataVolleyMatchToOvsProject(diagnosticParsed, {
    importId: 'validation-persistence-diagnostics',
    createdAt: 9_000,
  }).project;
  const collisionRepository = createMemoryTeamRepository([
    createArchivedTeamRecord({ id: 'collision-1', name: 'Home Test', updatedAt: 1 }),
    createArchivedTeamRecord({ id: 'collision-2', name: ' home   test ', updatedAt: 2 }),
  ]);
  const diagnostics = await previewDataVolleyTeamPersistence(diagnosticProject, collisionRepository);
  assertions += expectOk(diagnostics.warnings.some((warning) => warning.message.includes('duplicate DataVolley jersey #1')), 'duplicate jersey diagnostic emitted');
  assertions += expectOk(diagnostics.warnings.some((warning) => warning.message.includes('missing a player name')), 'missing player name diagnostic emitted');
  assertions += expectOk(diagnostics.warnings.some((warning) => warning.message.includes('conflicting captain/libero markers')), 'conflicting marker diagnostic emitted');
  assertions += expectOk(diagnostics.warnings.some((warning) => warning.message.includes('Team name collision')), 'team name collision diagnostic emitted');

  return { assertions };
}
