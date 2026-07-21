import type { SkillEvaluation, TeamSide } from '@src/domain/common/enums';
import type {
  ParsedDataVolleyAction,
  ParsedDataVolleyLineupSnapshot,
  ParsedDataVolleyMatch,
  ParsedDataVolleyPlayer,
  ParsedDataVolleyRole,
  ParsedDataVolleyScoutRow,
  ParsedDataVolleySet,
  ParsedDataVolleySkill,
  ParsedDataVolleySkillCode,
  ParsedDataVolleyTeam,
} from './types';
import type { ParsedImportWarning } from '../diagnostics';

type SqlJsDatabase = {
  exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
  close(): void;
};

type SqlJsStatic = {
  Database: new (data?: ArrayLike<number>) => SqlJsDatabase;
};

const FONDAMENTALE_TO_SKILL: Record<number, ParsedDataVolleySkillCode> = {
  1: 'A',
  2: 'D',
  3: 'B',
  4: 'R',
  5: 'E',
  6: 'S',
  7: 'F',
};

const SKILL_CODE_TO_SKILL: Record<ParsedDataVolleySkillCode, ParsedDataVolleySkill> = {
  S: 'serve',
  R: 'receive',
  E: 'set',
  A: 'attack',
  B: 'block',
  D: 'dig',
  F: 'freeball',
};

const MARK_TO_EVALUATION: Record<number, SkillEvaluation> = {
  1: '#',
  2: '+',
  3: '!',
  4: '/',
  5: '-',
  6: '=',
};

const TT_ROLE_TO_DV_ROLE: Record<number, ParsedDataVolleyRole> = {
  1: 'setter',
  2: 'outside',
  3: 'middle',
  4: 'libero',
  5: 'opposite',
};

const TT_SERVE_TYPE: Record<number, string> = {
  1: 'H',
  2: 'M',
  3: 'Q',
  4: 'H',
};

const TT_ATT_TYPE: Record<number, string> = {
  1: 'H',
  2: 'P',
  3: 'T',
};

// Tiebreak Tech records rule violations (net faults, four touches, back-row
// attacks, ...) as their own IP_fondamentale=0 rows instead of a normal skill
// touch. DataVolley notation still attributes them to a skill, so map the
// error type to the skill it was committed during; anything not tied to a
// specific skill (double contact, lift, illegal reconstruction, rotation
// faults, ...) falls back to freeball, matching observed exports.
const ERROR_TYPE_TO_SKILL: Record<number, ParsedDataVolleySkillCode> = {
  5: 'B', // invasione (net violation, committed while blocking)
  14: 'A', // invasione di seconda linea (back-row attack violation)
};

type TtGame = {
  id: number;
  homeTeamId: number;
  visitorsTeamId: number;
  homeSetsWon: number;
  visitorsSetsWon: number;
  date: number;
  league: string;
};

type TtTeam = {
  id: number;
  name: string;
  ourteam: boolean;
};

type TtPlayer = {
  playerId: number;
  jersey: number;
  roleId: number;
  startingPos: number;
  startingPos2: number;
  startingPos3: number;
  startingPos4: number;
  startingPos5: number;
  captain: boolean;
  name: string;
  surname: string;
  teamId: number;
};

type TtSet = {
  id: number;
  gameId: number;
  homeScore: number;
  visitorScore: number;
  duration: number;
  homeServe: boolean;
  setNumber: number;
};

type TtEvent = {
  id: number;
  ssetId: number;
  time: number;
  homeScore: number;
  visitorScore: number;
  ipPlayer: number;
  ipFondamentale: number;
  opOtherType: number;
  mark: number;
  posPalleggiatore: number;
  posGiocatore: number;
  attCono: string;
  attType: number;
  serveType: number;
  serveDirection: number;
  setType: number;
  setChiamata: number;
  team: number;
  substitutionPlayerIn: number;
  substitutionPlayerOut: number;
  azione: number;
  opponentSetterPos: number;
  error: number;
  errorType: number;
};

type TtAzione = {
  id: number;
  startEvent: number;
  endEvent: number;
  teamWon: number;
};

