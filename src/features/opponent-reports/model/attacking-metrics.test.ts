import { describe, expect, it } from 'vitest';
import type { BallTouch } from '@src/domain/touch/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { MatchRosterPlayer } from '@src/domain/match/types';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
import { computeAttackingReportMetrics } from './attacking-metrics';

const roster = [
  { id: 'a1', jerseyNumber: 1, firstName: 'Sara', lastName: 'Setter', role: 'setter', source: 'manual_entry' },
  { id: 'a4', jerseyNumber: 4, firstName: 'Anna', lastName: 'Hitter', role: 'outside_hitter', source: 'manual_entry' },
  { id: 'a2', jerseyNumber: 2, firstName: 'Mia', lastName: 'Setter', role: 'setter', source: 'manual_entry' },
] as MatchRosterPlayer[];

function touch(
  id: string,
  sequenceNumber: number,
  playerId: string,
  skill: BallTouch['skill'],
  evaluation: BallTouch['evaluation'],
  extra: Partial<BallTouch> = {},
): BallTouch {
  return {
    id,
    setNumber: 1,
    rallyNumber: 1,
    sequenceNumber,
    teamSide: 'away',
    playerId,
    skill,
    evaluation,
    createdAt: sequenceNumber,
    ...extra,
  };
}

function match(rallies: RallyStats[], matchId = 'm1', setterPlayerId = 'a1') {
  const events: MatchEvent[] = [{
    id: 'set-1',
    type: 'set_started',
    setNumber: 1,
    createdAt: 0,
    homeLineup: { teamSide: 'home', setterPlayerId: 'h1', liberoPlayerIds: [], displaySide: 'left', slots: [] },
    awayLineup: { teamSide: 'away', setterPlayerId, liberoPlayerIds: [], displaySide: 'right', slots: [] },
    servingTeam: 'home',
  } as MatchEvent];
  return {
    matchId,
    side: 'away' as const,
    events,
    rallies,
    rotationStats: [],
    roster,
  };
}

describe('opponent attacking metrics', () => {
  it('separates phase, difficult reception, late-set and attack evaluation with attack type', () => {
    const touches = [
      touch('serve', 1, 'h1', 'serve', '+', { teamSide: 'home' }),
      touch('receive', 2, 'a4', 'receive', '-', { awaySetterPosition: 2 }),
      touch('set', 3, 'a1', 'set', '+', { advancedDetails: { set: { tempo: 'high_ball' } } }),
      touch('attack', 4, 'a4', 'attack', '!', {
        startZoneCode: '5',
        advancedDetails: { attack: { type: 'tip', tempo: 'high_ball', direction: 'cross' } },
      }),
    ];
    const rallies: RallyStats[] = Array.from({ length: 20 }, (_, index) => ({
      setNumber: 1,
      rallyNumber: index + 1,
      touches: [],
      dataVolleyCode: '',
      servingTeam: 'home',
      pointWinner: 'home',
      terminalReason: null,
    }));
    for (const [index, evaluation] of (['!', '-'] as const).entries()) {
      rallies.push({
        setNumber: 1,
        rallyNumber: 21 + index,
        touches: touches.map((entry) => ({
          ...entry,
          id: `${entry.id}-${index}`,
          rallyNumber: 21 + index,
          ...(entry.skill === 'attack'
            ? {
              evaluation,
              advancedDetails: { attack: { type: index === 0 ? 'tip' : 'power', tempo: 'high_ball', direction: 'cross' } },
            }
            : {}),
        })),
        dataVolleyCode: '',
        servingTeam: 'home',
        pointWinner: 'away',
        terminalReason: null,
      });
    }

    const result = computeAttackingReportMetrics([match(rallies)]);
    const attacker = result.attackers.find((entry) => entry.player.jersey === '4')!;
    expect(attacker.all.attacks).toBe(2);
    expect(attacker.afterReceive.attacks).toBe(2);
    expect(attacker.afterNegativeReception.attacks).toBe(2);
    expect(attacker.highBall.attacks).toBe(2);
    expect(attacker.lateSet.attacks).toBe(2);
    expect(attacker.evaluationBang.types).toEqual([{ value: 'tip', count: 1, matches: 1 }]);
    expect(attacker.evaluationMinus.types).toEqual([{ value: 'power', count: 1, matches: 1 }]);
    expect(attacker.evaluationBang.directions).toEqual([{ value: 'cross', count: 1, matches: 1 }]);
    expect(attacker.all.zones).toEqual([{ value: '5', count: 2, matches: 1 }]);
  });

  it('aggregates setter target distribution and predictability per rotation', () => {
    const touches = [
      touch('serve', 1, 'h1', 'serve', '+', { teamSide: 'home' }),
      touch('receive', 2, 'a4', 'receive', '+', { awaySetterPosition: 3, skillTypeCode: 'M' }),
      touch('set', 3, 'a1', 'set', '+'),
      touch('attack', 4, 'a4', 'attack', '#', { startZoneCode: '4', attackType: 'power' }),
    ];
    const rallies: RallyStats[] = [1, 2].map((rallyNumber) => ({
      setNumber: 1,
      rallyNumber,
      touches: touches.map((entry) => ({
        ...entry,
        id: `${entry.id}-${rallyNumber}`,
        rallyNumber,
        ...(entry.skill === 'receive' && rallyNumber === 2 ? { evaluation: '#' as const } : {}),
      })),
      dataVolleyCode: '',
      servingTeam: 'home',
      pointWinner: 'away',
      terminalReason: null,
    }));
    const secondMatchRallies = rallies.map((rally) => ({
      ...rally,
      touches: rally.touches.map((entry) => ({
        ...entry,
        id: `${entry.id}-second-match`,
        playerId: entry.skill === 'set' ? 'a2' : entry.playerId,
      })),
    }));
    const rotation = computeAttackingReportMetrics([
      match(rallies),
      match(secondMatchRallies, 'm2', 'a2'),
    ]).setterRotations[0];
    expect(rotation).toMatchObject({
      rotation: 3,
      attempts: 4,
      matches: 2,
      predictableTarget: 'zone4',
      predictability: 1,
      receptionEvaluations: [
        { value: '#', count: 2, matches: 2 },
        { value: '+', count: 2, matches: 2 },
      ],
      serveBallTypes: [{ value: 'M', count: 4, matches: 2 }],
    });
    expect(rotation.firstBallMatches).toBe(2);
    expect(rotation.firstBallByReception).toMatchObject([
      {
        evaluation: '#',
        attempts: 2,
        matches: 2,
        targets: [{ value: 'zone4', count: 2, matches: 2 }],
      },
      {
        evaluation: '+',
        attempts: 2,
        matches: 2,
        targets: [{ value: 'zone4', count: 2, matches: 2 }],
      },
    ]);
  });
});
