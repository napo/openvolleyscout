import type { SkillEvaluation, TeamSide } from '@src/domain/common/enums';
import type {
  ParsedDataVolleyAction,
  ParsedDataVolleyMatch,
  ParsedDataVolleyPlayer,
  ParsedDataVolleyRole,
  ParsedDataVolleyScoutRow,
  ParsedDataVolleySkillCode,
} from '@src/features/import/parser/types';

/**
 * Writes a Tiebreak Tech match database (.db, SQLite) from a parsed
 * DataVolley match: the inverse of import/parser/tiebreak-parser.ts.
 *
 * The parsed match is the common ground: OVS exports DataVolley with
 * rotations, setter positions and scores already worked out per rally, and
 * the same structure is what reading a Tiebreak Tech file produces, so
 * export -> import can be checked against the original.
 *
 * Column meanings were matched against a real Tiebreak Tech file and the
 * DataVolley export of the same match (see the template in
 * tiebreak-template.sql, schema and code tables only).
 */

type SqlValue = number | string | null;

export type SqlJsWritableDatabase = {
  run(sql: string, params?: SqlValue[]): void;
  exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
  export(): Uint8Array;
  close(): void;
};

export type SqlJsWritableStatic = {
  Database: new (data?: ArrayLike<number>) => SqlJsWritableDatabase;
};

const SKILL_TO_FONDAMENTALE: Record<ParsedDataVolleySkillCode, number> = {
  A: 1,
  D: 2,
  B: 3,
  R: 4,
  E: 5,
  S: 6,
  F: 7,
};

const EVALUATION_TO_MARK: Record<SkillEvaluation, number> = {
  '#': 1,
  '+': 2,
  '!': 3,
  '/': 4,
  '-': 5,
  '=': 6,
};

const ROLE_TO_TT_ROLE: Partial<Record<ParsedDataVolleyRole, number>> = {
  setter: 1,
  outside: 2,
  middle: 3,
  libero: 4,
  opposite: 5,
};

/** d_SERVE_type: 1 float, 2 jump float, 3 jump spin. */
const SERVE_TYPE_TO_TT: Record<string, number> = { H: 1, M: 2, Q: 3 };

const OP_TIMEOUT = 1;
const OP_SUBSTITUTION = 2;
const GAME_ID = 1;
const TEAM_IDS: Record<TeamSide, number> = { home: 1, away: 2 };

export interface TiebreakWriteDiagnostic {
  message: string;
  setNumber?: number;
}

export interface TiebreakWriteResult {
  bytes: Uint8Array;
  diagnostics: TiebreakWriteDiagnostic[];
}