function queryRows(db: SqlJsDatabase, sql: string): unknown[][] {
  const result = db.exec(sql);
  return result.length > 0 ? result[0].values : [];
}

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function formatTtDate(dateNum: number): string | undefined {
  if (!dateNum) return undefined;
  const str = String(dateNum);
  if (str.length !== 8) return undefined;
  return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
}

function loadGames(db: SqlJsDatabase): TtGame[] {
  return queryRows(db, 'SELECT id, home_team, visitors_team, homescore, visitorscore, date, manifestazione FROM game ORDER BY id').map((row) => ({
    id: asNumber(row[0]),
    homeTeamId: asNumber(row[1]),
    visitorsTeamId: asNumber(row[2]),
    homeSetsWon: asNumber(row[3]),
    visitorsSetsWon: asNumber(row[4]),
    date: asNumber(row[5]),
    league: '',
  }));
}

// Some Tiebreak Tech exports store team names with a doubled apostrophe
// (a leftover SQL-literal-escaping artifact, e.g. "DELL''ADDA" instead of
// "DELL'ADDA"); collapse it back to a single apostrophe.
function normalizeTtName(name: string): string {
  return name.replace(/''/g, "'");
}

function loadTeam(db: SqlJsDatabase, teamId: number): TtTeam {
  const rows = queryRows(db, `SELECT id, name, ourteam FROM team WHERE id = ${teamId}`);
  if (rows.length === 0) return { id: teamId, name: `Team ${teamId}`, ourteam: false };
  return {
    id: asNumber(rows[0][0]),
    name: normalizeTtName(asString(rows[0][1])),
    ourteam: asNumber(rows[0][2]) === 1,
  };
}

function loadLeague(db: SqlJsDatabase, manifestazioneId: number): string {
  if (!manifestazioneId) return '';
  const rows = queryRows(db, `SELECT descr FROM manifestazione WHERE id = ${manifestazioneId}`);
  return rows.length > 0 ? asString(rows[0][0]) : '';
}

function loadRoster(db: SqlJsDatabase, gameId: number, teamId: number): TtPlayer[] {
  return queryRows(db, `
    SELECT c.player_id, c.jersey, c.role_id, c.starting_pos, c.starting_pos2, c.starting_pos3, c.starting_pos4, c.starting_pos5, c.captain, p.name, p.surname
    FROM convocazioni c
    JOIN player p ON c.player_id = p.id
    WHERE c.game_id = ${gameId} AND c.team_id = ${teamId}
    ORDER BY c.starting_pos, c.jersey
  `).map((row) => ({
    playerId: asNumber(row[0]),
    jersey: asNumber(row[1]),
    roleId: asNumber(row[2]),
    startingPos: asNumber(row[3]),
    startingPos2: asNumber(row[4]),
    startingPos3: asNumber(row[5]),
    startingPos4: asNumber(row[6]),
    startingPos5: asNumber(row[7]),
    captain: asNumber(row[8]) === 1,
    name: asString(row[9]),
    surname: asString(row[10]),
    teamId,
  }));
}

function loadSets(db: SqlJsDatabase, gameId: number): TtSet[] {
  return queryRows(db, `
    SELECT id, game, homescore, visitorscore, duration, homeserve, sset_number
    FROM sset WHERE game = ${gameId} ORDER BY sset_number
  `).map((row) => ({
    id: asNumber(row[0]),
    gameId: asNumber(row[1]),
    homeScore: asNumber(row[2]),
    visitorScore: asNumber(row[3]),
    duration: asNumber(row[4]),
    homeServe: asNumber(row[5]) === 1,
    setNumber: asNumber(row[6]),
  }));
}

