import { describe, expect, it } from 'vitest';
import type { BallTouch } from '@src/domain/touch/types';
import type { MatchRosterPlayer } from '@src/domain/match/types';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
import { computeServingReportMetrics } from './serving-metrics';
import type { ReportMatchInput } from './report-metrics';

const roster = [
  { id: 'a8', jerseyNumber: 8, firstName: 'Alessia', lastName: 'Orro', role: 'setter', source: 'manual_entry' },
  { id: 'a17', jerseyNumber: 17, firstName: 'Myriam', lastName: 'Sylla', role: 'outside_hitter', source: 'manual_entry' },
  { id: 'a1', jerseyNumber: 1, firstName: 'Helena', lastName: 'Cazaute', role: 'outside_hitter', source: 'manual_entry' },
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

function makeMatch(rallies: RallyStats[], matchId = 'm1'): ReportMatchInput {
  return {
    matchId,
    side: 'away',
    events: [],
    rallies,
    rotationStats: [],
    roster,
  };
}

describe('serving report metrics', () => {
  it('computes start/target zones, serve types, errors, aces and consecutive serve runs per player', () => {
    const rallies: RallyStats[] = [
      // Turn 1 for #8: 3 consecutive serves (start zone 1 -> target zone 5, jump float 'M')
      {
        setNumber: 1,
        rallyNumber: 1,
        servingTeam: 'away',
        pointWinner: 'away',
        terminalReason: null,
        dataVolleyCode: '',
        touches: [
          touch('s1', 1, 'a8', 'serve', '#', { rallyNumber: 1, serveType: 'M', startZoneCode: '1', endZoneCode: '5' }),
        ],
      },
      {
        setNumber: 1,
        rallyNumber: 2,
        servingTeam: 'away',
        pointWinner: 'away',
        terminalReason: null,
        dataVolleyCode: '',
        touches: [
          touch('s2', 1, 'a8', 'serve', '+', { rallyNumber: 2, serveType: 'M', startZoneCode: '1', endZoneCode: '5' }),
        ],
      },
      {
        setNumber: 1,
        rallyNumber: 3,
        servingTeam: 'away',
        pointWinner: 'home',
        terminalReason: null,
        dataVolleyCode: '',
        touches: [
          touch('s3', 1, 'a8', 'serve', '=', { rallyNumber: 3, serveType: 'M', startZoneCode: '6', endZoneCode: '6' }),
        ],
      },
      // Home serves and loses rally 4 (side-out for away without conceding break)
      {
        setNumber: 1,
        rallyNumber: 4,
        servingTeam: 'home',
        pointWinner: 'away',
        terminalReason: null,
        dataVolleyCode: '',
        touches: [
          touch('hs4', 1, 'h1', 'serve', '-', { teamSide: 'home', rallyNumber: 4 }),
          touch('ar4', 2, 'a17', 'receive', '+', { rallyNumber: 4 }),
          touch('aa4', 3, 'a17', 'attack', '#', { rallyNumber: 4 }),
        ],
      },
      // Turn 2 for #8 (e.g. end of set with 1 serve)
      {
        setNumber: 1,
        rallyNumber: 5,
        servingTeam: 'away',
        pointWinner: 'away',
        terminalReason: null,
        dataVolleyCode: '',
        touches: [
          touch('s5', 1, 'a8', 'serve', '-', { rallyNumber: 5, serveType: 'Q', startZoneCode: '1' }),
          touch('hr5', 2, 'h1', 'receive', '+', { teamSide: 'home', rallyNumber: 5, endZoneCode: '5' }),
        ],
      },
    ];

    const metrics = computeServingReportMetrics([makeMatch(rallies)]);
    expect(metrics.servers).toHaveLength(1);
    const server = metrics.servers[0];
    expect(server.player.jersey).toBe('8');
    expect(server.serves).toBe(4);
    expect(server.turns).toBe(2);
    expect(server.averageConsecutiveServes).toBe(2);
    expect(server.maxConsecutiveServes).toBe(3);
    expect(server.aces).toEqual({ count: 1, total: 4, rate: 0.25 });
    expect(server.errors).toEqual({ count: 1, total: 4, rate: 0.25 });
    expect(server.startZones[0]).toMatchObject({ value: '1', count: 3, share: 0.75 });
    expect(server.targetZones[0]).toMatchObject({ value: '5', count: 3, share: 0.75 });
    expect(server.types[0]).toMatchObject({ value: 'jump_float', count: 3, share: 0.75 });
    expect(server.routes[0]).toMatchObject({ startZone: '1', targetZone: '5', count: 3, share: 0.75 });
    // Per type: jump float (#, +, =) and jump spin (-), with their own routes.
    expect(server.typeBreakdown.map((entry) => entry.type)).toEqual(['jump_float', 'jump_spin']);
    expect(server.typeBreakdown[0]).toMatchObject({
      serves: 3,
      aces: { count: 1, total: 3 },
      hard: { count: 1, total: 3 },
      errors: { count: 1, total: 3 },
    });
    expect(server.typeBreakdown[1].routes).toEqual([
      expect.objectContaining({ startZone: '1', targetZone: '5', count: 1, share: 1 }),
    ]);
  });

  it('tracks go-to attacker and next serve type after conceding a break point', () => {
    const rallies: RallyStats[] = [
      // Rally 1: opponent (away) receives and loses point -> conceded break!
      {
        setNumber: 1,
        rallyNumber: 1,
        servingTeam: 'home',
        pointWinner: 'home',
        terminalReason: null,
        dataVolleyCode: '',
        touches: [
          touch('hs1', 1, 'h1', 'serve', '+', { teamSide: 'home', rallyNumber: 1 }),
          touch('ar1', 2, 'a17', 'receive', '-', { rallyNumber: 1 }),
          touch('aa1', 3, 'a1', 'attack', '=', { rallyNumber: 1 }),
        ],
      },
      // Rally 2: immediately after conceded break, away receives and sets #17 Sylla (scores side-out)
      {
        setNumber: 1,
        rallyNumber: 2,
        servingTeam: 'home',
        pointWinner: 'away',
        terminalReason: null,
        dataVolleyCode: '',
        touches: [
          touch('hs2', 1, 'h1', 'serve', '-', { teamSide: 'home', rallyNumber: 2 }),
          touch('ar2', 2, 'a1', 'receive', '+', { rallyNumber: 2 }),
          touch('as2', 3, 'a8', 'set', '+', { rallyNumber: 2 }),
          touch('aa2', 4, 'a17', 'attack', '#', { rallyNumber: 2 }),
        ],
      },
      // Rally 3: away serves right after siding out from a rotation where a break was conceded
      {
        setNumber: 1,
        rallyNumber: 3,
        servingTeam: 'away',
        pointWinner: 'away',
        terminalReason: null,
        dataVolleyCode: '',
        touches: [
          touch('as3', 1, 'a17', 'serve', '+', { rallyNumber: 3, serveType: 'Q', startZoneCode: '1', endZoneCode: '6' }),
        ],
      },
    ];

    const { breakReaction } = computeServingReportMetrics([makeMatch(rallies)]);
    expect(breakReaction.afterBreakAttacks.attempts).toBe(1);
    expect(breakReaction.afterBreakAttacks.attackers[0]).toMatchObject({
      player: { jersey: '17' },
      attempts: 1,
      share: { count: 1, total: 1, rate: 1 },
      kill: { count: 1, total: 1, rate: 1 },
    });
    expect(breakReaction.serveAfterBreak.serves).toBe(1);
    expect(breakReaction.serveAfterBreak.types[0]).toMatchObject({
      value: 'jump_spin',
      count: 1,
      share: 1,
    });
    expect(breakReaction.serveAfterBreak.targetZones[0]).toMatchObject({
      value: '6',
      count: 1,
      share: 1,
    });
  });
});
