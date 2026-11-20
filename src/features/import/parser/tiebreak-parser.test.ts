// SPDX-License-Identifier: AGPL-3.0-or-later

import { readFileSync } from 'fs';
import { resolve } from 'path';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { parseTiebreakFromDb } from './tiebreak-parser';
import { mapDataVolleyMatchToOvsProject } from '../mapping';
import { writeTiebreakDatabase, type SqlJsWritableDatabase, type SqlJsWritableStatic } from '@src/features/export/tiebreak/tiebreak-writer';
import type { ParsedDataVolleyMatch } from './types';

const TEMPLATE_SQL = readFileSync(
  resolve(__dirname, '../../export/tiebreak/tiebreak-template.sql'),
  'utf8',
);

async function getSql(): Promise<SqlJsWritableStatic> {
  return await initSqlJs() as unknown as SqlJsWritableStatic;
}

type SyntheticOptions = {
  withVideoFile?: boolean;
};

function buildSyntheticTiebreakDb(SQL: SqlJsWritableStatic, options: SyntheticOptions = {}): SqlJsWritableDatabase {
  const db = new SQL.Database();
  db.exec(TEMPLATE_SQL);

  // Two invented teams.
  db.run('INSERT INTO team (id, name, ourteam) VALUES (?, ?, ?)', [1, 'Aurora Volley', 1]);
  db.run('INSERT INTO team (id, name, ourteam) VALUES (?, ?, ?)', [2, 'Boreal Club', 0]);

  // 8 players per team: 6 starters, 1 bench substitute, 1 libero.
  // Remember: Tiebreak Tech stores family name in "name" and given name in "surname".
  const homePlayers = [
    { id: 101, surname: 'Elena', name: 'Rinaldi', jersey: 4, role: 1, pos1: 1, captain: 1 },
    { id: 102, surname: 'Sofia', name: 'Conti', jersey: 7, role: 2, pos1: 2, captain: 0 },
    { id: 103, surname: 'Marta', name: 'Bellini', jersey: 9, role: 3, pos1: 3, captain: 0 },
    { id: 104, surname: 'Chiara', name: 'De Luca', jersey: 11, role: 5, pos1: 4, captain: 0 },
    { id: 105, surname: 'Giulia', name: 'Moretti', jersey: 14, role: 2, pos1: 5, captain: 0 },
    { id: 106, surname: 'Alice', name: 'Ferraro', jersey: 16, role: 3, pos1: 6, captain: 0 },
    { id: 107, surname: 'Nora', name: 'Greco', jersey: 18, role: 2, pos1: 0, captain: 0 }, // substitute
    { id: 108, surname: 'Vera', name: 'Lombardi', jersey: 2, role: 4, pos1: 0, captain: 0 }, // libero
  ];

  const awayPlayers = [
    { id: 201, surname: 'Klara', name: 'Novak', jersey: 1, role: 1, pos1: 1, captain: 1 },
    { id: 202, surname: 'Hanna', name: 'Keller', jersey: 5, role: 2, pos1: 2, captain: 0 },
    { id: 203, surname: 'Lina', name: 'Bauer', jersey: 8, role: 3, pos1: 3, captain: 0 },
    { id: 204, surname: 'Mila', name: 'Vogel', jersey: 10, role: 5, pos1: 4, captain: 0 },
    { id: 205, surname: 'Tessa', name: 'Weber', jersey: 12, role: 2, pos1: 5, captain: 0 },
    { id: 206, surname: 'Ines', name: 'Krause', jersey: 15, role: 3, pos1: 6, captain: 0 },
    { id: 207, surname: 'Dora', name: 'Richter', jersey: 19, role: 2, pos1: 0, captain: 0 }, // substitute
    { id: 208, surname: 'Sonia', name: 'Berger', jersey: 3, role: 4, pos1: 0, captain: 0 }, // libero
  ];

  let convId = 1;
  for (const [teamId, roster] of [[1, homePlayers], [2, awayPlayers]] as const) {
    for (const p of roster) {
      db.run(
        'INSERT INTO player (id, name, surname, current_team, jersey, default_role, titolare) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [p.id, p.name, p.surname, teamId, p.jersey, p.role, p.pos1 > 0 ? 1 : 0],
      );
      db.run(
        `INSERT INTO convocazioni (
          id, game_id, team_id, player_id, jersey, role_id,
          starting_pos, captain, starting_pos2, starting_pos3, starting_pos4, starting_pos5
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0)`,
        [convId++, 1, teamId, p.id, p.jersey, p.role, p.pos1, p.captain],
      );
    }
  }

  db.run('INSERT OR REPLACE INTO manifestazione (id, descr) VALUES (?, ?)', [999, 'Synthetic Cup']);
  db.run(
    'INSERT INTO game (id, home_team, visitors_team, homescore, visitorscore, date, manifestazione) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [1, 1, 2, 1, 0, 20260412, 999],
  );
  db.run(
    'INSERT INTO game_finished (id, open, time, ourteam_id, video_file) VALUES (?, ?, ?, ?, ?)',
    [1, 0, 1775990400, 1, options.withVideoFile ? 'synthetic_match.mp4' : ''],
  );

  // 1 set, 8 rallies, final score 5-3.
  db.run(
    'INSERT INTO sset (id, game, homescore, visitorscore, duration, homeserve, sset_number, open) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [1, 1, 5, 3, 18, 1, 1, 0],
  );

  const insertEvent = (row: {
    id: number;
    time: number;
    homeScore: number;
    visitorScore: number;
    team: number;
    player?: number | null;
    fondamentale?: number | null;
    opOther?: number | null;
    mark?: number | null;
    posSetter?: number;
    oppSetter?: number;
    posPlayer?: number | null;
    attCono?: string | null;
    attType?: number | null;
    serveType?: number | null;
    serveFrom?: number | null;
    serveDir?: number | null;
    numBlockers?: number | null;
    blockNumPlayers?: number | null;
    setChiamata?: number | null;
    subIn?: number | null;
    subOut?: number | null;
    azione?: number | null;
  }) => {
    db.run(
      `INSERT INTO event (
        id, sset, time, homescore, visitorscore, inplay, ERROR,
        IP_player, IP_fondamentale, OP_other_type, mark,
        pos_palleggiatore, opponent_setterpos, pos_giocatore,
        ATT_cono, ATT_type, SERVE_type, SERVE_from, SERVE_direction,
        num_giocatori_muro, BLOCK_num_players, SET_chiamata,
        team, SUBSTITUTION_player_in, SUBSTITUTION_player_out,
        azione, ERROR_type
      ) VALUES (?, 1, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        row.id,
        row.time,
        row.homeScore,
        row.visitorScore,
        row.azione ? 1 : 0,
        row.player ?? null,
        row.fondamentale ?? null,
        row.opOther ?? null,
        row.mark ?? null,
        row.posSetter ?? 1,
        row.oppSetter ?? 1,
        row.posPlayer ?? null,
        row.attCono ?? null,
        row.attType ?? null,
        row.serveType ?? null,
        row.serveFrom ?? null,
        row.serveDir ?? null,
        row.numBlockers ?? null,
        row.blockNumPlayers ?? null,
        row.setChiamata ?? null,
        row.team,
        row.subIn ?? null,
        row.subOut ?? null,
        row.azione ?? null,
      ],
    );
  };

  const insertAzione = (id: number, startEvent: number, endEvent: number, teamWon: number) => {
    db.run(
      'INSERT INTO azione (id, start_event, end_event, team_won) VALUES (?, ?, ?, ?)',
      [id, startEvent, endEvent, teamWon],
    );
  };

  // Rally 1 (0-0 -> 1-0 home): serve from zone 1, reception by libero (#3 away), set, attack ATT_type=1, block kill by home.
  // Timestamps in HHMMSSmmm: 01:02:03.456 -> 10203456
  insertEvent({ id: 1, time: 10203456, homeScore: 0, visitorScore: 0, team: 1, player: 101, fondamentale: 6, mark: 2, posPlayer: 1, serveType: 2, serveFrom: 1, serveDir: 6, azione: 1 });
  insertEvent({ id: 2, time: 10205120, homeScore: 0, visitorScore: 0, team: 2, player: 208, fondamentale: 4, mark: 1, posPlayer: 6, azione: 1 }); // away libero swap in back row
  insertEvent({ id: 3, time: 10206500, homeScore: 0, visitorScore: 0, team: 2, player: 201, fondamentale: 5, mark: 2, posPlayer: 2, setChiamata: 1, azione: 1 });
  insertEvent({ id: 4, time: 10207800, homeScore: 0, visitorScore: 0, team: 2, player: 202, fondamentale: 1, mark: 4, posPlayer: 4, attCono: '5:120:340:1', attType: 1, numBlockers: 2, azione: 1 });
  insertEvent({ id: 5, time: 10208200, homeScore: 0, visitorScore: 0, team: 1, player: 103, fondamentale: 3, mark: 1, posPlayer: 3, blockNumPlayers: 2, azione: 1 });
  insertAzione(1, 1, 5, 1);

  // Rally 2 (1-0 -> 1-1 away): serve from zone 5, reception, set, attack ATT_type=2 (soft/tip) kill.
  insertEvent({ id: 6, time: 10220000, homeScore: 1, visitorScore: 0, team: 1, player: 101, fondamentale: 6, mark: 3, posPlayer: 1, serveType: 1, serveFrom: 5, serveDir: 5, azione: 2 });
  insertEvent({ id: 7, time: 10221500, homeScore: 1, visitorScore: 0, team: 2, player: 205, fondamentale: 4, mark: 2, posPlayer: 5, azione: 2 });
  insertEvent({ id: 8, time: 10222900, homeScore: 1, visitorScore: 0, team: 2, player: 201, fondamentale: 5, mark: 1, posPlayer: 2, azione: 2 });
  insertEvent({ id: 9, time: 10224100, homeScore: 1, visitorScore: 0, team: 2, player: 204, fondamentale: 1, mark: 1, posPlayer: 2, attCono: '3:200:250:6', attType: 2, numBlockers: 1, azione: 2 });
  insertAzione(2, 6, 9, 2);

  // Rally 3 (1-1 -> 2-1 home): serve from zone 6, home libero (#2) reception, set, attack ATT_type=3 (lob), dig, counter-attack ATT_type=5.
  insertEvent({ id: 10, time: 10240000, homeScore: 1, visitorScore: 1, team: 2, player: 202, fondamentale: 6, mark: 2, posPlayer: 1, serveType: 3, serveFrom: 6, serveDir: 1, azione: 3 });
  insertEvent({ id: 11, time: 10241200, homeScore: 1, visitorScore: 1, team: 1, player: 108, fondamentale: 4, mark: 1, posPlayer: 1, azione: 3 }); // home libero swap
  insertEvent({ id: 12, time: 10242400, homeScore: 1, visitorScore: 1, team: 1, player: 101, fondamentale: 5, mark: 2, posPlayer: 2, azione: 3 });
  insertEvent({ id: 13, time: 10243600, homeScore: 1, visitorScore: 1, team: 1, player: 102, fondamentale: 1, mark: 2, posPlayer: 4, attCono: '2:180:290:5', attType: 3, numBlockers: 3, azione: 3 });
  insertEvent({ id: 14, time: 10244800, homeScore: 1, visitorScore: 1, team: 2, player: 208, fondamentale: 2, mark: 2, posPlayer: 5, azione: 3 });
  insertEvent({ id: 15, time: 10246000, homeScore: 1, visitorScore: 1, team: 1, player: 104, fondamentale: 1, mark: 1, posPlayer: 2, attCono: '6:310:190:9', attType: 5, numBlockers: 0, azione: 3 });
  insertAzione(3, 10, 15, 1);

  // Substitution before Rally 4: home #18 (107) in for #7 (102).
  insertEvent({ id: 16, time: 10255000, homeScore: 2, visitorScore: 1, team: 1, opOther: 2, subIn: 107, subOut: 102 });

  // Rally 4 (2-1 -> 3-1 home): serve from zone 7 (ace!).
  insertEvent({ id: 17, time: 10305000, homeScore: 2, visitorScore: 1, team: 1, player: 107, fondamentale: 6, mark: 1, posPlayer: 1, serveType: 3, serveFrom: 7, serveDir: 5, azione: 4 });
  insertEvent({ id: 18, time: 10306000, homeScore: 2, visitorScore: 1, team: 2, player: 202, fondamentale: 4, mark: 6, posPlayer: 5, azione: 4 });
  insertAzione(4, 17, 18, 1);

  // Rally 5 (3-1 -> 3-2 away): serve from zone 9, reception, attack ATT_type=6 kill.
  insertEvent({ id: 19, time: 10320000, homeScore: 3, visitorScore: 1, team: 1, player: 107, fondamentale: 6, mark: 3, posPlayer: 1, serveType: 2, serveFrom: 9, serveDir: 1, azione: 5 });
  insertEvent({ id: 20, time: 10321500, homeScore: 3, visitorScore: 1, team: 2, player: 208, fondamentale: 4, mark: 2, posPlayer: 1, azione: 5 });
  insertEvent({ id: 21, time: 10323000, homeScore: 3, visitorScore: 1, team: 2, player: 205, fondamentale: 1, mark: 1, posPlayer: 4, attCono: '4:220:300:6', attType: 6, numBlockers: 2, azione: 5 });
  insertAzione(5, 19, 21, 2);

  // Rally 6 (3-2 -> 4-2 home): timestamp uses millisecond fallback (175000 has ss=75 >= 60 -> 175s = 00.02.55).
  insertEvent({ id: 22, time: 175000, homeScore: 3, visitorScore: 2, team: 2, player: 203, fondamentale: 6, mark: 5, posPlayer: 1, serveType: 1, serveFrom: 1, serveDir: 6, azione: 6 });
  insertEvent({ id: 23, time: 176500, homeScore: 3, visitorScore: 2, team: 1, player: 105, fondamentale: 4, mark: 1, posPlayer: 6, azione: 6 });
  insertEvent({ id: 24, time: 178000, homeScore: 3, visitorScore: 2, team: 1, player: 103, fondamentale: 1, mark: 1, posPlayer: 3, attCono: '1:150:200:5', attType: 1, numBlockers: 1, azione: 6 });
  insertAzione(6, 22, 24, 1);

  // Rally 7 (4-2 -> 4-3 away): serve error.
  insertEvent({ id: 25, time: 23125623, homeScore: 4, visitorScore: 2, team: 1, player: 103, fondamentale: 6, mark: 6, posPlayer: 1, serveType: 1, serveFrom: 6, serveDir: 1, azione: 7 });
  insertAzione(7, 25, 25, 2);

  // Rally 8 (4-3 -> 5-3 home): serve, reception, dig, attack kill.
  insertEvent({ id: 26, time: 23140000, homeScore: 4, visitorScore: 3, team: 2, player: 204, fondamentale: 6, mark: 2, posPlayer: 1, serveType: 2, serveFrom: 5, serveDir: 5, azione: 8 });
  insertEvent({ id: 27, time: 23141200, homeScore: 4, visitorScore: 3, team: 1, player: 108, fondamentale: 4, mark: 2, posPlayer: 5, azione: 8 });
  insertEvent({ id: 28, time: 23142500, homeScore: 4, visitorScore: 3, team: 1, player: 107, fondamentale: 1, mark: 1, posPlayer: 4, attCono: '7:260:330:1', attType: 1, numBlockers: 2, azione: 8 });
  insertAzione(8, 26, 28, 1);

  return db;
}

function summarizeTouches(match: ParsedDataVolleyMatch) {
  return match.actions.map((a) => ({
    setNumber: a.setNumber,
    teamSide: a.teamSide,
    playerNumber: a.playerNumber,
    skill: a.dataVolleySkill,
    evaluation: a.evaluation,
    startZone: a.startZone,
    endZone: a.endZone,
    endSubzone: a.endSubzone,
    playersCode: a.playersCode,
    skillTypeCode: a.skillTypeCode,
  }));
}

describe('Tiebreak Tech importer (tiebreak-parser)', () => {
  it('parses teams, rosters, libero, substitution, serves, receptions, attacks, blocks, and digs from a synthetic DB', async () => {
    const SQL = await getSql();
    const db = buildSyntheticTiebreakDb(SQL, { withVideoFile: true });
    let parsed: ParsedDataVolleyMatch;
    try {
      parsed = parseTiebreakFromDb(db as never, { sourceName: 'synthetic.db' });
    } finally {
      db.close();
    }

    expect(parsed.warnings).toEqual([]);
    expect(parsed.teams.map((t) => [t.side, t.name, t.setsWon])).toEqual([
      ['home', 'Aurora Volley', 1],
      ['away', 'Boreal Club', 0],
    ]);
    expect(parsed.sets).toHaveLength(1);
    expect(parsed.sets[0].score).toEqual({ home: 5, away: 3 });

    // Libero players identified on both rosters.
    const homeLibero = parsed.players.find((p) => p.side === 'home' && p.jerseyNumber === 2);
    const awayLibero = parsed.players.find((p) => p.side === 'away' && p.jerseyNumber === 3);
    expect(homeLibero?.isLibero).toBe(true);
    expect(awayLibero?.isLibero).toBe(true);
    expect(homeLibero?.firstName).toBe('Vera');
    expect(homeLibero?.lastName).toBe('Lombardi');

    // Substitution row emitted for #7 -> #18.
    const subs = parsed.scoutRows.filter((r) => r.type === 'substitution');
    expect(subs).toHaveLength(1);
    if (subs[0].type === 'substitution') {
      expect(subs[0].teamSide).toBe('home');
      expect(subs[0].playerOutNumber).toBe(7);
      expect(subs[0].playerInNumber).toBe(18);
    }

    // Serve start zones come from SERVE_from (1, 5, 6, 7, 9) and NOT pos_giocatore (always 1).
    const serves = parsed.actions.filter((a) => a.dataVolleySkill === 'S');
    expect(serves.map((s) => s.startZone)).toEqual(['1', '5', '6', '7', '9', '1', '6', '5']);

    // Receptions carry the rally's serve start zone and keep receiver zone as endZone.
    const receptions = parsed.actions.filter((a) => a.dataVolleySkill === 'R');
    expect(receptions.map((r) => [r.startZone, r.endZone])).toEqual([
      ['1', '6'],
      ['5', '5'],
      ['6', '1'],
      ['7', '5'],
      ['9', '1'],
      ['1', '6'],
      ['5', '5'],
    ]);

    // Attack cone, targetZone, ATT_type (1, 2, 3, 5, 6 -> H, P, T, T, H), and blockers count.
    const attacks = parsed.actions.filter((a) => a.dataVolleySkill === 'A');
    expect(attacks.map((a) => ({
      cone: a.endSubzone,
      target: a.endZone,
      type: a.skillTypeCode,
      subtype: a.skillSubtypeCode,
      blockers: a.playersCode,
    }))).toEqual([
      { cone: '5', target: '1', type: 'H', subtype: 'H', blockers: '2' },
      { cone: '3', target: '6', type: 'P', subtype: 'P', blockers: '1' },
      { cone: '2', target: '5', type: 'T', subtype: 'T', blockers: '3' },
      { cone: '6', target: '9', type: 'T', subtype: 'T', blockers: '0' },
      { cone: '4', target: '6', type: 'H', subtype: 'H', blockers: '2' },
      { cone: '1', target: '5', type: 'H', subtype: 'H', blockers: '1' },
      { cone: '7', target: '1', type: 'H', subtype: 'H', blockers: '2' },
    ]);

    // Block and dig are parsed with blockers count on block.
    const blocks = parsed.actions.filter((a) => a.dataVolleySkill === 'B');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].playersCode).toBe('2');

    const digs = parsed.actions.filter((a) => a.dataVolleySkill === 'D');
    expect(digs).toHaveLength(1);
    expect(digs[0].playerNumber).toBe(3);
  });

  it('decodes HHMMSSmmm timestamps, falls back to linear milliseconds, and sets video-synced fields only when video_file is present', async () => {
    const SQL = await getSql();

    const withVideoDb = buildSyntheticTiebreakDb(SQL, { withVideoFile: true });
    let withVideo: ParsedDataVolleyMatch;
    try {
      withVideo = parseTiebreakFromDb(withVideoDb as never);
    } finally {
      withVideoDb.close();
    }

    // Event 1: 10203456 -> 01:02:03 -> 3723s
    const event1 = withVideo.actions.find((a) => a.line === 1)!;
    expect(event1.time).toBe('01.02.03');
    expect(event1.videoFileNumber).toBe('1');
    expect(event1.videoTime).toBe(String(1 * 3600 + 2 * 60 + 3));

    // Event 22: 175000 -> ss=75 >= 60 -> millisecond fallback -> 175s -> 00.02.55
    const event22 = withVideo.actions.find((a) => a.line === 22)!;
    expect(event22.time).toBe('00.02.55');
    expect(event22.videoFileNumber).toBe('1');
    expect(event22.videoTime).toBe('175');

    // Event 25: 23125623 -> 02:31:25 -> 9085s
    const event25 = withVideo.actions.find((a) => a.line === 25)!;
    expect(event25.time).toBe('02.31.25');
    expect(event25.videoTime).toBe('9085');

    // Without video_file: time is still decoded, but videoFileNumber and videoTime are undefined.
    const noVideoDb = buildSyntheticTiebreakDb(SQL, { withVideoFile: false });
    let noVideo: ParsedDataVolleyMatch;
    try {
      noVideo = parseTiebreakFromDb(noVideoDb as never);
    } finally {
      noVideoDb.close();
    }
    const noVideoEvent1 = noVideo.actions.find((a) => a.line === 1)!;
    expect(noVideoEvent1.time).toBe('01.02.03');
    expect(noVideoEvent1.videoFileNumber).toBeUndefined();
    expect(noVideoEvent1.videoTime).toBeUndefined();
  });

  it('generates ball directions for serves, receptions, and attacks when mapped to an OVS project', async () => {
    const SQL = await getSql();
    const db = buildSyntheticTiebreakDb(SQL);
    let parsed: ParsedDataVolleyMatch;
    try {
      parsed = parseTiebreakFromDb(db as never);
    } finally {
      db.close();
    }

    const { project } = mapDataVolleyMatchToOvsProject(parsed, {});
    const directedEvents = project.events.filter(
      (e) => e.type === 'touch_recorded' && (e.touch.skill === 'serve' || e.touch.skill === 'receive' || e.touch.skill === 'attack'),
    );
    const withDirection = directedEvents.filter((e) => e.type === 'touch_recorded' && e.touch.ballDirection);
    expect(directedEvents.length).toBeGreaterThan(0);
    expect(withDirection.length).toBe(directedEvents.length);
  });

  it('round-trips synthetic Tiebreak DB through export and re-import with identical touches', async () => {
    const SQL = await getSql();
    const db = buildSyntheticTiebreakDb(SQL);
    let firstImport: ParsedDataVolleyMatch;
    try {
      firstImport = parseTiebreakFromDb(db as never);
    } finally {
      db.close();
    }

    const { bytes } = writeTiebreakDatabase(SQL, TEMPLATE_SQL, firstImport);
    const reimportDb = new SQL.Database(bytes);
    let secondImport: ParsedDataVolleyMatch;
    try {
      secondImport = parseTiebreakFromDb(reimportDb as never);
    } finally {
      reimportDb.close();
    }

    expect(secondImport.warnings).toEqual([]);
    expect(secondImport.sets.map((s) => s.score)).toEqual(firstImport.sets.map((s) => s.score));
    expect(summarizeTouches(secondImport)).toEqual(summarizeTouches(firstImport));
  });
});
