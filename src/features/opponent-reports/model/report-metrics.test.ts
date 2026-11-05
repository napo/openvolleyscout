import { describe, expect, it } from 'vitest';
import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { MatchRosterPlayer } from '@src/domain/match/types';
import type { BallTouch } from '@src/domain/touch/types';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
import { buildTouchCourtContext } from './court-context';
import { computeOpponentReportMetrics } from './report-metrics';

function lineup(side: TeamSide, prefix: string, setterPosition = 1) {
  return {
    teamSide: side,
    setterPlayerId: `${prefix}${setterPosition}`,
    liberoPlayerIds: [],
    displaySide: 'left' as const,
    slots: [1, 2, 3, 4, 5, 6].map((position) => ({ courtPosition: position, playerId: `${prefix}${position}` })),
  };
}

let touchSeq = 0;
function touch(
  setNumber: number,
  rallyNumber: number,
  teamSide: TeamSide,
  playerId: string,
  skill: SkillType,
  evaluation: SkillEvaluation,
  extra: Partial<BallTouch> = {},
): BallTouch {
  touchSeq += 1;
  return { id: `t${touchSeq}`, setNumber, rallyNumber, sequenceNumber: touchSeq, teamSide, playerId, skill, evaluation, createdAt: touchSeq, ...extra };
}

/** Events + rally stats for a list of rallies of set 1. */
function buildMatch(rallies: Array<{ serving: TeamSide; winner: TeamSide; touches: BallTouch[] }>) {
  const events: MatchEvent[] = [{
    id: 'set1', type: 'set_started', setNumber: 1, createdAt: 0,
    homeLineup: lineup('home', 'h'), awayLineup: lineup('away', 'a'), servingTeam: 'home',
  } as MatchEvent];
  const rallyStats: RallyStats[] = rallies.map((rally, index) => {
    rally.touches.forEach((entry) => events.push({ id: `e-${entry.id}`, type: 'touch_recorded', createdAt: entry.createdAt, touch: entry }));
    events.push({ id: `p${index}`, type: 'point_awarded', createdAt: 1000 + index, setNumber: 1, rallyNumber: index + 1, teamSide: rally.winner });
    return {
      setNumber: 1, rallyNumber: index + 1, touches: rally.touches, dataVolleyCode: '',
      servingTeam: rally.serving, pointWinner: rally.winner, terminalReason: null,
    };
  });
  return { events, rallyStats };
}

