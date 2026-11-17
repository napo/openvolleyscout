// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { createEmptyMatchProject } from '@src/domain/match/factories';
import type { MatchEvent } from '@src/domain/events/types';
import type { Player } from '@src/domain/roster/types';
import type { CourtPosition } from '@src/domain/common/enums';
import type { StartingLineup } from '@src/domain/lineup/types';
import { replayLiveMatchFromEvents } from '@src/features/scouting/model/replay';
import { exportMatchToDataVolley } from '@src/features/export/datavolley';
import { parseSingleCode } from './code-parser';
import {
  checkInsertedCodeRallyFit,
  deleteTouchFromEventLog,
  insertCodeInEventLog,
  resolveCodeListInsertionContext,
} from './code-list-mutations';

function makePlayer(id: string, jerseyNumber: number, role: Player['role'] = 'outside_hitter'): Player {
  return {
    id,
    firstName: 'Player',
    lastName: `${jerseyNumber}`,
    shortName: `P${jerseyNumber}`,
    playerCode: `P-${jerseyNumber}`,
    jerseyNumber,
    role,
    isCaptain: jerseyNumber === 1,
    isLibero: false,
  };
}

const homePlayers: Player[] = [1, 2, 3, 4, 5, 6].map((n) => makePlayer(`h${n}`, n, n === 1 ? 'setter' : 'outside_hitter'));
const awayPlayers: Player[] = [11, 12, 13, 14, 15, 16].map((n) => makePlayer(`a${n}`, n, n === 11 ? 'setter' : 'outside_hitter'));

function makeLineup(teamSide: 'home' | 'away', players: Player[]): StartingLineup {
  return {
    teamSide,
    displaySide: teamSide === 'home' ? 'left' : 'right',
    setterPlayerId: players[0].id,
    liberoPlayerIds: [],
    slots: ([1, 2, 3, 4, 5, 6] as CourtPosition[]).map((courtPosition, idx) => ({
      courtPosition,
      playerId: players[idx].id,
    })),
  };
}

function makeBaseSetLog(): MatchEvent[] {
  const homeLineup = makeLineup('home', homePlayers);
  const awayLineup = makeLineup('away', awayPlayers);
  return [
    {
      id: 'ev-set-1',
      type: 'set_started',
      setNumber: 1,
      servingTeam: 'home',
      homeLineup,
      awayLineup,
      createdAt: 100,
    },
  ];
}

