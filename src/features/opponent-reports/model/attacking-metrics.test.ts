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
  { id: 'a3', jerseyNumber: 3, firstName: 'Chiara', lastName: 'Middle', role: 'middle_blocker', source: 'manual_entry' },
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
      awayLineup: {
        teamSide: 'away',
        setterPlayerId,
        liberoPlayerIds: [],
        displaySide: 'right',
        slots: [
          { courtPosition: 1, playerId: 'away-1' },
          { courtPosition: 2, playerId: 'away-2' },
          { courtPosition: 3, playerId: setterPlayerId },
          { courtPosition: 4, playerId: 'a4' },
          { courtPosition: 5, playerId: 'away-5' },
          { courtPosition: 6, playerId: 'away-6' },
        ],
      },
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
    expect(attacker.clutch.attacks).toBe(2);
    expect(attacker.evaluationBang.types).toEqual([{ value: 'tip', count: 1, matches: 1 }]);
    expect(attacker.evaluationMinus.types).toEqual([{ value: 'power', count: 1, matches: 1 }]);
    expect(attacker.evaluationBang.directions).toEqual([{ value: 'cross', count: 1, matches: 1 }]);
    expect(attacker.all.zones).toEqual([{ value: '5', count: 2, matches: 1 }]);
  });

  it('excludes setter attacks from the after-receive player split', () => {
    const rallies: RallyStats[] = [{
      setNumber: 1,
      rallyNumber: 1,
      touches: [
        touch('serve', 1, 'h1', 'serve', '+', { teamSide: 'home' }),
        touch('receive', 2, 'a4', 'receive', '+', { awaySetterPosition: 3 }),
        touch('set', 3, 'a1', 'set', '+'),
        touch('setter-attack', 4, 'a1', 'attack', '#', { startZoneCode: '4' }),
        touch('hitter-attack', 5, 'a4', 'attack', '#', { startZoneCode: '2' }),
      ],
      dataVolleyCode: '',
      servingTeam: 'home',
      pointWinner: 'away',
      terminalReason: null,
    }];

    const result = computeAttackingReportMetrics([match(rallies)]);
    const setter = result.attackers.find((entry) => entry.player.jersey === '1')!;
    const hitter = result.attackers.find((entry) => entry.player.jersey === '4')!;

    expect(setter.all.attacks).toBe(1);
    expect(setter.afterReceive.attacks).toBe(0);
    expect(hitter.afterReceive.attacks).toBe(1);
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
        topZone: 4,
        predictability: { count: 4, total: 4, rate: 1 },
        zones: [{
          zone: 4,
          attempts: 4,
          kills: 2,
          matches: 2,
          players: [{ player: { jersey: '4' }, attempts: 4, kills: 2, matches: 2 }],
        }],
      },
      negative: { attempts: 0, matches: 0, topZone: null, predictability: { count: 0, total: 0, rate: null }, zones: [] },
    });
    expect(setterTwo.rotations[0]).toMatchObject({
      rotation: 3,
      preferredPositiveZone: null,
      positive: { attempts: 0, matches: 0, topZone: null, predictability: { count: 0, total: 0, rate: null }, zones: [] },
      negative: {
        attempts: 2,
        matches: 1,
        topZone: 5,
        predictability: { count: 2, total: 2, rate: 1 },
        zones: [{
          zone: 5,
          attempts: 2,
          kills: 1,
          players: [{ player: { jersey: '4' }, attempts: 2, kills: 1 }],
        }],
      },
    });
  });

  it('sorts setters by court exposure before jersey order', () => {
    const lowExposure = [{
      setNumber: 1,
      rallyNumber: 1,
      touches: [
        touch('serve-1', 1, 'h1', 'serve', '+', { teamSide: 'home' }),
        touch('receive-1', 2, 'a4', 'receive', '+', { awaySetterPosition: 3 }),
        touch('set-1', 3, 'a1', 'set', '+'),
        touch('attack-1', 4, 'a4', 'attack', '#', { startZoneCode: '4' }),
      ],
      dataVolleyCode: '',
      servingTeam: 'home',
      pointWinner: 'away',
      terminalReason: null,
    }] as RallyStats[];
    const highExposure = Array.from({ length: 3 }, (_, index) => ({
      setNumber: 1,
      rallyNumber: index + 1,
      touches: [
        touch(`serve-${index + 1}`, 1, 'h1', 'serve', '+', { teamSide: 'home' }),
        touch(`receive-${index + 1}`, 2, 'a4', 'receive', '+', { awaySetterPosition: 3 }),
        touch(`set-${index + 1}`, 3, 'a2', 'set', '+'),
        touch(`attack-${index + 1}`, 4, 'a4', 'attack', '#', { startZoneCode: '4' }),
      ],
      dataVolleyCode: '',
      servingTeam: 'home',
      pointWinner: 'away',
      terminalReason: null,
    })) as RallyStats[];

    const metrics = computeAttackingReportMetrics([
      match(lowExposure, 'm1', 'a1'),
      match(highExposure, 'm2', 'a2'),
    ]);

    expect(metrics.setters.map((entry) => entry.player.jersey)).toEqual(['2', '1']);
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

  it('uses the setter ID recorded for the reception P position', () => {
    const rallies: RallyStats[] = [{
      setNumber: 1,
      rallyNumber: 1,
      touches: [
        touch('serve', 1, 'h1', 'serve', '+', { teamSide: 'home' }),
        touch('receive', 2, 'a4', 'receive', '+', {
          awaySetterPosition: 3,
          awaySetterPlayerId: 'a2',
        }),
        touch('set', 3, 'a1', 'set', '+'),
        touch('attack', 4, 'a4', 'attack', '#', { startZoneCode: '4' }),
      ],
      dataVolleyCode: '',
      servingTeam: 'home',
      pointWinner: 'away',
      terminalReason: null,
    }];

    const metrics = computeAttackingReportMetrics([match(rallies, 'm1', 'a1')]);

    expect(metrics.setters.map((entry) => entry.player.jersey)).toEqual(['2']);
  });

  it('does not mistake an emergency set touch for the active setter', () => {
    const rallies: RallyStats[] = [{
      setNumber: 1,
      rallyNumber: 1,
      touches: [
        touch('serve', 1, 'h1', 'serve', '+', { teamSide: 'home' }),
        touch('receive', 2, 'a4', 'receive', '+', { awaySetterPosition: 3 }),
        touch('set', 3, 'a1', 'set', '!'),
        touch('attack', 4, 'a4', 'attack', '#', { startZoneCode: '4' }),
      ],
      dataVolleyCode: '',
      servingTeam: 'home',
      pointWinner: 'away',
      terminalReason: null,
    }];

    const fixture = match(rallies, 'm1', 'a2');
    const started = fixture.events.find((event) => event.type === 'set_started');
    if (started?.type === 'set_started') {
      started.awayLineup.slots = [
        { courtPosition: 1, playerId: 'away-1' },
        { courtPosition: 2, playerId: 'a1' },
        { courtPosition: 3, playerId: 'a2' },
        { courtPosition: 4, playerId: 'a4' },
        { courtPosition: 5, playerId: 'away-5' },
        { courtPosition: 6, playerId: 'away-6' },
      ];
    }

    const metrics = computeAttackingReportMetrics([fixture]);
    expect(metrics.setters.map((entry) => entry.player.jersey)).toEqual(['2']);
  });

  it('switches setter attribution to the substitute who enters the court', () => {
    const makeRally = (rallyNumber: number, sequenceStart: number, setterId: string | null): RallyStats => ({
      setNumber: 1,
      rallyNumber,
      touches: [
        touch(`serve-${rallyNumber}`, sequenceStart, 'h1', 'serve', '+', { teamSide: 'home', rallyNumber }),
        touch(`receive-${rallyNumber}`, sequenceStart + 1, 'a4', 'receive', '+', { awaySetterPosition: 3, rallyNumber }),
        ...(setterId ? [touch(`set-${rallyNumber}`, sequenceStart + 2, setterId, 'set', '+', { rallyNumber })] : []),
        touch(`attack-${rallyNumber}`, sequenceStart + (setterId ? 3 : 2), 'a4', 'attack', '#', { startZoneCode: '4', rallyNumber }),
      ],
      dataVolleyCode: '',
      servingTeam: 'home',
      pointWinner: 'away',
      terminalReason: null,
    });
    const rallies = [makeRally(1, 1, 'a1'), makeRally(2, 6, null)];
    const fixture = match(rallies);
    fixture.roster = fixture.roster.map((player) => (
      { ...player, role: undefined }
    ));
    fixture.events.splice(1 + rallies[0].touches.length, 0, {
      id: 'setter-substitution',
      type: 'substitution_made',
      createdAt: 5,
      setNumber: 1,
      rallyNumber: 2,
      teamSide: 'away',
      playerOutId: 'a1',
      playerInId: 'a2',
    });

    const metrics = computeAttackingReportMetrics([fixture]);
    expect(metrics.setters.map((entry) => entry.player.jersey).sort()).toEqual(['1', '2']);
    expect(metrics.setters.map((entry) => entry.rotations[0].positive.attempts)).toEqual([1, 1]);
  });

  it('uses the setter identity resolved from the DVW row lineup snapshot', () => {
    const rally: RallyStats = {
      setNumber: 1,
      rallyNumber: 1,
      touches: [
        touch('serve', 1, 'h1', 'serve', '+', { teamSide: 'home' }),
        touch('receive', 2, 'a4', 'receive', '+', { awaySetterPosition: 3, awaySetterPlayerId: 'a2' }),
        touch('set', 3, 'a1', 'set', '+'),
        touch('attack', 4, 'a4', 'attack', '#', { startZoneCode: '4' }),
      ],
      dataVolleyCode: '',
      servingTeam: 'home',
      pointWinner: 'away',
      terminalReason: null,
    };
    const fixture = match([rally], 'm1', 'a1');
    fixture.roster = fixture.roster.map((player) => ({ ...player, role: undefined }));
    const started = fixture.events.find((event) => event.type === 'set_started');
    if (started?.type === 'set_started') {
      started.awayLineup.slots = [
        { courtPosition: 1, playerId: 'away-1' },
        { courtPosition: 2, playerId: 'a1' },
        { courtPosition: 3, playerId: 'a2' },
        { courtPosition: 4, playerId: 'a4' },
        { courtPosition: 5, playerId: 'away-5' },
        { courtPosition: 6, playerId: 'away-6' },
      ];
    }

    const metrics = computeAttackingReportMetrics([fixture]);
    expect(metrics.setters.map((entry) => entry.player.jersey)).toEqual(['2']);
  });

  it('infers block-out from attack kill followed by opponent block error and tip from P code', () => {
    const rallies: RallyStats[] = [
      {
        setNumber: 1,
        rallyNumber: 1,
        touches: [
          touch('serve-1', 1, 'h1', 'serve', '+', { teamSide: 'home' }),
          touch('receive-1', 2, 'a4', 'receive', '+', { awaySetterPosition: 3 }),
          touch('set-1', 3, 'a1', 'set', '+'),
          touch('attack-1', 4, 'a4', 'attack', '#', { startZoneCode: '4' }),
          touch('block-1', 5, 'h1', 'block', '=', { teamSide: 'home' }),
        ],
        dataVolleyCode: '',
        servingTeam: 'home',
        pointWinner: 'away',
        terminalReason: null,
      },
      {
        setNumber: 1,
        rallyNumber: 2,
        touches: [
          touch('serve-2', 1, 'h1', 'serve', '+', { teamSide: 'home', rallyNumber: 2 }),
          touch('receive-2', 2, 'a4', 'receive', '+', { awaySetterPosition: 3, rallyNumber: 2 }),
          touch('set-2', 3, 'a1', 'set', '+', { rallyNumber: 2 }),
          touch('attack-2', 4, 'a4', 'attack', '#', { startZoneCode: '4', attackType: 'P', rallyNumber: 2 }),
        ],
        dataVolleyCode: '',
        servingTeam: 'home',
        pointWinner: 'away',
        terminalReason: null,
      },
    ];

    const result = computeAttackingReportMetrics([match(rallies)]);
    const attacker = result.attackers.find((entry) => entry.player.jersey === '4')!;
    expect(attacker.all.types).toEqual([
      { value: 'block_out', count: 1, matches: 1 },
      { value: 'tip', count: 1, matches: 1 },
    ]);
  });

  it('never attributes side-out distribution to a middle blocker even if rotation slot or sub points to her', () => {
    const rallies: RallyStats[] = [{
      setNumber: 1,
      rallyNumber: 1,
      touches: [
        touch('serve', 1, 'h1', 'serve', '+', { teamSide: 'home' }),
        touch('receive', 2, 'a4', 'receive', '+', {
          awaySetterPosition: 3,
          awaySetterPlayerId: 'a3',
        }),
        touch('set', 3, 'a1', 'set', '+'),
        touch('attack', 4, 'a4', 'attack', '#', { startZoneCode: '4' }),
      ],
      dataVolleyCode: '',
      servingTeam: 'home',
      pointWinner: 'away',
      terminalReason: null,
    }];
    const fixture = match(rallies, 'm1', 'a1');
    const started = fixture.events.find((event) => event.type === 'set_started');
    if (started?.type === 'set_started') {
      started.awayLineup.slots = [
        { courtPosition: 1, playerId: 'a1' },
        { courtPosition: 2, playerId: 'away-2' },
        { courtPosition: 3, playerId: 'a3' },
        { courtPosition: 4, playerId: 'a4' },
        { courtPosition: 5, playerId: 'away-5' },
        { courtPosition: 6, playerId: 'away-6' },
      ];
    }
    fixture.events.splice(1, 0, {
      id: 'sub-mb',
      type: 'substitution_made',
      createdAt: 0,
      setNumber: 1,
      rallyNumber: 1,
      teamSide: 'away',
      playerOutId: 'a2',
      playerInId: 'a3',
    });

    const metrics = computeAttackingReportMetrics([fixture]);
    expect(metrics.setters.map((entry) => entry.player.jersey)).toEqual(['1']);
  });

  it('ranks the primary setter first even when her roster role is not explicitly setter while backup has setter role', () => {
    const makeRally = (rallyNumber: number, sequenceStart: number): RallyStats => ({
      setNumber: 1,
      rallyNumber,
      touches: [
        touch(`serve-${rallyNumber}`, sequenceStart, 'h1', 'serve', '+', { teamSide: 'home', rallyNumber }),
        touch(`receive-${rallyNumber}`, sequenceStart + 1, 'a4', 'receive', '+', { awaySetterPosition: 3, rallyNumber }),
        touch(`attack-${rallyNumber}`, sequenceStart + 2, 'a4', 'attack', '#', { startZoneCode: '4', rallyNumber }),
      ],
      dataVolleyCode: '',
      servingTeam: 'home',
      pointWinner: 'away',
      terminalReason: null,
    });
    const rallies = [makeRally(1, 1), makeRally(2, 5), makeRally(3, 9)];
    const fixture = match(rallies, 'm1', 'a1');
    // a1 (Piani) has role 'opposite' in [3PLAYERS], a2 (Batte) has role 'setter', a3 is middle_blocker.
    fixture.roster = [
      { id: 'a1', jerseyNumber: 13, firstName: '', lastName: 'Piani', role: 'opposite', source: 'manual_entry' },
      { id: 'a2', jerseyNumber: 5, firstName: '', lastName: 'Batte', role: 'setter', source: 'manual_entry' },
      { id: 'a3', jerseyNumber: 3, firstName: 'Chiara', lastName: 'Middle', role: 'middle_blocker', source: 'manual_entry' },
      { id: 'a4', jerseyNumber: 4, firstName: 'Anna', lastName: 'Hitter', role: 'outside_hitter', source: 'manual_entry' },
    ] as MatchRosterPlayer[];
    // Piani starts in position 3 (awaySetterPosition = 3) for rallies 1 and 2; Batte subs in for rally 3.
    fixture.events.splice(1 + rallies[0].touches.length + rallies[1].touches.length, 0, {
      id: 'sub-batte',
      type: 'substitution_made',
      createdAt: 8,
      setNumber: 1,
      rallyNumber: 3,
      teamSide: 'away',
      playerOutId: 'a1',
      playerInId: 'a2',
    });

    const metrics = computeAttackingReportMetrics([fixture]);
    expect(metrics.setters.map((entry) => entry.player.name)).toEqual(['Piani', 'Batte']);
    expect(metrics.setters[0].rotations[0].positive.attempts).toBe(2);
    expect(metrics.setters[1].rotations[0].positive.attempts).toBe(1);
  });
});
