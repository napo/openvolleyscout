import { describe, expect, it } from 'vitest';
import type { BallTouch } from '@src/domain/touch/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { MatchRosterPlayer } from '@src/domain/match/types';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
import { computeAttackingReportMetrics } from './attacking-metrics';

const roster = [
  { id: 'a1', jerseyNumber: 1, firstName: 'Sara', lastName: 'Setter', role: 'setter', source: 'manual_entry' },
  { id: 'a4', jerseyNumber: 4, firstName: 'Anna', lastName: 'Hitter', role: 'outside_hitter', source: 'manual_entry' },
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

function match(rallies: RallyStats[]) {
  const events: MatchEvent[] = [{
    id: 'set-1',
    type: 'set_started',
    setNumber: 1,
    createdAt: 0,
    homeLineup: { teamSide: 'home', setterPlayerId: 'h1', liberoPlayerIds: [], displaySide: 'left', slots: [] },
    awayLineup: { teamSide: 'away', setterPlayerId: 'a1', liberoPlayerIds: [], displaySide: 'right', slots: [] },
    servingTeam: 'home',
  } as MatchEvent];
  return {
    matchId: 'm1',
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
    const rallies: RallyStats[] = [{
      setNumber: 1,
      rallyNumber: 1,
      touches,
      dataVolleyCode: '',
      servingTeam: 'home',
      pointWinner: 'away',
      terminalReason: null,
    }];
    const setter = computeAttackingReportMetrics([match(rallies)]).setters[0];
    expect(setter.player.jersey).toBe('1');
    expect(setter.rotations[0]).toMatchObject({
      rotation: 3,
      attempts: 1,
      predictableTarget: 'zone4',
      predictability: 1,
      receptionEvaluations: [{ value: '+', count: 1, matches: 1 }],
      serveBallTypes: [{ value: 'M', count: 1, matches: 1 }],
    });
  });
});