function loadEvents(db: SqlJsDatabase, ssetId: number): TtEvent[] {
  // A rally's closing touch can occasionally be mis-tagged with the wrong
  // sset (observed: the last event of a match tagged to a trailing unplayed
  // placeholder set instead of the set its own rally actually belongs to).
  // Falling back to azione membership recovers those orphaned events.
  return queryRows(db, `
    SELECT id, sset, time, homescore, visitorscore,
           IP_player, IP_fondamentale, OP_other_type, mark,
           pos_palleggiatore, pos_giocatore, ATT_cono, ATT_type,
           SERVE_type, SERVE_direction, SET_type, SET_chiamata,
           team, SUBSTITUTION_player_in, SUBSTITUTION_player_out,
           azione, opponent_setterpos, ERROR, ERROR_type
    FROM event
    WHERE sset = ${ssetId}
       OR azione IN (
         SELECT a.id FROM azione a JOIN event e2 ON a.start_event = e2.id WHERE e2.sset = ${ssetId}
       )
    ORDER BY id
  `).map((row) => ({
    id: asNumber(row[0]),
    ssetId: asNumber(row[1]),
    time: asNumber(row[2]),
    homeScore: asNumber(row[3]),
    visitorScore: asNumber(row[4]),
    ipPlayer: asNumber(row[5]),
    ipFondamentale: asNumber(row[6]),
    opOtherType: asNumber(row[7]),
    mark: asNumber(row[8]),
    posPalleggiatore: asNumber(row[9]),
    posGiocatore: asNumber(row[10]),
    attCono: asString(row[11]),
    attType: asNumber(row[12]),
    serveType: asNumber(row[13]),
    serveDirection: asNumber(row[14]),
    setType: asNumber(row[15]),
    setChiamata: asNumber(row[16]),
    team: asNumber(row[17]),
    substitutionPlayerIn: asNumber(row[18]),
    substitutionPlayerOut: asNumber(row[19]),
    azione: asNumber(row[20]),
    opponentSetterPos: asNumber(row[21]),
    error: asNumber(row[22]),
    errorType: asNumber(row[23]),
  }));
}

function loadAziones(db: SqlJsDatabase, ssetId: number): TtAzione[] {
  return queryRows(db, `
    SELECT DISTINCT a.id, a.start_event, a.end_event, a.team_won
    FROM azione a
    JOIN event e ON a.start_event = e.id
    WHERE e.sset = ${ssetId}
    ORDER BY a.id
  `).map((row) => ({
    id: asNumber(row[0]),
    startEvent: asNumber(row[1]),
    endEvent: asNumber(row[2]),
    teamWon: asNumber(row[3]),
  }));
}

function loadSetterCalls(db: SqlJsDatabase): Map<number, string> {
  const map = new Map<number, string>();
  queryRows(db, 'SELECT id, descr FROM d_SET_chiamata').forEach((row) => {
    map.set(asNumber(row[0]), asString(row[1]));
  });
  return map;
}

function teamSideFromId(teamId: number, homeTeamId: number): TeamSide {
  return teamId === homeTeamId ? 'home' : 'away';
}

function markerFromSide(side: TeamSide): '*' | 'a' {
  return side === 'home' ? '*' : 'a';
}

function parseCone(attCono: string): { cone?: string; startZone?: string } {
  if (!attCono) return {};
  const parts = attCono.split(':');
  const coneNum = parseInt(parts[0], 10);
  if (!coneNum || coneNum <= 0) return {};
  return { cone: String(coneNum) };
}

function buildPlayerIdToJersey(roster: TtPlayer[]): Map<number, number> {
  const map = new Map<number, number>();
  roster.forEach((player) => map.set(player.playerId, player.jersey));
  return map;
}

function buildStartingLineup(
  roster: TtPlayer[],
  setNumber: number,
): number[] {
  const posField = (player: TtPlayer): number => {
    switch (setNumber) {
      case 1: return player.startingPos;
      case 2: return player.startingPos2;
      case 3: return player.startingPos3;
      case 4: return player.startingPos4;
      case 5: return player.startingPos5;
      default: return player.startingPos;
    }
  };

  const starters: Array<{ jersey: number; pos: number }> = [];
  roster.forEach((player) => {
    const pos = posField(player);
    if (pos >= 1 && pos <= 6) {
      starters.push({ jersey: player.jersey, pos });
    }
  });

  starters.sort((a, b) => a.pos - b.pos);
  return starters.map((s) => s.jersey);
}

