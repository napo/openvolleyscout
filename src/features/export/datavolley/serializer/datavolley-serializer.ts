/**
 * DataVolley DVW serializer.
 *
 * Converts a DataVolleyExportModel into the semicolon-delimited INI-section
 * text format expected by DataVolley readers (openvolley/datavolley,
 * py-datavolley, and the OVS DataVolley importer).
 *
 * Scout row column layout (0-indexed after splitting by ';'):
 *   0  = action code
 *   1  = pointPhase
 *   2  = attackPhase
 *   3  = (reserved/empty)
 *   4  = startCoordinate
 *   5  = midCoordinate
 *   6  = endCoordinate
 *   7  = time (HH.MM.SS)
 *   8  = setNumber
 *   9  = homeSetterPosition
 *   10 = awaySetterPosition
 *   11 = videoFileNumber
 *   12 = videoTime (seconds)
 *   13 = (reserved/empty)
 *   14-19 = home lineup (6 positions)
 *   20-25 = away lineup (6 positions)
 */

import type { DataVolleyExportModel, DataVolleyExportPlayer, DataVolleyExportSet, DataVolleyScoutRow } from '../types';

const CRLF = '\r\n';
const MAX_SETS = 5;
const LINEUP_SLOTS = 6;

// ─── Helpers ────────────────────────────────────────────────────────────────

function f(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[;\r\n]+/g, ' ').trim();
}

function row(...parts: (string | number | undefined | null)[]): string {
  return `${parts.map(f).join(';')};`;
}

function section(name: string, lines: string[]): string {
  return [`[${name}]`, ...lines].join(CRLF);
}

function formatGeneratorDay(ts: number): string {
  const d = new Date(ts);
  return [
    String(d.getUTCDate()).padStart(2, '0'),
    '/',
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    '/',
    String(d.getUTCFullYear()),
    ' ',
    String(d.getUTCHours()).padStart(2, '0'),
    '.',
    String(d.getUTCMinutes()).padStart(2, '0'),
    '.',
    String(d.getUTCSeconds()).padStart(2, '0'),
  ].join('');
}

// ─── Sections ────────────────────────────────────────────────────────────────

function buildFileHeader(model: DataVolleyExportModel): string {
  const dayStr = formatGeneratorDay(model.generatedAt);
  return section('3DATAVOLLEYSCOUT', [
    'FILEFORMAT: 2.0',
    `GENERATOR-DAY: ${dayStr}`,
    'GENERATOR-IDP: OVS',
    'GENERATOR-PRG: OpenVolleyScout',
    'GENERATOR-REL: Export v1',
    'GENERATOR-VER: Community',
    'GENERATOR-NAM: OpenVolleyScout',
  ]);
}

function buildMatch(model: DataVolleyExportModel): string {
  const { metadata } = model;
  // field layout follows parseMetadata column offsets:
  // 0=date  1=time  2=season  3=league  4=phase  5=(empty)
  // 6=day   7=matchNum  8=(empty)  9=regulation  10=zones
  const matchRow = row(
    model.matchDate ?? '',       // 0 date DD/MM/YYYY
    model.matchTime ?? '',       // 1 time HH.MM.SS
    metadata.season ?? '',       // 2 season
    metadata.competition ?? '',  // 3 league/competition
    metadata.round ?? '',        // 4 phase/round
    '',                          // 5 reserved
    metadata.matchNumber ?? '',  // 6 day number
    '',                          // 7 match number (second id slot)
    '',                          // 8 reserved
    '1',                         // 9 regulation (1 = indoor)
    'Z',                         // 10 zones/cones
  );
  return section('3MATCH', [matchRow]);
}

function buildTeams(model: DataVolleyExportModel): string {
  const { home, away } = model.teams;
  return section('3TEAMS', [
    row(home.teamId, home.name, home.setsWon, home.headCoach, home.assistantCoach),
    row(away.teamId, away.name, away.setsWon, away.headCoach, away.assistantCoach),
  ]);
}

function buildMore(model: DataVolleyExportModel): string {
  const venue = model.metadata.venue ?? '';
  return section('3MORE', [
    row('', '', '', venue, '', ''),
    row('', 0, 0),
  ]);
}

function buildComments(): string {
  return section('3COMMENTS', [row('no comments', 'no comments', 'no comments', 'no comments')]);
}

function buildSets(sets: DataVolleyExportSet[]): string {
  const rows = Array.from({ length: MAX_SETS }, (_, index) => {
    const set = sets[index];
    if (!set || !set.played) {
      return row('False', '', '', '', '', '');
    }
    const score = (set.homeScore !== undefined && set.awayScore !== undefined)
      ? `${set.homeScore}-${set.awayScore}`
      : '';
    return row(
      'True',   // 0 played
      '',        // 1 checkpoint1
      '',        // 2 checkpoint2
      '',        // 3 checkpoint3
      score,     // 4 final score
      set.durationMinutes ?? '',  // 5 duration minutes
    );
  });
  return section('3SET', rows);
}

/**
 * Build a single player row.
 *
 * Column layout expected by parsePlayerLine:
 *   0  = team index (0=home, 1=away)
 *   1  = jersey number
 *   2  = sequential player ID
 *   3  = starting position set 1
 *   4  = starting position set 2
 *   5  = starting position set 3
 *   6  = starting position set 4
 *   7  = starting position set 5
 *   8  = dataVolleyId / player code
 *   9  = lastName
 *   10 = firstName
 *   11 = nickname
 *   12 = specialRole (C/L/CL/empty)
 *   13 = roleCode (1-5)
 *   14 = foreign player flag
 */
