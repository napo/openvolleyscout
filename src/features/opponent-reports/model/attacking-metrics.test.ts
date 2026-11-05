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
  const events: MatchEvent[] = [
    {
      id: 'set-1',
      type: 'set_started',
      setNumber: 1,
      createdAt: 0,
      homeLineup: { teamSide: 'home', setterPlayerId: 'h1', liberoPlayerIds: [], displaySide: 'left', slots: [] },
      awayLineup: { teamSide: 'away', setterPlayerId, liberoPlayerIds: [], displaySide: 'right', slots: [] },
      servingTeam: 'home',
    } as MatchEvent,
    ...rallies.flatMap((rally) => rally.touches.map((entry) => ({
      id: `event-${entry.id}`,
      type: 'touch_recorded' as const,
      createdAt: entry.createdAt,
      touch: entry,
    }))),
  ];
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

  it('aggregates first attacks by setter, rotation, reception band, zone and attacker', () => {
    const receptionScenarios = [
      { evaluation: '+', setter: 'a1', zone: '4', attack: '#', rallyNumber: 1 },
      { evaluation: '#', setter: 'a1', zone: '4', attack: '!', rallyNumber: 2 },
      { evaluation: '!', setter: 'a2', zone: '5', attack: '#', rallyNumber: 3 },
      { evaluation: '-', setter: 'a2', zone: '5', attack: '-', rallyNumber: 4 },
    ] as const;
    const rallies: RallyStats[] = receptionScenarios.map((scenario) => ({
      setNumber: 1,
      rallyNumber: scenario.rallyNumber,
      touches: [
        touch(`serve-${scenario.rallyNumber}`, 1, 'h1', 'serve', '+', { teamSide: 'home' }),
        touch(`receive-${scenario.rallyNumber}`, 2, 'a4', 'receive', scenario.evaluation, {
          awaySetterPosition: 3,
          skillTypeCode: 'M',
        }),
        touch(`set-${scenario.rallyNumber}`, 3, scenario.setter, 'set', '+'),
        touch(`attack-${scenario.rallyNumber}`, 4, 'a4', 'attack', scenario.attack, {
          startZoneCode: scenario.zone,
          attackType: 'power',
        }),
      ],
      dataVolleyCode: '',
      servingTeam: 'home',
      pointWinner: 'away',
      terminalReason: null,
    }));
    const repeatedPositiveRallies = rallies.slice(0, 2).map((rally) => ({
      ...rally,
      rallyNumber: rally.rallyNumber + 10,
      touches: rally.touches.map((entry) => ({
        ...entry,
        id: `${entry.id}-second-match`,
        rallyNumber: entry.rallyNumber + 10,
      })),
    }));
    const setters = computeAttackingReportMetrics([
      match(rallies.slice(0, 2), 'm1', 'a1'),
      match(rallies.slice(2), 'm2', 'a2'),
      match(repeatedPositiveRallies, 'm3', 'a1'),
    ]).setters;
    const setterOne = setters.find((entry) => entry.player.jersey === '1')!;
    const setterTwo = setters.find((entry) => entry.player.jersey === '2')!;

    expect(setters.map((entry) => entry.player.jersey)).toEqual(['1', '2']);
    expect(setterOne.rotations[0]).toMatchObject({
      rotation: 3,
      preferredPositiveZone: 4,
      positive: {
        attempts: 4,
        matches: 2,
        zones: [{
          zone: 4,
          attempts: 4,
          kills: 2,
          matches: 2,
          players: [{ player: { jersey: '4' }, attempts: 4, kills: 2, matches: 2 }],
        }],
      },
      negative: { attempts: 0, matches: 0, zones: [] },
    });
    expect(setterTwo.rotations[0]).toMatchObject({
      rotation: 3,
      preferredPositiveZone: null,
      positive: { attempts: 0, matches: 0, zones: [] },
      negative: {
        attempts: 2,
        matches: 1,
        zones: [{
          zone: 5,
          attempts: 2,
          kills: 1,
          players: [{ player: { jersey: '4' }, attempts: 2, kills: 1 }],
        }],
      },
    });
  });

  it('uses the setter assigned on court when the set touch is missing', () => {
    const rallies: RallyStats[] = [{
      setNumber: 1,
      rallyNumber: 1,
      touches: [
        touch('serve', 1, 'h1', 'serve', '+', { teamSide: 'home' }),
        touch('receive', 2, 'a4', 'receive', '+', { awaySetterPosition: 3 }),
        touch('attack', 3, 'a4', 'attack', '#', { startZoneCode: '4' }),
      ],
      dataVolleyCode: '',
      servingTeam: 'home',
      pointWinner: 'away',
      terminalReason: null,
    }];

    const metrics = computeAttackingReportMetrics([match(rallies, 'm1', 'a2')]);
    expect(metrics.setters.map((entry) => entry.player.jersey)).toEqual(['2']);
  });

  it('does not mistake an emergency set touch for the active setter', () => {
    const rallies: RallyStats[] = [{
      setNumber: 1,
      rallyNumber: 1,
      touches: [
        touch('serve', 1, 'h1', 'serve', '+', { teamSide: 'home' }),
        touch('receive', 2, 'a4', 'receive', '+', { awaySetterPosition: 3 }),
        touch('set', 3, 'a4', 'set', '!'),
        touch('attack', 4, 'a4', 'attack', '#', { startZoneCode: '4' }),
      ],
      dataVolleyCode: '',
      servingTeam: 'home',
      pointWinner: 'away',
      terminalReason: null,
    }];

    const metrics = computeAttackingReportMetrics([match(rallies, 'm1', 'a2')]);
    expect(metrics.setters.map((entry) => entry.player.jersey)).toEqual(['2']);
  });
});