function zoneNumber(zone: string | undefined): number | null {
  const value = zone ? parseInt(zone, 10) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** "hh.mm.ss" -> seconds, or null. */
function timeToSeconds(time: string | undefined): number | null {
  const match = time?.match(/^(\d{1,2})[.:](\d{2})[.:](\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function yyyymmdd(date: string | undefined): number | null {
  const match = date?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? Number(`${match[1]}${match[2]}${match[3]}`) : null;
}

function insert(db: SqlJsWritableDatabase, table: string, row: Record<string, SqlValue | boolean | undefined>) {
  const entries = Object.entries(row).filter(([, value]) => value !== undefined);
  const columns = entries.map(([key]) => `"${key}"`).join(', ');
  const placeholders = entries.map(() => '?').join(', ');
  db.run(
    `INSERT INTO "${table}" (${columns}) VALUES (${placeholders})`,
    entries.map(([, value]) => (typeof value === 'boolean' ? (value ? 1 : 0) : value as SqlValue)),
  );
}

export function writeTiebreakDatabase(
  SQL: SqlJsWritableStatic,
  templateSql: string,
  match: ParsedDataVolleyMatch,
): TiebreakWriteResult {
  const diagnostics: TiebreakWriteDiagnostic[] = [];
  const db = new SQL.Database();
  try {
    db.exec(templateSql);
    db.exec('BEGIN');
    writeMatch(db, match, diagnostics);
    db.exec('COMMIT');
    return { bytes: db.export(), diagnostics };
  } finally {
    db.close();
  }
}

function writeMatch(db: SqlJsWritableDatabase, match: ParsedDataVolleyMatch, diagnostics: TiebreakWriteDiagnostic[]) {
  const team = (side: TeamSide) => match.teams.find((entry) => entry.side === side);

  // Teams: the home team is "our team", the one scouted.
  (['home', 'away'] as const).forEach((side) => {
    insert(db, 'team', { id: TEAM_IDS[side], name: team(side)?.name ?? side, ourteam: side === 'home' ? 1 : 0 });
  });

  // Players: Tiebreak Tech keeps the family name in "name" and the given name in "surname".
  const playerIds = new Map<string, number>();
  const liberoIds: Record<TeamSide, number | null> = { home: null, away: null };
  const playerKey = (side: TeamSide, jersey: number) => `${side}:${jersey}`;
  let nextPlayerId = 1;
  let nextConvocazioneId = 1;
  match.players.forEach((player: ParsedDataVolleyPlayer) => {
    const id = nextPlayerId++;
    playerIds.set(playerKey(player.side, player.jerseyNumber), id);
    // role_id is required: 0 (no role) when the match has no tactical roles.
    const role = (player.role ? ROLE_TO_TT_ROLE[player.role] : undefined) ?? (player.isLibero ? ROLE_TO_TT_ROLE.libero! : 0);
    if (role === 0) {
      diagnostics.push({ message: `Player #${player.jerseyNumber} (${player.side}) has no role; written with role 0.` });
    }
    if (player.isLibero && liberoIds[player.side] === null) liberoIds[player.side] = id;
    insert(db, 'player', {
      id,
      name: player.lastName || player.displayName,
      surname: player.firstName,
      current_team: TEAM_IDS[player.side],
      jersey: player.jerseyNumber,
      default_role: role,
      titolare: 0,
    });
    const startingPos = (setNumber: 1 | 2 | 3 | 4 | 5) => {
      const position = player.startingPositions[setNumber];
      return typeof position === 'number' ? position : 0;
    };
    insert(db, 'convocazioni', {
      id: nextConvocazioneId++,
      game_id: GAME_ID,
      team_id: TEAM_IDS[player.side],
      player_id: id,
      jersey: player.jerseyNumber,
      role_id: role,
      starting_pos: startingPos(1),
      captain: player.isCaptain ? 1 : 0,
      starting_pos2: startingPos(2),
      starting_pos3: startingPos(3),
      starting_pos4: startingPos(4),
      starting_pos5: startingPos(5),
      starting_pos6: 0,
      starting_pos7: 0,
      starting_pos8: 0,
      starting_pos9: 0,
      under: 0,
      availability: 0,
    });
  });
  const playerId = (side: TeamSide, jersey: number | undefined) => (
    typeof jersey === 'number' ? playerIds.get(playerKey(side, jersey)) ?? null : null
  );

  const setterCallIds = new Map<string, number>();
  db.exec('SELECT id, descr FROM d_SET_chiamata')[0]?.values.forEach(([id, descr]) => {
    if (typeof descr === 'string' && typeof id === 'number') setterCallIds.set(descr, id);
  });

  const date = yyyymmdd(match.metadata.date ?? match.metadata.playedAt);
  insert(db, 'game', {
    id: GAME_ID,
    home_team: TEAM_IDS.home,
    visitors_team: TEAM_IDS.away,
    homescore: team('home')?.setsWon ?? 0,
    visitorscore: team('away')?.setsWon ?? 0,
    date,
    manifestazione: 0,
  });
  const startSeconds = date && match.metadata.time ? timeToSeconds(match.metadata.time) : null;
  insert(db, 'game_finished', {
    id: GAME_ID,
    open: 0,
    time: date ? Math.round(Date.UTC(
      Math.floor(date / 10000), Math.floor(date / 100) % 100 - 1, date % 100,
    ) / 1000) + (startSeconds ?? 0) : null,
    ourteam_id: TEAM_IDS.home,
    phase: match.metadata.league ?? null,
  });

  // Scout rows, set by set.
  let nextEventId = 1;
  let nextAzioneId = 1;
  let nextRotationId = 1;
  let firstSeconds: number | null = null;
  let lastMs = 0;
  const eventTime = (row: ParsedDataVolleyScoutRow) => {
    const seconds = timeToSeconds(row.time);
    if (seconds !== null && firstSeconds === null) firstSeconds = seconds;
    const ms = seconds !== null && firstSeconds !== null ? (seconds - firstSeconds) * 1000 : lastMs;
    lastMs = Math.max(lastMs, ms);
    return lastMs;
  };

  match.sets.filter((set) => set.played).forEach((set) => {
    const ssetId = set.setNumber;
    const rows = match.scoutRows.filter((row) => row.setNumber === set.setNumber);
    const firstServe = rows.find((row): row is ParsedDataVolleyAction & { type: 'touch' } => (
      row.type === 'touch' && row.dataVolleySkill === 'S'
    ));
    insert(db, 'sset', {
      id: ssetId,
      game: GAME_ID,
      homescore: set.score?.home ?? 0,
      visitorscore: set.score?.away ?? 0,
      duration: set.duration ?? 0,
      homeserve: firstServe?.teamSide === 'home' ? 1 : 0,
      sset_number: set.setNumber,
      open: 0,
    });

    let score = { home: 0, away: 0 };
    let rally: Array<ParsedDataVolleyAction & { type: 'touch' }> = [];
    let rallyAzioneId: number | null = null;
    let rallyFirstEventId: number | null = null;
    let rallyLastEventId: number | null = null;
    let servingTeam: TeamSide | null = firstServe?.teamSide ?? null;

    const setterPositions = (row: ParsedDataVolleyScoutRow, side: TeamSide) => ({
      own: (side === 'home' ? row.lineup.homeSetterPosition : row.lineup.awaySetterPosition) ?? null,
      opponent: (side === 'home' ? row.lineup.awaySetterPosition : row.lineup.homeSetterPosition) ?? null,
    });

    const startRally = (row: ParsedDataVolleyScoutRow, eventId: number) => {
      rallyAzioneId = nextAzioneId++;
      rallyFirstEventId = eventId;
      const lineupIds = (side: TeamSide) => {
        const jerseys = side === 'home' ? row.lineup.home : row.lineup.away;
        return Array.from({ length: 6 }, (_, index) => playerId(side, jerseys[index]));
      };
      const home = lineupIds('home');
      const away = lineupIds('away');
      insert(db, 'rotations', {
        rot_id: nextRotationId++,
        event_id: eventId,
        sset_id: ssetId,
        game_id: GAME_ID,
        pos0: row.lineup.homeSetterPosition ?? null,
        pos1: row.lineup.awaySetterPosition ?? null,
        homeserve: servingTeam === 'home' ? 1 : 0,
        subst: 0,
        forced: 0,
        pl0_1: home[0], pl0_2: home[1], pl0_3: home[2], pl0_4: home[3], pl0_5: home[4], pl0_6: home[5],
        l0: liberoIds.home,
        pl1_1: away[0], pl1_2: away[1], pl1_3: away[2], pl1_4: away[3], pl1_5: away[4], pl1_6: away[5],
        l1: liberoIds.away,
      });
    };

    const writeTouch = (row: ParsedDataVolleyAction & { type: 'touch' }) => {
      const eventId = nextEventId++;
      if (rallyAzioneId === null) startRally(row, eventId);
      rallyLastEventId = eventId;
      const side = row.teamSide;
      const skill = row.dataVolleySkill;
      const setters = setterPositions(row, side);
      const jerseys = side === 'home' ? row.lineup.home : row.lineup.away;
      const courtPosition = typeof row.playerNumber === 'number' && jerseys.indexOf(row.playerNumber) >= 0
        ? jerseys.indexOf(row.playerNumber) + 1
        : null;
      const serve = rally.find((touch) => touch.dataVolleySkill === 'S');
      // The team's reception in this rally, if it received: Tiebreak Tech keeps
      // its grade on the attacks ("mark t-2") and tells side-out attacks
      // (the first after the reception) from transition ones.
      const reception = rally.find((touch) => touch.dataVolleySkill === 'R' && touch.teamSide === side);
      const earlierAttack = rally.some((touch) => touch.dataVolleySkill === 'A' && touch.teamSide === side);
      const isAttack = skill === 'A';
      const setCall = skill === 'E' && row.setCode ? setterCallIds.get(row.setCode) ?? null : null;

      insert(db, 'event', {
        id: eventId,
        sset: ssetId,
        time: eventTime(row),
        homescore: score.home,
        visitorscore: score.away,
        inplay: 1,
        ERROR: 0,
        IP_player: playerId(side, row.playerNumber),
        IP_fondamentale: SKILL_TO_FONDAMENTALE[skill],
        mark: row.evaluation ? EVALUATION_TO_MARK[row.evaluation] : null,
        pos_palleggiatore: setters.own,
        opponent_setterpos: setters.opponent,
        pos_giocatore: skill === 'S' || isAttack
          ? zoneNumber(row.startZone) ?? courtPosition
          : skill === 'R' ? zoneNumber(row.endZone) ?? courtPosition : courtPosition,
        ATT_cono: isAttack ? `${zoneNumber(row.endSubzone ?? row.endZone) ?? ''}:-1:-1:` : null,
        ATT_breakpoint: isAttack ? (reception && !earlierAttack ? 0 : 1) : null,
        SERVE_direction: skill === 'S' ? zoneNumber(row.endZone)
          : skill === 'R' ? zoneNumber(serve?.endZone ?? row.endZone) : null,
        SERVE_type: skill === 'S' && row.skillTypeCode ? SERVE_TYPE_TO_TT[row.skillTypeCode] ?? null : null,
        team: TEAM_IDS[side],
        ERROR_type: 0,
        mark_t_minus_one: isAttack ? 1 : null,
        mark_t_minus_two: isAttack && reception?.evaluation ? EVALUATION_TO_MARK[reception.evaluation] : null,
        azione: rallyAzioneId,
        SET_chiamata: setCall,
      });
      rally.push(row);
    };

    const closeRally = (winner: TeamSide | null) => {
      if (rallyAzioneId !== null && rallyFirstEventId !== null && rallyLastEventId !== null) {
        insert(db, 'azione', {
          id: rallyAzioneId,
          start_event: rallyFirstEventId,
          end_event: rallyLastEventId,
          team_won: winner ? TEAM_IDS[winner] : null,
        });
      }
      rally = [];
      rallyAzioneId = null;
      rallyFirstEventId = null;
      rallyLastEventId = null;
    };

    rows.forEach((row) => {
      if (row.type === 'touch') {
        writeTouch(row);
        return;
      }
      if (row.type === 'point') {
        if (rallyAzioneId === null) {
          diagnostics.push({
            setNumber: set.setNumber,
            message: `Point ${row.score.home}-${row.score.away} has no recorded action; Tiebreak Tech derives points from rallies, so it is not in the file.`,
          });
        }
        closeRally(row.pointWinnerSide);
        score = { ...row.score };
        servingTeam = row.pointWinnerSide;
        return;
      }
      if (row.type === 'substitution' || row.type === 'timeout') {
        const side = row.teamSide;
        const setters = setterPositions(row, side);
        insert(db, 'event', {
          id: nextEventId++,
          sset: ssetId,
          time: eventTime(row),
          homescore: score.home,
          visitorscore: score.away,
          inplay: 0,
          ERROR: 0,
          IP_player: 0,
          IP_fondamentale: 0,
          OP_other_type: row.type === 'timeout' ? OP_TIMEOUT : OP_SUBSTITUTION,
          mark: 0,
          pos_palleggiatore: setters.own,
          opponent_setterpos: setters.opponent,
          team: TEAM_IDS[side],
          SUBSTITUTION_player_in: row.type === 'substitution' ? playerId(side, row.playerInNumber) : null,
          SUBSTITUTION_player_out: row.type === 'substitution' ? playerId(side, row.playerOutNumber) : null,
          ERROR_type: 0,
        });
      }
    });
    // Touches after the last point (an unfinished set) still form a rally.
    closeRally(null);
    if (!set.score) {
      // A set still in progress has no final score yet: keep the one reached.
      db.run('UPDATE sset SET homescore = ?, visitorscore = ?, open = 1 WHERE id = ?', [score.home, score.away, ssetId]);
    }
  });
}