function buildPlayerRow(player: DataVolleyExportPlayer, teamIndex: 0 | 1, seqId: number): string {
  const positions = Array.from({ length: MAX_SETS }, (_, i) => player.startingPositions[i] ?? '');
  return row(
    teamIndex,
    player.jerseyNumber,
    seqId,
    positions[0],   // 3 set 1 starting position
    positions[1],   // 4 set 2 starting position
    positions[2],   // 5 set 3 starting position
    positions[3],   // 6 set 4 starting position
    positions[4],   // 7 set 5 starting position
    player.playerCode,  // 8 dataVolleyId
    player.lastName,    // 9 last name
    player.firstName,   // 10 first name
    '',                 // 11 nickname
    player.specialRole, // 12 special role (C/L/CL)
    player.roleCode,    // 13 role code
    'False',            // 14 foreign player flag
  );
}

function buildPlayers(model: DataVolleyExportModel): string {
  let seqId = 1;
  const homePlayers = model.players.home;
  const awayPlayers = model.players.away;

  const homeRows = homePlayers.map((player) => {
    const playerRow = buildPlayerRow(player, 0, seqId);
    seqId += 1;
    return playerRow;
  });

  const awayRows = awayPlayers.map((player) => {
    const playerRow = buildPlayerRow(player, 1, seqId);
    seqId += 1;
    return playerRow;
  });

  return [
    section('3PLAYERS-H', homeRows),
    section('3PLAYERS-V', awayRows),
  ].join(CRLF);
}

function buildAttackCombinations(): string {
  return section('3ATTACKCOMBINATION', []);
}

function buildSetterCalls(): string {
  return section('3SETTERCALL', []);
}

function buildWinningSymbols(): string {
  return section('3WINNINGSYMBOLS', [
    '=~~~#~~~=~~~~~~~=/~~#~~~=/~~#~~~=~~~~~~~=~~~~~~~=~~~~~~~',
  ]);
}

function buildReserve(): string {
  return section('3RESERVE', []);
}

function buildVideo(): string {
  return section('3VIDEO', []);
}

/**
 * Serialize a single scout row into a DVW scout line.
 *
 * Column layout:
 *   0  = code
 *   1  = pointPhase
 *   2  = attackPhase
 *   3  = (reserved)
 *   4  = startCoordinate
 *   5  = midCoordinate
 *   6  = endCoordinate
 *   7  = time (HH.MM.SS)
 *   8  = setNumber
 *   9  = homeSetterPosition
 *   10 = awaySetterPosition
 *   11 = videoFileNumber
 *   12 = videoTime (seconds)
 *   13 = (reserved)
 *   14-19 = home lineup (6 slots)
 *   20-25 = away lineup (6 slots)
 */
function serializeScoutRow(scoutRow: DataVolleyScoutRow): string {
  const homeLineup = Array.from({ length: LINEUP_SLOTS }, (_, i) => scoutRow.homeLineup[i] ?? '');
  const awayLineup = Array.from({ length: LINEUP_SLOTS }, (_, i) => scoutRow.awayLineup[i] ?? '');

  return row(
    scoutRow.code,                       // 0  code
    scoutRow.pointPhase ?? '',           // 1  pointPhase
    scoutRow.attackPhase ?? '',          // 2  attackPhase
    '',                                  // 3  reserved
    scoutRow.startCoordinate ?? '',      // 4  startCoordinate
    scoutRow.midCoordinate ?? '',        // 5  midCoordinate
    scoutRow.endCoordinate ?? '',        // 6  endCoordinate
    scoutRow.time,                       // 7  time HH.MM.SS
    scoutRow.setNumber,                  // 8  setNumber
    scoutRow.homeSetterPosition ?? '',   // 9  homeSetterPosition
    scoutRow.awaySetterPosition ?? '',   // 10 awaySetterPosition
    scoutRow.videoFileNumber ?? '',      // 11 videoFileNumber
    scoutRow.videoTime ?? '',            // 12 videoTime (seconds)
    '',                                  // 13 reserved
    ...homeLineup,                       // 14-19 home lineup
    ...awayLineup,                       // 20-25 away lineup
  );
}

function buildScout(model: DataVolleyExportModel): string {
  return section('3SCOUT', model.scoutRows.map(serializeScoutRow));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Serialize a DataVolleyExportModel to a DVW file text string.
 *
 * The output uses CRLF line endings as expected by DataVolley desktop
 * software.  The encoding is UTF-8.  Pass the result to
 * `downloadDataVolleyFile` to trigger a browser download.
 */
export function serializeDataVolleyModel(model: DataVolleyExportModel): string {
  const sections = [
    buildFileHeader(model),
    buildMatch(model),
    buildTeams(model),
    buildMore(model),
    buildComments(),
    buildSets(model.sets),
    buildPlayers(model),
    buildAttackCombinations(),
    buildSetterCalls(),
    buildWinningSymbols(),
    buildReserve(),
    buildVideo(),
    buildScout(model),
  ];

  return sections.join(CRLF);
}