function toOvsPlayer(
  player: TtPlayer,
  side: TeamSide,
  teamId: string,
): ParsedDataVolleyPlayer {
  const role = TT_ROLE_TO_DV_ROLE[player.roleId] ?? 'unknown';
  const firstName = player.name || '';
  const lastName = player.surname || '';
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || `#${player.jersey}`;

  const startingPositions: ParsedDataVolleyPlayer['startingPositions'] = {};
  const positions = [player.startingPos, player.startingPos2, player.startingPos3, player.startingPos4, player.startingPos5];
  positions.forEach((pos, index) => {
    const setNum = (index + 1) as 1 | 2 | 3 | 4 | 5;
    if (pos >= 1 && pos <= 6) {
      startingPositions[setNum] = pos as 1 | 2 | 3 | 4 | 5 | 6;
    }
  });

  return {
    side,
    teamId,
    jerseyNumber: player.jersey,
    dataVolleyId: `tt-${player.playerId}`,
    firstName,
    lastName,
    displayName,
    role,
    roleCode: player.roleId,
    isCaptain: player.captain,
    isLibero: role === 'libero',
    startingPositions,
    rawFields: [],
    line: 0,
  };
}

function buildLineupSnapshot(
  homeRoster: TtPlayer[],
  awayRoster: TtPlayer[],
  setNumber: number,
  homeSetterPos: number,
  awaySetterPos: number,
): ParsedDataVolleyLineupSnapshot {
  return {
    home: buildStartingLineup(homeRoster, setNumber),
    away: buildStartingLineup(awayRoster, setNumber),
    homeSetterPosition: homeSetterPos || undefined,
    awaySetterPosition: awaySetterPos || undefined,
  };
}

function buildEventLineup(
  event: TtEvent,
  homeTeamId: number,
  homeIdToJersey: Map<number, number>,
  awayIdToJersey: Map<number, number>,
  currentLineup: ParsedDataVolleyLineupSnapshot,
): ParsedDataVolleyLineupSnapshot {
  const isHome = event.team === homeTeamId;
  const homeSetterPos = isHome ? event.posPalleggiatore : event.opponentSetterPos;
  const awaySetterPos = isHome ? event.opponentSetterPos : event.posPalleggiatore;

  return {
    home: currentLineup.home,
    away: currentLineup.away,
    homeSetterPosition: homeSetterPos || currentLineup.homeSetterPosition,
    awaySetterPosition: awaySetterPos || currentLineup.awaySetterPosition,
  };
}

function eventToAction(
  event: TtEvent,
  homeTeamId: number,
  homeIdToJersey: Map<number, number>,
  awayIdToJersey: Map<number, number>,
  setNumber: number,
  sequence: number,
  lineup: ParsedDataVolleyLineupSnapshot,
  setterCallMap: Map<number, string>,
): ParsedDataVolleyAction | null {
  const skillCode = FONDAMENTALE_TO_SKILL[event.ipFondamentale];
  if (!skillCode) return null;

  const side = teamSideFromId(event.team, homeTeamId);
  const marker = markerFromSide(side);
  const idToJersey = side === 'home' ? homeIdToJersey : awayIdToJersey;
  const jerseyNumber = idToJersey.get(event.ipPlayer);
  if (!jerseyNumber) return null;

  const evaluation = MARK_TO_EVALUATION[event.mark];
  const { cone } = parseCone(event.attCono);

  // Every DataVolley touch code carries a skill-type letter; skills without a
  // meaningful sub-type (receive, block, dig, set, freeball) default to 'H'.
  let skillTypeCode = 'H';
  if (skillCode === 'S' && event.serveType) {
    skillTypeCode = TT_SERVE_TYPE[event.serveType] ?? 'H';
  } else if (skillCode === 'A' && event.attType) {
    skillTypeCode = TT_ATT_TYPE[event.attType] ?? 'H';
  }

  const setCallCode = event.setChiamata ? setterCallMap.get(event.setChiamata) : undefined;
  const rawCode = `${marker}${String(jerseyNumber).padStart(2, '0')}${skillCode}${skillTypeCode ?? '~'}${evaluation ?? '~'}`;

  return {
    kind: 'touch',
    line: event.id,
    scoutSequence: sequence,
    rawLine: rawCode,
    rawCode,
    teamSide: side,
    teamMarker: marker,
    playerNumber: jerseyNumber,
    playerId: `tt-${event.ipPlayer}`,
    skill: SKILL_CODE_TO_SKILL[skillCode],
    dataVolleySkill: skillCode,
    skillTypeCode,
    evaluation,
    attackCode: skillCode === 'A' && setCallCode ? setCallCode : undefined,
    setCode: skillCode === 'E' && setCallCode ? setCallCode : undefined,
    startZone: event.posGiocatore ? String(event.posGiocatore) : undefined,
    endZone: cone,
    endSubzone: cone,
    setNumber,
    lineup: buildEventLineup(event, homeTeamId, homeIdToJersey, awayIdToJersey, lineup),
    time: undefined,
    pointPhase: undefined,
    attackPhase: undefined,
    startCoordinate: undefined,
    midCoordinate: undefined,
    endCoordinate: undefined,
    videoFileNumber: undefined,
    videoTime: undefined,
  };
}