describe('code-list-mutations', () => {
  it('inserts in the middle, at the end, deletes, rebuilds score/rotation, and matches DVW export', () => {
    // Sequence typed in order: *01SQ+ -> a12RM+ -> a11EM# -> *02AH# -> point home -> rally_ended
    const codes = ['*1SQ+', 'a12RM+', 'a11EM#', '*2AH#'];
    let sequentialLog = makeBaseSetLog();
    codes.forEach((code, idx) => {
      const parsed = parseSingleCode(code);
      expect(parsed.valid).toBe(true);
      sequentialLog = insertCodeInEventLog({
        eventLog: sequentialLog,
        targetEventIndex: null,
        parsed,
        homePlayers,
        awayPlayers,
        now: 1000 + idx * 10,
      });
    });
    sequentialLog.push(
      { id: 'ev-pt', type: 'point_awarded', setNumber: 1, rallyNumber: 1, teamSide: 'home', createdAt: 2000 },
      { id: 'ev-end', type: 'rally_ended', setNumber: 1, rallyNumber: 1, createdAt: 2001 },
    );

    // Now build a log missing a11EM# in the middle and *2AH# at the end, then insert them!
    let editedLog = makeBaseSetLog();
    editedLog = insertCodeInEventLog({
      eventLog: editedLog,
      targetEventIndex: null,
      parsed: parseSingleCode('*1SQ+'),
      homePlayers,
      awayPlayers,
      now: 1000,
    });
    editedLog = insertCodeInEventLog({
      eventLog: editedLog,
      targetEventIndex: null,
      parsed: parseSingleCode('a12RM+'),
      homePlayers,
      awayPlayers,
      now: 1010,
    });
    editedLog.push(
      { id: 'ev-pt', type: 'point_awarded', setNumber: 1, rallyNumber: 1, teamSide: 'home', createdAt: 2000 },
      { id: 'ev-end', type: 'rally_ended', setNumber: 1, rallyNumber: 1, createdAt: 2001 },
    );

    // Insert *2AH# at the end of the rally (targetEventIndex: null puts it before point_awarded)
    editedLog = insertCodeInEventLog({
      eventLog: editedLog,
      targetEventIndex: null,
      parsed: parseSingleCode('*2AH#'),
      homePlayers,
      awayPlayers,
      now: 1030,
    });
    // Insert a11EM# in the middle, before *2AH# (which is at index 3)
    const attackIndex = editedLog.findIndex((e) => e.type === 'touch_recorded' && e.touch.skill === 'attack');
    editedLog = insertCodeInEventLog({
      eventLog: editedLog,
      targetEventIndex: attackIndex,
      parsed: parseSingleCode('a11EM#'),
      homePlayers,
      awayPlayers,
      now: 1020,
    });

    const seqTouches = sequentialLog.filter((e): e is Extract<MatchEvent, { type: 'touch_recorded' }> => e.type === 'touch_recorded');
    const editTouches = editedLog.filter((e): e is Extract<MatchEvent, { type: 'touch_recorded' }> => e.type === 'touch_recorded');
    expect(editTouches.map((e) => [e.touch.skill, e.touch.sequenceNumber])).toEqual(
      seqTouches.map((e) => [e.touch.skill, e.touch.sequenceNumber]),
    );

    // Verify replayLiveMatchFromEvents rebuilds score and rotations identically
    const rebuiltSeq = replayLiveMatchFromEvents('p1', sequentialLog);
    const rebuiltEdit = replayLiveMatchFromEvents('p1', editedLog);
    expect(rebuiltEdit?.homeScore).toBe(rebuiltSeq?.homeScore);
    expect(rebuiltEdit?.awayScore).toBe(rebuiltSeq?.awayScore);
    expect(rebuiltEdit?.homeActiveLineup?.slots).toEqual(rebuiltSeq?.homeActiveLineup?.slots);

    // Verify DVW export matches identical touch lines
    const baseProj = createEmptyMatchProject();
    const projSeq = {
      ...baseProj,
      homeTeam: { ...baseProj.homeTeam, id: 'h', name: 'Home', code: 'HOM', players: homePlayers },
      awayTeam: { ...baseProj.awayTeam, id: 'a', name: 'Away', code: 'AWY', players: awayPlayers },
      events: sequentialLog,
    };

    const projEdit = {
      ...baseProj,
      homeTeam: { ...baseProj.homeTeam, id: 'h', name: 'Home', code: 'HOM', players: homePlayers },
      awayTeam: { ...baseProj.awayTeam, id: 'a', name: 'Away', code: 'AWY', players: awayPlayers },
      events: editedLog,
    };

    const dvwSeq = exportMatchToDataVolley(projSeq).text.split('[3SCOUT]')[1];
    const dvwEdit = exportMatchToDataVolley(projEdit).text.split('[3SCOUT]')[1];
    expect(dvwEdit).toBe(dvwSeq);

    // Verify deleteTouchFromEventLog removes the touch and renumbers remaining sequences
    const setIdx = editedLog.findIndex((e) => e.type === 'touch_recorded' && e.touch.skill === 'set');
    const afterDelete = deleteTouchFromEventLog(editedLog, setIdx);
    const remainingTouches = afterDelete.filter((e): e is Extract<MatchEvent, { type: 'touch_recorded' }> => e.type === 'touch_recorded');
    expect(remainingTouches.map((e) => e.touch.sequenceNumber)).toEqual([1, 2, 3]);
  });

  it('warns non-blockingly when inserting a second serve in the same rally', () => {
    let log = makeBaseSetLog();
    log = insertCodeInEventLog({
      eventLog: log,
      targetEventIndex: null,
      parsed: parseSingleCode('*1SQ+'),
      homePlayers,
      awayPlayers,
      now: 1000,
    });
    const ctx = resolveCodeListInsertionContext(log, null);
    expect(checkInsertedCodeRallyFit(log, ctx, parseSingleCode('*2SQ+'))).toBe('second_serve');
    expect(checkInsertedCodeRallyFit(log, ctx, parseSingleCode('a12RM+'))).toBeNull();
  });
});
