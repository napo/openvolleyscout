import { describe, expect, it } from 'vitest';
import { createOpponentReport } from '@src/domain/opponent-report/types';
import { DEFAULT_RECEPTION_SYSTEM_BLOCK } from '@src/config/systems/reception-defaults';
import { it as italian } from '@src/i18n/locales/it';
import { buildReportView, type ViewT } from './report-view';
import { computeOpponentReportMetrics } from './report-metrics';
import { DEFAULT_THRESHOLDS } from './traffic-light';
import type { BallTouch } from '@src/domain/touch/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { MatchRosterPlayer } from '@src/domain/match/types';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
import {
  collectAttackerViewCodeOptions,
  collectSetterCallCodes,
  computeAttackerDirectionViews,
  computeSetterRepeats,
  computeAttackingReportMetrics,
  computeSetterDistributionViews,
} from './attacking-metrics';

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

  it('recovers distribution for already imported matches with stale setter IDs on touches', () => {
    const rally: RallyStats = {
      setNumber: 1, rallyNumber: 1, servingTeam: 'home', pointWinner: 'away', terminalReason: null, dataVolleyCode: '',
      touches: [
        touch('serve', 1, 'h1', 'serve', '+', {teamSide: 'home'}),
        touch('receive', 2, 'a4', 'receive', '+', {awaySetterPosition: 3, awaySetterPlayerId: 'pre-archive-a1'}),
        touch('attack', 3, 'a4', 'attack', '#', {startZoneCode: '4'}),
      ],
    };
    const metrics = computeAttackingReportMetrics([match([rally])]);
    expect(metrics.setters).toHaveLength(1);
    expect(metrics.setters[0].player.jersey).toBe('1');
    expect(metrics.setters[0].rotations[0]).toMatchObject({rotation: 3, positive: {attempts: 1, zones: [{zone: 4, attempts: 1}]}});
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

  it('filters custom setter distribution views by serve type, serve start zone, and reception band', () => {
    const rallies: RallyStats[] = [
      {
        setNumber: 1,
        rallyNumber: 1,
        touches: [
          touch('s1', 1, 'h1', 'serve', '+', { teamSide: 'home', skillTypeCode: 'Q', startZoneCode: '1', rallyNumber: 1 }),
          touch('r1', 2, 'a4', 'receive', '+', { awaySetterPosition: 1, rallyNumber: 1 }),
          touch('a1-1', 3, 'a4', 'attack', '#', { startZoneCode: '4', rallyNumber: 1 }),
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
          touch('s2', 4, 'h1', 'serve', '+', { teamSide: 'home', skillTypeCode: 'M', startZoneCode: '5', endZoneCode: '6', rallyNumber: 2 }),
          touch('r2', 5, 'a4', 'receive', '!', { awaySetterPosition: 1, endZoneCode: '6', rallyNumber: 2 }),
          touch('a1-2', 6, 'a2', 'attack', '#', { startZoneCode: '2', rallyNumber: 2 }),
        ],
        dataVolleyCode: '',
        servingTeam: 'home',
        pointWinner: 'away',
        terminalReason: null,
      },
    ];
    const fixture = match(rallies, 'm1', 'a1');
    const metrics = computeAttackingReportMetrics([fixture]);
    const custom = computeSetterDistributionViews(
      [fixture],
      [
        { id: 'v1', label: 'Spin Z1', receptionBand: 'all', serveTypes: ['jump_spin'], serveStartZones: ['1'] },
        { id: 'v2', label: 'Float neg', receptionBand: 'negative', serveTypes: ['jump_float'], serveStartZones: ['5'], receptionZones: ['6'] },
      ],
      metrics.setters,
    );
    expect(custom).toHaveLength(1);
    expect(custom[0].views[0].rotations[0].band.attempts).toBe(1);
    expect(custom[0].views[0].rotations[0].band.topZone).toBe(4);
    expect(custom[0].views[1].rotations[0].band.attempts).toBe(1);
    expect(custom[0].views[1].rotations[0].band.topZone).toBe(2);
    expect(custom[0].views[1].rotations[0].band.sideOut).toMatchObject({ count: 1, total: 1, rate: 1 });
  });

  it('filters custom setter distribution views by the setter call and lists the calls found', () => {
    const sideOut = (rally: number, order: number, call: string | undefined): RallyStats => ({
      setNumber: 1,
      rallyNumber: rally,
      touches: [
        touch(`s${rally}`, order, 'h1', 'serve', '+', { teamSide: 'home', rallyNumber: rally }),
        touch(`r${rally}`, order + 1, 'a4', 'receive', '+', { awaySetterPosition: 1, rallyNumber: rally }),
        touch(`set${rally}`, order + 2, 'a1', 'set', '#', { rallyNumber: rally, ...(call ? { setterCallCode: call } : {}) }),
        touch(`atk${rally}`, order + 3, 'a4', 'attack', '#', { startZoneCode: '4', rallyNumber: rally }),
      ],
      dataVolleyCode: '',
      servingTeam: 'home',
      pointWinner: 'away',
      terminalReason: null,
    });
    const fixture = match([sideOut(1, 1, 'K1'), sideOut(2, 10, 'kc'), sideOut(3, 20, 'K1'), sideOut(4, 30, undefined)], 'm1', 'a1');
    expect(collectSetterCallCodes([fixture])).toEqual(['K1', 'KC']);
    const metrics = computeAttackingReportMetrics([fixture]);
    const attempts = (view: Parameters<typeof computeSetterDistributionViews>[1][number]) => (
      computeSetterDistributionViews([fixture], [view], metrics.setters)[0].views[0].rotations[0].band.attempts
    );
    expect(attempts({ id: 'all', label: 'All', receptionBand: 'all' })).toBe(4);
    expect(attempts({ id: 'k1', label: 'K1', receptionBand: 'all', setterCalls: ['K1'] })).toBe(2);
    expect(attempts({ id: 'kc', label: 'KC', receptionBand: 'all', setterCalls: ['KC'] })).toBe(1);
    expect(attempts({ id: 'both', label: 'K1 + KC', receptionBand: 'all', setterCalls: ['K1', 'KC'] })).toBe(3);
  });

  it('filters custom setter distribution views by the set type (the type of the attack after the set)', () => {
    const sideOut = (rally: number, order: number, type: string | null): RallyStats => ({
      setNumber: 1,
      rallyNumber: rally,
      touches: [
        touch(`s${rally}`, order, 'h1', 'serve', '+', { teamSide: 'home', rallyNumber: rally }),
        touch(`r${rally}`, order + 1, 'a4', 'receive', '+', { awaySetterPosition: 1, rallyNumber: rally }),
        touch(`set${rally}`, order + 2, 'a1', 'set', '#', { rallyNumber: rally }),
        ...(type === null ? [] : [touch(`atk${rally}`, order + 3, 'a4', 'attack', '#', { startZoneCode: '4', attackType: type, rallyNumber: rally })]),
      ],
      dataVolleyCode: '',
      servingTeam: 'home',
      pointWinner: 'away',
      terminalReason: null,
    });
    const fixture = match([sideOut(1, 1, 'Q'), sideOut(2, 10, 'q'), sideOut(3, 20, 'H'), sideOut(4, 30, null)], 'm1', 'a1');
    const metrics = computeAttackingReportMetrics([fixture]);
    const band = (view: Parameters<typeof computeSetterDistributionViews>[1][number]) => (
      computeSetterDistributionViews([fixture], [view], metrics.setters)[0].views[0].rotations[0].band
    );
    const all = band({ id: 'all', label: 'All', receptionBand: 'all' });
    expect(all.attempts).toBe(3);
    expect(all.sideOut?.total).toBe(4);
    const quick = band({ id: 'q', label: 'Q', receptionBand: 'all', attackBallTypes: ['Q'] });
    expect(quick.attempts).toBe(2);
    // A reception without an attack has no set type: it leaves the side-out count of a filtered view.
    expect(quick.sideOut?.total).toBe(2);
    expect(band({ id: 'h', label: 'H', receptionBand: 'all', attackBallTypes: ['h'] }).attempts).toBe(1);
    expect(band({ id: 'u', label: 'U', receptionBand: 'all', attackBallTypes: ['U'] }).attempts).toBe(0);
    expect(band({ id: 'qh', label: 'Q H', receptionBand: 'all', attackBallTypes: ['Q', 'H'] }).attempts).toBe(3);
  });

  it('filters custom attacker direction views by base and combination crossed with AND', () => {
    const rally = (number: number, order: number, call: string | undefined, combination: string | undefined, withSet = true): RallyStats => ({
      setNumber: 1,
      rallyNumber: number,
      touches: [
        touch(`d${number}`, order, 'a4', 'dig', '+', { rallyNumber: number }),
        ...(withSet ? [touch(`set${number}`, order + 1, 'a1', 'set', '#', { rallyNumber: number, ...(call ? { setterCallCode: call } : {}) })] : []),
        touch(`atk${number}`, order + 2, 'a4', 'attack', '#', {
          startZoneCode: '4',
          rallyNumber: number,
          ...(combination ? { combinationCode: combination } : {}),
          ...(!withSet && call ? { setterCallCode: call } : {}),
        }),
      ],
      dataVolleyCode: '',
      servingTeam: 'away',
      pointWinner: 'away',
      terminalReason: null,
    });
    const fixture = match([
      rally(1, 1, 'K1', 'X5'),
      rally(2, 10, 'K1', undefined),
      rally(3, 20, 'K7', 'X5'),
      // Older data: the setter call saved as the attack's combination, no set scouted.
      rally(4, 30, undefined, 'K2', false),
    ], 'm1', 'a1');
    const metrics = computeAttackingReportMetrics([fixture]);
    expect(collectAttackerViewCodeOptions([fixture])).toEqual({ setterCalls: ['K1', 'K2', 'K7'], combinationCodes: ['X5'] });
    const count = (filter: { setterCalls?: string[]; combinationCodes?: string[] }) => (
      computeAttackerDirectionViews([fixture], [{ id: 'v', label: 'V', ...filter }], metrics.attackers)[0]
        .attackers.find((entry) => entry.player.jersey === '4')?.attacks ?? 0
    );
    expect(count({})).toBe(4);
    // Base counts every attack whose set had that call, also when the attack has a combination.
    expect(count({ setterCalls: ['K1'] })).toBe(2);
    expect(count({ setterCalls: ['k1'] })).toBe(2);
    expect(count({ combinationCodes: ['X5'] })).toBe(2);
    expect(count({ setterCalls: ['K1'], combinationCodes: ['X5'] })).toBe(1);
    expect(count({ setterCalls: ['K7'], combinationCodes: ['X5'] })).toBe(1);
    expect(count({ setterCalls: ['K2'] })).toBe(1);
    // A K code saved among the combinations (reports of older versions) is read as Base.
    expect(count({ combinationCodes: ['K2'] })).toBe(1);
    expect(count({ combinationCodes: ['K1', 'X5'] })).toBe(1);
  });

  it('converts K codes saved among the combinations of an attacker view into Base', () => {
    const rally = (number: number, order: number, call: string, combination: string): RallyStats => ({
      setNumber: 1,
      rallyNumber: number,
      touches: [
        touch(`d${number}`, order, 'a4', 'dig', '+', { rallyNumber: number }),
        touch(`set${number}`, order + 1, 'a1', 'set', '#', { rallyNumber: number, setterCallCode: call }),
        touch(`atk${number}`, order + 2, 'a4', 'attack', '#', { startZoneCode: '4', rallyNumber: number, combinationCode: combination }),
      ],
      dataVolleyCode: '',
      servingTeam: 'away',
      pointWinner: 'away',
      terminalReason: null,
    });
    const fixture = match([rally(1, 1, 'K1', 'X5'), rally(2, 10, 'K1', 'V5'), rally(3, 20, 'K7', 'X5')], 'm1', 'a1');
    const metrics = computeAttackingReportMetrics([fixture]);
    const [legacy] = computeAttackerDirectionViews([fixture], [{ id: 'old', label: 'Old', combinationCodes: ['K1', 'X5'] }], metrics.attackers);
    expect(legacy.config).toMatchObject({ id: 'old', setterCalls: ['K1'], combinationCodes: ['X5'] });
    expect(legacy.attackers.find((entry) => entry.player.jersey === '4')?.attacks).toBe(1);
  });

  it('filters custom attacker direction views by attack type (H M Q T U N O)', () => {
    const attack = (id: string, order: number, type: string, rally: number): RallyStats => ({
      setNumber: 1,
      rallyNumber: rally,
      touches: [
        touch(`d${id}`, order, 'a4', 'dig', '+', { rallyNumber: rally }),
        touch(id, order + 1, 'a4', 'attack', '#', {
          startZoneCode: '4',
          attackType: type,
          ballDirection: { start: { x: 55, y: 20 }, end: { x: 25, y: 70 } },
          rallyNumber: rally,
        }),
      ],
      dataVolleyCode: '',
      servingTeam: 'away',
      pointWinner: 'away',
      terminalReason: null,
    });
    const fixture = match([attack('high', 1, 'H', 1), attack('quick', 3, 'Q', 2), attack('tense', 5, 'T', 3)], 'm1', 'a1');
    const metrics = computeAttackingReportMetrics([fixture]);
    const count = (attackBallTypes: string[]) => computeAttackerDirectionViews([fixture], [{ id: 'v', label: 'V', attackBallTypes }], metrics.attackers)[0]
      .attackers.find((entry) => entry.player.jersey === '4')?.attacks ?? 0;
    expect(count([])).toBe(3);
    expect(count(['H'])).toBe(1);
    expect(count(['Q', 'T'])).toBe(2);
    expect(count(['U'])).toBe(0);
  });

  it('counts how often the setter goes back to an attacker after her error and within a rally', () => {
    const rally = (number: number, serving: 'home' | 'away', touches: BallTouch[], winner: 'home' | 'away'): RallyStats => ({
      setNumber: 1, rallyNumber: number, touches, dataVolleyCode: '', servingTeam: serving, pointWinner: winner, terminalReason: null,
    });
    const fixture = match([
      // Side-out attempt: #4 hits out.
      rally(1, 'home', [
        touch('s1', 1, 'h1', 'serve', '+', { teamSide: 'home', rallyNumber: 1 }),
        touch('r1', 2, 'a4', 'receive', '#', { awaySetterPosition: 1, rallyNumber: 1 }),
        touch('set1', 3, 'a1', 'set', '#', { rallyNumber: 1 }),
        touch('atk1', 4, 'a4', 'attack', '=', { rallyNumber: 1 }),
      ], 'home'),
      // Next rally: the first set goes back to #4.
      rally(2, 'home', [
        touch('s2', 5, 'h1', 'serve', '+', { teamSide: 'home', rallyNumber: 2 }),
        touch('r2', 6, 'a4', 'receive', '+', { awaySetterPosition: 1, rallyNumber: 2 }),
        touch('set2', 7, 'a1', 'set', '#', { rallyNumber: 2 }),
        touch('atk2', 8, 'a4', 'attack', '#', { rallyNumber: 2 }),
      ], 'away'),
      // In transition #3 is blocked and covered, and the setter gives her the ball again.
      rally(3, 'away', [
        touch('s3', 9, 'a3', 'serve', '+', { rallyNumber: 3 }),
        touch('d3', 10, 'a4', 'dig', '+', { rallyNumber: 3 }),
        touch('set3', 11, 'a1', 'set', '#', { rallyNumber: 3 }),
        touch('atk3', 12, 'a3', 'attack', '!', { rallyNumber: 3 }),
        touch('c3', 13, 'a4', 'dig', '+', { rallyNumber: 3 }),
        touch('set3b', 14, 'a1', 'set', '#', { rallyNumber: 3 }),
        touch('atk3b', 15, 'a3', 'attack', '#', { rallyNumber: 3 }),
      ], 'away'),
    ], 'm1', 'a1');
    const [setter] = computeSetterRepeats([fixture]);
    expect(setter.setter.name).toBe('Sara Setter');
    const row = (jersey: string) => setter.attackers.find((entry) => entry.player.jersey === jersey)!;
    expect(row('4')).toMatchObject({ afterError: { count: 1, total: 1 }, afterBlocked: { count: 0, total: 0 }, usual: { count: 2, total: 2 } });
    expect(row('3').repeated).toEqual({ count: 1, total: 1 });
  });

  it('keeps attacks against an open block (players at net 4) apart from the others', () => {
    const attack = (id: string, order: number, numBlockers: 0 | 1 | 2 | 3 | 4, rally: number): RallyStats => ({
      setNumber: 1,
      rallyNumber: rally,
      touches: [
        touch(`d${id}`, order, 'a4', 'dig', '+', { rallyNumber: rally }),
        touch(id, order + 1, 'a4', 'attack', '#', {
          startZoneCode: '4',
          numBlockers,
          ballDirection: { start: { x: 55, y: 20 }, end: { x: 25, y: 70 } },
          rallyNumber: rally,
        }),
      ],
      dataVolleyCode: '',
      servingTeam: 'away',
      pointWinner: 'away',
      terminalReason: null,
    });
    const fixture = match([attack('open', 1, 4, 1), attack('triple', 3, 3, 2)], 'm1', 'a1');
    const metrics = computeAttackingReportMetrics([fixture]);
    const [view] = computeAttackerDirectionViews([fixture], [{ id: 'open', label: 'Open block', blockers: [4] }], metrics.attackers);
    const player = view.attackers.find((entry) => entry.player.jersey === '4')!;
    expect(player.attacks).toBe(1);
    expect(player.directionsForDrawing.map((direction) => direction.touchId)).toEqual(['open']);
  });

  it('filters custom attacker direction views by phase, reception, rotation, zone, subtype, base, combination, blockers, and evaluation', () => {
    const rallies: RallyStats[] = [
      {
        setNumber: 1,
        rallyNumber: 1,
        touches: [
          touch('s1', 1, 'h1', 'serve', '+', { teamSide: 'home', rallyNumber: 1 }),
          touch('r1', 2, 'a4', 'receive', '#', { awaySetterPosition: 1, rallyNumber: 1 }),
          touch('set1', 3, 'a1', 'set', '#', { setterCallCode: 'K1', rallyNumber: 1 }),
          touch('atk1', 4, 'a4', 'attack', '#', {
            awaySetterPosition: 1,
            startZoneCode: '4',
            attackSubtype: 'H',
            combinationCode: 'X5',
            numBlockers: 2,
            ballDirection: { start: { x: 55, y: 20 }, end: { x: 25, y: 70 } },
            rallyNumber: 1,
          }),
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
          touch('d2', 5, 'a4', 'dig', '+', { awaySetterPosition: 4, rallyNumber: 2 }),
          touch('set2', 6, 'a1', 'set', '+', { setType: 'high_ball', rallyNumber: 2 }),
          touch('atk2', 7, 'a4', 'attack', '+', {
            awaySetterPosition: 4,
            startZoneCode: '2',
            attackSubtype: 'P',
            combinationCode: 'V5',
            numBlockers: 1,
            ballDirection: { start: { x: 55, y: 80 }, end: { x: 30, y: 30 } },
            rallyNumber: 2,
          }),
        ],
        dataVolleyCode: '',
        servingTeam: 'away',
        pointWinner: 'home',
        terminalReason: null,
      },
    ];
    const fixture = match(rallies, 'm1', 'a1');
    const metrics = computeAttackingReportMetrics([fixture]);
    expect(collectAttackerViewCodeOptions([fixture])).toEqual({ setterCalls: ['K1'], combinationCodes: ['V5', 'X5'] });

    const views = computeAttackerDirectionViews(
      [fixture],
      [
        {
          id: 'v-hard-x5',
          label: 'Forte X5 su R#',
          phases: ['after_receive'],
          receptionEvaluations: ['#'],
          rotations: [1],
          attackZones: ['4'],
          attackSubtypes: ['H'],
          combinationCodes: ['X5'],
          blockers: [2],
          evaluations: ['#'],
        },
        {
          id: 'v-high-placed',
          label: 'Palla alta piazzata',
          phases: ['after_dig', 'high_ball'],
          rotations: [4],
          attackZones: ['2'],
          attackSubtypes: ['P'],
          combinationCodes: ['V5'],
          blockers: [1],
          evaluations: ['+'],
        },
      ],
      metrics.attackers,
    );

    expect(views).toHaveLength(2);
    const a4First = views[0].attackers.find((entry) => entry.player.jersey === '4')!;
    const a4Second = views[1].attackers.find((entry) => entry.player.jersey === '4')!;
    expect(a4First.attacks).toBe(1);
    expect(a4First.directionsForDrawing).toHaveLength(1);
    expect(a4First.directionsForDrawing[0].touchId).toBe('atk1');
    expect(a4Second.attacks).toBe(1);
    expect(a4Second.directionsForDrawing).toHaveLength(1);
    expect(a4Second.directionsForDrawing[0].touchId).toBe('atk2');

    const t: ViewT = (key, params) => (italian[key as keyof typeof italian] ?? key)
      .replace(/{{(\w+)}}/g, (_, name) => String(params?.[name] ?? name));
    const report = createOpponentReport({ id: 'filters', title: 'Filters', opponent: { name: 'Rivals' } });
    // Simulate choosing All in every category after editing the original view.
    const allViews = computeAttackerDirectionViews([fixture], [{ id: 'all', label: t('opponentReportAttackAll') }], metrics.attackers);
    const view = buildReportView(report, computeOpponentReportMetrics([fixture]), [], DEFAULT_THRESHOLDS,
      t, DEFAULT_RECEPTION_SYSTEM_BLOCK, metrics, undefined, undefined, undefined, undefined, [], [...views, ...allViews]);
    const filtered = view.attackerViews![0].attackers.find((entry) => entry.player.jersey === '4')!;
    expect(filtered.highlights.rows[0][0].text).toContain('Z4');
    expect(filtered.highlights.rows[0][0].text).toContain('X5');
    expect(filtered.highlights.rows[0][0].text).not.toBe(t('opponentReportAttackAll'));
    const unfiltered = view.attackerViews![2].attackers.find((entry) => entry.player.jersey === '4')!;
    const original = view.attackers.find((entry) => entry.player.jersey === '4')!;
    expect(unfiltered.highlights).toEqual(original.highlights);
    expect(unfiltered.highlights.rows).toHaveLength(4);
    expect(unfiltered.courtSvg).toEqual(original.courtSvg);

  });
});
