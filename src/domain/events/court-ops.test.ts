// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { TeamSide } from '../common/enums';
import type { StartingLineup } from '../lineup';
import type { BallTouch } from '../touch/types';
import type { MatchEvent } from './types';
import { canonicalPointEventIds, createCourtOpsReader } from './court-ops';
import { buildMatchStats } from '../../features/scouting/model/match-stats';
import { buildRallyRotations } from '../../features/scouting/model/rally-rotations';
import { buildPlayByPlay } from '../../features/analytics/play-by-play/play-by-play';
import { buildVideoEventIndex } from '../../features/analysis/video/video-event-index';
import { buildTouchCourtContext } from '../../features/opponent-reports/model/court-context';

const lineup = (teamSide: TeamSide): StartingLineup => ({
  teamSide,
  setterPlayerId: `${teamSide}-1`,
  liberoPlayerIds: [],
  displaySide: teamSide === 'home' ? 'left' : 'right',
  slots: [1, 2, 3, 4, 5, 6].map((position) => ({ playerId: `${teamSide}-${position}`, courtPosition: position as 1 })),
});
const start: MatchEvent = { id: 'start', type: 'set_started', setNumber: 1, servingTeam: 'home', homeLineup: lineup('home'), awayLineup: lineup('away'), createdAt: 0 };
const point = (rallyNumber: number, teamSide: TeamSide, extra: Partial<Extract<MatchEvent, { type: 'point_awarded' }>> = {}): MatchEvent => (
  { id: `p${rallyNumber}`, type: 'point_awarded', setNumber: 1, rallyNumber, teamSide, createdAt: rallyNumber * 10, ...extra }
);
const redCard = (rallyNumber: number, teamSide: TeamSide): MatchEvent => (
  { id: `rc${rallyNumber}`, type: 'red_card_point', setNumber: 1, rallyNumber, teamSide, penalizedTeamSide: teamSide === 'home' ? 'away' : 'home', reason: 'red_card', createdAt: rallyNumber * 10 }
);
const correction = (rallyNumber: number, teamSide: TeamSide, kind: Extract<MatchEvent, { type: 'manual_correction' }>['correction']): MatchEvent => (
  { id: `mc${rallyNumber}-${kind}`, type: 'manual_correction', setNumber: 1, rallyNumber, teamSide, correction: kind, createdAt: rallyNumber * 10 }
);
const touch = (rallyNumber: number, teamSide: TeamSide): MatchEvent => {
  const ballTouch: BallTouch = { id: `t${rallyNumber}`, setNumber: 1, rallyNumber, sequenceNumber: 1, teamSide, playerId: `${teamSide}-2`, skill: 'attack', evaluation: '+', createdAt: rallyNumber * 10 - 5 };
  return { id: `e${rallyNumber}`, type: 'touch_recorded', createdAt: ballTouch.createdAt, touch: ballTouch };
};

describe('court operations of the event log', () => {
  it('a side-out point scores, rotates the winner and gives the serve; a break point only scores', () => {
    const court = createCourtOpsReader();
    court.read(start);
    expect(court.read(point(1, 'away'))).toEqual([
      { kind: 'score', teamSide: 'away', delta: 1 },
      { kind: 'rotate', teamSide: 'away', direction: 'forward' },
      { kind: 'serve', teamSide: 'away' },
    ]);
    expect(court.read(point(2, 'away')).map((op) => op.kind)).toEqual(['score', 'serve']);
    expect(court.score).toEqual({ home: 0, away: 2 });
    expect(court.servingTeam).toBe('away');
  });

  it('a red-card point is a point like the others; a point marked without rotation does not rotate', () => {
    const court = createCourtOpsReader();
    court.read(start);
    expect(court.read(redCard(1, 'away')).map((op) => op.kind)).toEqual(['score', 'rotate', 'serve']);
    expect(court.read(point(2, 'home', { skipRotation: true })).map((op) => op.kind)).toEqual(['score', 'serve']);
    expect(court.read(point(3, 'away'), { skipRotation: true }).map((op) => op.kind)).toEqual(['score', 'serve']);
    expect(court.score).toEqual({ home: 1, away: 2 });
  });

  it('manual corrections move the score, the rotation or the serve, never below zero', () => {
    const court = createCourtOpsReader();
    court.read(start);
    expect(court.read(correction(1, 'home', 'point_removed'))).toEqual([{ kind: 'score', teamSide: 'home', delta: -1 }]);
    expect(court.score).toEqual({ home: 0, away: 0 });
    court.read(correction(1, 'home', 'point_added'));
    expect(court.read(correction(1, 'away', 'rotation_backward'))).toEqual([{ kind: 'rotate', teamSide: 'away', direction: 'backward' }]);
    court.read(correction(1, 'away', 'serve_assigned'));
    expect(court.score).toEqual({ home: 1, away: 0 });
    expect(court.servingTeam).toBe('away');
  });

  it('keeps the latest point of a rally when the log holds more than one', () => {
    const first = point(1, 'home');
    const again: MatchEvent = { ...point(1, 'away'), id: 'p1-again', createdAt: 99 };
    expect([...canonicalPointEventIds([start, first, again, point(2, 'home')])].sort()).toEqual(['p1-again', 'p2']);
  });
});