function eventToFaultAction(
  event: TtEvent,
  homeTeamId: number,
  homeIdToJersey: Map<number, number>,
  awayIdToJersey: Map<number, number>,
  setNumber: number,
  sequence: number,
  lineup: ParsedDataVolleyLineupSnapshot,
): ParsedDataVolleyAction {
  const side = teamSideFromId(event.team, homeTeamId);
  const marker = markerFromSide(side);
  const idToJersey = side === 'home' ? homeIdToJersey : awayIdToJersey;
  const jerseyNumber = event.ipPlayer ? idToJersey.get(event.ipPlayer) : undefined;
  const skillCode = ERROR_TYPE_TO_SKILL[event.errorType] ?? 'F';
  const playerCode = jerseyNumber ? String(jerseyNumber).padStart(2, '0') : '$$';
  const rawCode = `${marker}${playerCode}${skillCode}H=`;

  return {
    kind: 'touch',
    line: event.id,
    scoutSequence: sequence,
    rawLine: rawCode,
    rawCode,
    teamSide: side,
    teamMarker: marker,
    playerNumber: jerseyNumber,
    playerId: jerseyNumber ? `tt-${event.ipPlayer}` : undefined,
    unknownPlayer: !jerseyNumber,
    skill: SKILL_CODE_TO_SKILL[skillCode],
    dataVolleySkill: skillCode,
    skillTypeCode: 'H',
    evaluation: '=',
    setNumber,
    lineup: buildEventLineup(event, homeTeamId, homeIdToJersey, awayIdToJersey, lineup),
    time: undefined,
    pointPhase: undefined,
    attackPhase: undefined,
    startCoordinate: undefined,
    midCoordinate: undefined,
    endCoordinate: undefined,
    videoFileNumber: undefined,
    videoTime: undefined,
  };
}

async function loadSqlJs(): Promise<SqlJsStatic> {
  const initSqlJs = (await import('sql.js')).default;
  // Cast (not a bare import.meta.env access) so this type-checks under ts-node's
  // per-file program too, which doesn't pick up vite-env.d.ts's ambient `vite/client` types.
  const base = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return initSqlJs({
    locateFile: () => `${base}sql-wasm.wasm`,
  });
}

export interface TiebreakImportOptions {
  sourceName?: string;
  gameId?: number;
}

export interface TiebreakGameInfo {
  id: number;
  homeTeamName: string;
  awayTeamName: string;
  date: string | undefined;
  score: string;
}

export async function listTiebreakGames(input: ArrayBuffer): Promise<TiebreakGameInfo[]> {
  const SQL = await loadSqlJs();
  const db = new SQL.Database(new Uint8Array(input));

  try {
    const games = loadGames(db);
    return games.map((game) => {
      const homeTeam = loadTeam(db, game.homeTeamId);
      const awayTeam = loadTeam(db, game.visitorsTeamId);
      return {
        id: game.id,
        homeTeamName: homeTeam.name,
        awayTeamName: awayTeam.name,
        date: formatTtDate(game.date),
        score: `${game.homeSetsWon}-${game.visitorsSetsWon}`,
      };
    });
  } finally {
    db.close();
  }
}