describe('court context', () => {
  it('follows rotations and substitutions', () => {
    const events: MatchEvent[] = [
      { id: 's', type: 'set_started', setNumber: 1, createdAt: 0, homeLineup: lineup('home', 'h'), awayLineup: lineup('away', 'a'), servingTeam: 'away' } as MatchEvent,
      { id: 'x1', type: 'touch_recorded', createdAt: 1, touch: touch(1, 1, 'home', 'h2', 'receive', '#') },
      { id: 'p1', type: 'point_awarded', createdAt: 2, setNumber: 1, rallyNumber: 1, teamSide: 'home' },
      { id: 'sub', type: 'substitution_made', createdAt: 3, setNumber: 1, teamSide: 'home', playerOutId: 'h3', playerInId: 'h7' },
      { id: 'x2', type: 'touch_recorded', createdAt: 4, touch: touch(1, 2, 'home', 'h7', 'attack', '#') },
      { id: 'x3', type: 'touch_recorded', createdAt: 5, touch: touch(1, 2, 'home', 'h2', 'serve', '+') },
    ];
    const context = buildTouchCourtContext(events);
    const [first, second, third] = events.filter((event) => event.type === 'touch_recorded').map((event) => context.get((event as { touch: BallTouch }).touch.id));
    expect(first).toMatchObject({ rotation: 1, playerPosition: 2 });
    expect(first?.lineup).toEqual(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
    // Side-out: everyone moves one place, the setter from 1 to 6; h3 (now in 2) was replaced by h7.
    expect(second).toMatchObject({ rotation: 6, playerPosition: 2 });
    expect(third).toMatchObject({ rotation: 6, playerPosition: 1 });
    expect(third?.lineup).toEqual(['h2', 'h7', 'h4', 'h5', 'h6', 'h1']);
  });
});

describe('opponent report metrics', () => {
  const roster = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((id, index) => ({
    id, jerseyNumber: index + 1, firstName: '', lastName: `Player${index + 1}`, source: 'manual',
  })) as unknown as MatchRosterPlayer[];

  const { events, rallyStats } = buildMatch([
    // Away (the opponent) receives badly in back row, attacks out.
    { serving: 'home', winner: 'home', touches: [
      touch(1, 1, 'home', 'h1', 'serve', '+'),
      touch(1, 1, 'away', 'a5', 'receive', '-', { endZoneCode: '5' }),
      touch(1, 1, 'away', 'a1', 'set', '+'),
      touch(1, 1, 'away', 'a4', 'attack', '='),
    ] },
    // Perfect reception by a front-row receiver who then scores herself: side-out.
    { serving: 'home', winner: 'away', touches: [
      touch(1, 2, 'home', 'h1', 'serve', '-'),
      touch(1, 2, 'away', 'a2', 'receive', '#', { endZoneCode: '1' }),
      touch(1, 2, 'away', 'a1', 'set', '#'),
      touch(1, 2, 'away', 'a2', 'attack', '#'),
    ] },
    // Away now serves (rotated: setter in 6) and misses.
    { serving: 'away', winner: 'home', touches: [touch(1, 3, 'away', 'a2', 'serve', '=')] },
  ]);

  const metrics = computeOpponentReportMetrics([{
    matchId: 'm1', side: 'away', events, rallies: rallyStats, roster,
    rotationStats: [{ rotationNumber: 1, sideOutAttempts: 2, sideOutWins: 1, sideOutPercentage: 0.5, breakPointAttempts: 0, breakPointWins: 0, breakPointPercentage: null, pointsScored: 1, pointsConceded: 1 }],
  }]);

  it('counts the sample and the starting rotation', () => {
    expect(metrics.sample).toEqual({ matches: 1, sets: 1, rallies: 3 });
    expect(metrics.startingRotations).toEqual([{ matchId: 'm1', setNumber: 1, rotation: 1, serving: false }]);
    expect(metrics.startingRotationCounts[1]).toEqual({ serve: 0, receive: 1 });
    expect(metrics.rotations.find((row) => row.rotation === 1)?.sideOut).toEqual({ count: 1, total: 2, rate: 0.5 });
  });

  it('measures reception per receiver and per rotation', () => {
    const byName = Object.fromEntries(metrics.receivers.map((row) => [row.player.name, row.positive]));
    expect(byName.Player2).toEqual({ count: 1, total: 1, rate: 1 });
    expect(byName.Player5).toEqual({ count: 0, total: 1, rate: 0 });
    expect(metrics.receptionTeam.positive.rate).toBe(0.5);
    expect(metrics.rotations.find((row) => row.rotation === 1)?.receptionPositive.total).toBe(2);
  });

  it('follows the first ball after reception, and the front-row receiver', () => {
    const perfect = metrics.firstBall.find((row) => row.evaluation === '#')!;
    expect(perfect.kill.rate).toBe(1);
    expect(perfect.sideOut.rate).toBe(1);
    const poor = metrics.firstBall.find((row) => row.evaluation === '-')!;
    expect(poor.attackLost.rate).toBe(1);
    expect(metrics.positiveReception.receiverFrontRow.total).toBe(1);
    expect(metrics.positiveReception.frontRowReceiverAttacks.kill.rate).toBe(1);
    expect(metrics.positiveReception.receiverBackRow.total).toBe(0);
  });

  it('counts direct errors and suggests the weakest receiver as serve target', () => {
    const errors = Object.fromEntries(metrics.errors.map((row) => [row.player.name, row]));
    expect(errors.Player2.serve).toEqual({ count: 1, total: 1, rate: 1 });
    expect(errors.Player4.attack).toEqual({ count: 1, total: 1, rate: 1 });
    expect(metrics.serveTargets).toEqual([expect.objectContaining({ rotation: 1, zone: '5', zoneShare: 1 })]);
    expect(metrics.serveTargets[0].player.name).toBe('Player5');
  });

  it('records who stood where when receiving in each rotation', () => {
    const rotationOne = metrics.receptionLineups.find((row) => row.rotation === 1)!;
    expect(rotationOne.receptions).toBe(2);
    expect(rotationOne.slots.map((slot) => slot.player?.name)).toEqual(['Player1', 'Player2', 'Player3', 'Player4', 'Player5', 'Player6']);
    expect(rotationOne.slots[0].share).toBe(1);
  });

  it('chooses serve targets only among receivers with enough receptions', () => {
    const strict = computeOpponentReportMetrics([{
      matchId: 'm1', side: 'away', events, rallies: rallyStats, roster, rotationStats: [],
    }], { minReceptions: 2 });
    expect(strict.serveTargets).toEqual([]);
  });
});