describe('the rotation is the same in every view', () => {
  // Away side-outs (rotates), a red-card point to home (rotates home), a point without rotation,
  // a manual rotation back and a serve given by hand: the cases where the views used to disagree.
  const events: MatchEvent[] = [
    start,
    touch(1, 'away'), point(1, 'away'),
    touch(2, 'away'), point(2, 'away'),
    redCard(3, 'home'),
    touch(4, 'home'), point(4, 'away', { skipRotation: true }),
    correction(5, 'home', 'rotation_backward'),
    correction(5, 'home', 'serve_assigned'),
    touch(6, 'away'), point(6, 'away'),
    touch(7, 'home'), point(7, 'home'),
    touch(8, 'home'),
  ];
  const expected: Record<number, { home: number; away: number }> = {
    1: { home: 1, away: 1 },
    2: { home: 1, away: 6 },
    4: { home: 6, away: 6 },
    6: { home: 1, away: 6 },
    7: { home: 1, away: 5 },
    8: { home: 6, away: 5 },
  };

  it('match report', () => {
    const rotations = buildRallyRotations(events);
    for (const [rally, value] of Object.entries(expected)) expect(rotations.get(`1:${rally}`), `rally ${rally}`).toEqual(value);
  });

  it('Video analysis, with the score before each rally', () => {
    const entries = buildVideoEventIndex(events).entries;
    for (const entry of entries) {
      expect({ home: entry.homeSetterPosition, away: entry.awaySetterPosition }, `rally ${entry.rallyNumber}`).toEqual(expected[entry.rallyNumber]);
    }
    expect(entries.map((entry) => `${entry.homeScore}-${entry.awayScore}`)).toEqual(['0-0', '0-1', '1-2', '1-3', '1-4', '2-4']);
    expect(entries.map((entry) => entry.servingTeam)).toEqual(['home', 'away', 'home', 'home', 'away', 'home']);
  });

  it('opponent reports', () => {
    const context = buildTouchCourtContext(events);
    for (const event of events) {
      if (event.type !== 'touch_recorded') continue;
      expect(context.get(event.touch.id)?.rotation, `rally ${event.touch.rallyNumber}`).toBe(expected[event.touch.rallyNumber][event.touch.teamSide]);
    }
  });

  it('play by play', () => {
    const touches = events.flatMap((event) => (event.type === 'touch_recorded' ? [event.touch] : []));
    const team = (id: TeamSide) => ({ id, code: id, name: id, players: [], staff: { headCoach: '', assistantCoach: '' } });
    const stats = buildMatchStats({ homeTeam: team('home'), awayTeam: team('away'), eventLog: events, touches });
    const rows = buildPlayByPlay(stats, events)[0].rows.filter((row) => row.kind === 'point');
    for (const row of rows) expect(row.rotations, `rally ${row.rallyNumber}`).toEqual(expected[row.rallyNumber as number]);
    expect(rows.at(-1)).toMatchObject({ homeScore: 2, awayScore: 4 });
  });
});
