import { readFileSync } from 'fs';
import { resolve } from 'path';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import type { ParsedDataVolleyMatch } from '@src/features/import/parser/types';
import { parseDataVolleyFile } from '@src/features/import/parser/datavolley-parser';
import { parseTiebreakFromDb } from '@src/features/import/parser/tiebreak-parser';
import { mapDataVolleyMatchToOvsProject } from '@src/features/import';
import { exportMatchToDataVolley } from '@src/features/export/datavolley';
import { writeTiebreakDatabase, type SqlJsWritableStatic } from './tiebreak-writer';

const ROOT = resolve(__dirname, '../../../..');
const TEMPLATE = readFileSync(resolve(__dirname, 'tiebreak-template.sql'), 'utf8');
const REAL_DB = resolve(ROOT, "docs/2026-05-09 - - Rit - G 26 - Serie B2 Vs CARTIERA DELL'ADDA LC - 0-3.db");

async function sql() {
  return await initSqlJs() as unknown as SqlJsWritableStatic;
}

async function readTiebreak(bytes: Uint8Array): Promise<ParsedDataVolleyMatch> {
  const SQL = await sql();
  const db = new SQL.Database(bytes);
  try {
    return parseTiebreakFromDb(db as never);
  } finally {
    db.close();
  }
}

/** What both files must agree on: who did what, how well, set by set. */
function actionSummary(match: ParsedDataVolleyMatch) {
  return match.actions
    .filter((action) => typeof action.playerNumber === 'number')
    .map((action) => [
      action.setNumber,
      action.teamSide,
      action.playerNumber,
      action.dataVolleySkill,
      action.evaluation,
      // Tiebreak Tech serve types are float, jump float and jump spin only:
      // any other serve type is read back as float (H).
      action.dataVolleySkill === 'S' ? (['M', 'Q'].includes(action.skillTypeCode ?? '') ? action.skillTypeCode : 'H') : '',
    ].join(':'));
}

function pointSummary(match: ParsedDataVolleyMatch) {
  return match.scoutRows
    .filter((row) => row.type === 'point')
    .map((row) => (row.type === 'point' ? `${row.setNumber}:${row.score.home}-${row.score.away}` : ''));
}

function playerSummary(match: ParsedDataVolleyMatch) {
  return match.players
    .map((player) => `${player.side}:${player.jerseyNumber}:${player.lastName}:${player.firstName}:${player.role}:${player.isCaptain}:${JSON.stringify(player.startingPositions)}`)
    .sort();
}

describe('Tiebreak Tech export', () => {
  it('a real Tiebreak Tech file survives read -> write -> read', async () => {
    const original = await readTiebreak(new Uint8Array(readFileSync(REAL_DB)));
    const { bytes } = writeTiebreakDatabase(await sql(), TEMPLATE, original);
    const copy = await readTiebreak(bytes);

    expect(copy.teams.map((team) => [team.name, team.setsWon])).toEqual(original.teams.map((team) => [team.name, team.setsWon]));
    expect(copy.sets.map((set) => set.score)).toEqual(original.sets.map((set) => set.score));
    expect(playerSummary(copy)).toEqual(playerSummary(original));
    expect(actionSummary(copy)).toEqual(actionSummary(original));
    expect(pointSummary(copy)).toEqual(pointSummary(original));
    // The original already warns about the placeholder set Tiebreak Tech leaves behind.
    expect(copy.warnings).toEqual(original.warnings);
  });

  it('reads the family name from "name" and the given name from "surname"', async () => {
    const original = await readTiebreak(new Uint8Array(readFileSync(REAL_DB)));
    // Same player as the DataVolley export of this match: Perghem Aurora, #3.
    const player = original.players.find((entry) => entry.side === 'home' && entry.jerseyNumber === 3);
    expect([player?.lastName, player?.firstName]).toEqual(['Perghem', 'Aurora']);
  });

  it('an OVS match exports to Tiebreak Tech with the same actions and score', async () => {
    const text = readFileSync(resolve(ROOT, 'public/samples/new_test.dvw'), 'latin1');
    const project = mapDataVolleyMatchToOvsProject(parseDataVolleyFile(text), {}).project;
    const dataVolley = parseDataVolleyFile(exportMatchToDataVolley(project).text);

    const { bytes } = writeTiebreakDatabase(await sql(), TEMPLATE, dataVolley);
    const tiebreak = await readTiebreak(bytes);

    expect(tiebreak.sets.map((set) => set.score)).toEqual(dataVolley.sets.filter((set) => set.played).map((set) => set.score));
    expect(actionSummary(tiebreak)).toEqual(actionSummary(dataVolley));
    expect(pointSummary(tiebreak)).toEqual(pointSummary(dataVolley));
  });
});