export async function parseTiebreakDatabase(
  input: ArrayBuffer,
  options?: TiebreakImportOptions,
): Promise<ParsedDataVolleyMatch> {
  const SQL = await loadSqlJs();
  const db = new SQL.Database(new Uint8Array(input));

  try {
    return parseTiebreakFromDb(db, options);
  } finally {
    db.close();
  }
}

function parseTiebreakFromDb(
  db: SqlJsDatabase,
  options?: TiebreakImportOptions,
): ParsedDataVolleyMatch {
  const warnings: ParsedImportWarning[] = [];
  const games = loadGames(db);

  if (games.length === 0) {
    warnings.push({ severity: 'error', message: 'No games found in the Tiebreak Tech database.' });
    return emptyMatch(options?.sourceName, warnings);
  }

  const game = options?.gameId
    ? games.find((g) => g.id === options.gameId) ?? games[0]
    : games[0];

  const manifestazioneRows = queryRows(db, `SELECT manifestazione FROM game WHERE id = ${game.id}`);
  const manifestazioneId = manifestazioneRows.length > 0 ? asNumber(manifestazioneRows[0][0]) : 0;
  const league = loadLeague(db, manifestazioneId);

  const homeTeamData = loadTeam(db, game.homeTeamId);
  const awayTeamData = loadTeam(db, game.visitorsTeamId);
  const setterCallMap = loadSetterCalls(db);

  const homeRoster = loadRoster(db, game.id, game.homeTeamId);
  const awayRoster = loadRoster(db, game.id, game.visitorsTeamId);

  if (homeRoster.length === 0) {
    warnings.push({ severity: 'warning', message: `No roster found for home team "${homeTeamData.name}".` });
  }
  if (awayRoster.length === 0) {
    warnings.push({ severity: 'warning', message: `No roster found for away team "${awayTeamData.name}".` });
  }

  const homeIdToJersey = buildPlayerIdToJersey(homeRoster);
  const awayIdToJersey = buildPlayerIdToJersey(awayRoster);

  const homeTeam: ParsedDataVolleyTeam = {
    side: 'home',
    marker: '*',
    teamId: `tt-team-${homeTeamData.id}`,
    name: homeTeamData.name,
    setsWon: game.homeSetsWon,
    rawFields: [],
    line: 0,
  };

  const awayTeam: ParsedDataVolleyTeam = {
    side: 'away',
    marker: 'a',
    teamId: `tt-team-${awayTeamData.id}`,
    name: awayTeamData.name,
    setsWon: game.visitorsSetsWon,
    rawFields: [],
    line: 0,
  };

  const players: ParsedDataVolleyPlayer[] = [
    ...homeRoster.map((p) => toOvsPlayer(p, 'home', homeTeam.teamId)),
    ...awayRoster.map((p) => toOvsPlayer(p, 'away', awayTeam.teamId)),
  ];

  const ttSets = loadSets(db, game.id);
  const sets: ParsedDataVolleySet[] = [];
  const scoutRows: ParsedDataVolleyScoutRow[] = [];
  const actions: ParsedDataVolleyAction[] = [];
  let globalSequence = 0;

  for (const ttSet of ttSets) {
    const setNum = ttSet.setNumber;
    const ttEvents = loadEvents(db, ttSet.id);
    const ttAziones = loadAziones(db, ttSet.id);

    const homeSetScore = ttSet.homeScore;
    const awaySetScore = ttSet.visitorScore;

    sets.push({
      setNumber: setNum,
      played: true,
      score: { home: homeSetScore, away: awaySetScore },
      duration: ttSet.duration,
      checkpoints: [null, null, null],
      rawFields: [],
      line: 0,
    });

    const initialLineup = buildLineupSnapshot(
      homeRoster, awayRoster, setNum,
      0, 0,
    );

    const lineupRow: ParsedDataVolleyScoutRow = {
      type: 'lineup',
      line: 0,
      scoutSequence: ++globalSequence,
      rawLine: '>LUp',
      rawCode: '>LUp',
      setNumber: setNum,
      lineup: initialLineup,
      pointPhase: undefined,
      attackPhase: undefined,
      startCoordinate: undefined,
      midCoordinate: undefined,
      endCoordinate: undefined,
      time: undefined,
      videoFileNumber: undefined,
      videoTime: undefined,
    };
    scoutRows.push(lineupRow);

    const eventsByAzione = new Map<number, TtEvent[]>();
    const nonRallyEvents: TtEvent[] = [];

    for (const event of ttEvents) {
      if (event.azione && (event.ipFondamentale > 0 || event.error > 0)) {
        const list = eventsByAzione.get(event.azione) ?? [];
        list.push(event);
        eventsByAzione.set(event.azione, list);
      } else if (event.opOtherType > 0) {
        nonRallyEvents.push(event);
      }
    }

    let currentScore = { home: 0, away: 0 };
    let lastAzioneEndEventId = 0;

    // azione.team_won is not populated by every Tiebreak Tech export (observed
    // blank across an entire real match file), so the point winner is derived
    // from the running home/visitor score already stamped on each event instead.
    const scoreByEventId = new Map<number, { home: number; away: number }>();
    ttEvents.forEach((event) => {
      scoreByEventId.set(event.id, { home: event.homeScore, away: event.visitorScore });
    });

    for (let azioneIndex = 0; azioneIndex < ttAziones.length; azioneIndex += 1) {
      const azione = ttAziones[azioneIndex];
      const rallyEvents = eventsByAzione.get(azione.id) ?? [];

      const pendingNonRally = nonRallyEvents.filter(
        (e) => e.id > lastAzioneEndEventId && e.id < azione.startEvent,
      );
      for (const nrEvent of pendingNonRally) {
        const nrRow = buildNonRallyRow(nrEvent, game.homeTeamId, homeIdToJersey, awayIdToJersey, setNum, ++globalSequence, initialLineup);
        if (nrRow) scoutRows.push(nrRow);
      }

      for (const event of rallyEvents) {
        const action = event.ipFondamentale === 0 && event.error > 0
          ? eventToFaultAction(
            event, game.homeTeamId,
            homeIdToJersey, awayIdToJersey,
            setNum, ++globalSequence,
            initialLineup,
          )
          : eventToAction(
            event, game.homeTeamId,
            homeIdToJersey, awayIdToJersey,
            setNum, ++globalSequence,
            initialLineup, setterCallMap,
          );
        if (action) {
          const touchRow: ParsedDataVolleyScoutRow = { ...action, type: 'touch' };
          scoutRows.push(touchRow);
          actions.push(action);
        }
      }

      const scoreBefore = scoreByEventId.get(azione.startEvent) ?? currentScore;
      const nextAzione = ttAziones[azioneIndex + 1];
      const scoreAfter = nextAzione
        ? scoreByEventId.get(nextAzione.startEvent) ?? scoreBefore
        : { home: homeSetScore, away: awaySetScore };

      let pointWinner: TeamSide | null = null;
      if (scoreAfter.home > scoreBefore.home) {
        pointWinner = 'home';
      } else if (scoreAfter.away > scoreBefore.away) {
        pointWinner = 'away';
      }

      lastAzioneEndEventId = azione.endEvent;

      // Some azione rows (e.g. rule-violation markers with no fondamentale)
      // don't correspond to an actual rally outcome and carry no score change;
      // skip emitting a point for those instead of misattributing it.
      if (!pointWinner) continue;

      currentScore[pointWinner] += 1;

      const pointRow: ParsedDataVolleyScoutRow = {
        type: 'point',
        line: azione.endEvent,
        scoutSequence: ++globalSequence,
        rawLine: `${markerFromSide(pointWinner)}p${currentScore.home}:${currentScore.away}`,
        rawCode: `${markerFromSide(pointWinner)}p${currentScore.home}:${currentScore.away}`,
        pointWinnerSide: pointWinner,
        score: { home: currentScore.home, away: currentScore.away },
        setNumber: setNum,
        lineup: initialLineup,
        pointPhase: undefined,
        attackPhase: undefined,
        startCoordinate: undefined,
        midCoordinate: undefined,
        endCoordinate: undefined,
        time: undefined,
        videoFileNumber: undefined,
        videoTime: undefined,
      };
      scoutRows.push(pointRow);
    }

    const trailingNonRally = nonRallyEvents.filter((e) => e.id > lastAzioneEndEventId);
    for (const nrEvent of trailingNonRally) {
      const nrRow = buildNonRallyRow(nrEvent, game.homeTeamId, homeIdToJersey, awayIdToJersey, setNum, ++globalSequence, initialLineup);
      if (nrRow) scoutRows.push(nrRow);
    }

    if (currentScore.home !== homeSetScore || currentScore.away !== awaySetScore) {
      warnings.push({
        severity: 'warning',
        message: `Set ${setNum}: computed score ${currentScore.home}-${currentScore.away} differs from stored score ${homeSetScore}-${awaySetScore}; using stored score.`,
      });
    }

    const endSetRow: ParsedDataVolleyScoutRow = {
      type: 'end_set',
      line: 0,
      scoutSequence: ++globalSequence,
      rawLine: `**${setNum}set`,
      rawCode: `**${setNum}set`,
      endSetNumber: setNum,
      setNumber: setNum,
      lineup: initialLineup,
      pointPhase: undefined,
      attackPhase: undefined,
      startCoordinate: undefined,
      midCoordinate: undefined,
      endCoordinate: undefined,
      time: undefined,
      videoFileNumber: undefined,
      videoTime: undefined,
    };
    scoutRows.push(endSetRow);
  }

  const date = formatTtDate(game.date);
  return {
    metadata: {
      fileType: 'TiebreakTech',
      sourceName: options?.sourceName,
      encoding: 'sqlite',
      date,
      playedAt: date,
      league: league || undefined,
    },
    teams: [homeTeam, awayTeam],
    players,
    sets,
    attackCombinations: [],
    setterCalls: [],
    scoutRows,
    actions,
    warnings,
  };
}

function buildNonRallyRow(
  event: TtEvent,
  homeTeamId: number,
  homeIdToJersey: Map<number, number>,
  awayIdToJersey: Map<number, number>,
  setNumber: number,
  sequence: number,
  lineup: ParsedDataVolleyLineupSnapshot,
): ParsedDataVolleyScoutRow | null {
  const side = teamSideFromId(event.team, homeTeamId);
  const marker = markerFromSide(side);
  const context = {
    setNumber,
    lineup,
    pointPhase: undefined as string | undefined,
    attackPhase: undefined as string | undefined,
    startCoordinate: undefined as string | undefined,
    midCoordinate: undefined as string | undefined,
    endCoordinate: undefined as string | undefined,
    time: undefined as string | undefined,
    videoFileNumber: undefined as string | undefined,
    videoTime: undefined as string | undefined,
  };

  if (event.opOtherType === 1) {
    return {
      ...context,
      type: 'timeout',
      line: event.id,
      scoutSequence: sequence,
      rawLine: `${marker}T`,
      rawCode: `${marker}T`,
      teamSide: side,
      teamMarker: marker,
    };
  }

  if (event.opOtherType === 2 && event.substitutionPlayerIn && event.substitutionPlayerOut) {
    const idToJersey = side === 'home' ? homeIdToJersey : awayIdToJersey;
    const playerIn = idToJersey.get(event.substitutionPlayerIn);
    const playerOut = idToJersey.get(event.substitutionPlayerOut);
    if (playerIn && playerOut) {
      return {
        ...context,
        type: 'substitution',
        line: event.id,
        scoutSequence: sequence,
        rawLine: `${marker}c${playerOut}:${playerIn}`,
        rawCode: `${marker}c${playerOut}:${playerIn}`,
        teamSide: side,
        teamMarker: marker,
        playerOutNumber: playerOut,
        playerInNumber: playerIn,
      };
    }
  }

  return null;
}

function emptyMatch(sourceName: string | undefined, warnings: ParsedImportWarning[]): ParsedDataVolleyMatch {
  return {
    metadata: { fileType: 'TiebreakTech', sourceName },
    teams: [],
    players: [],
    sets: [],
    attackCombinations: [],
    setterCalls: [],
    scoutRows: [],
    actions: [],
    warnings,
  };
}
