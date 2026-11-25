// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { BallTouch } from '@src/domain/touch/types';
import type { MatchRosterPlayer } from '@src/domain/match/types';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
import type { ReportMatchInput } from './report-metrics';
import { buildReportZoneView } from './report-zones';

let n = 0;
const touch = (p: Partial<BallTouch>): BallTouch => ({ id: `t${++n}`, setNumber: 1, rallyNumber: 1, createdAt: n, sequenceNumber: n, ...p } as BallTouch);
const rally = (touches: BallTouch[], rotation: 1 | 2 | 3 | 4 | 5 | 6): RallyStats => ({
  setNumber: 1, rallyNumber: ++n, touches, dataVolleyCode: '', servingTeam: 'home', pointWinner: 'away',
  terminalReason: null, rotations: { home: 1, away: rotation },
});
const sideOut = (playerId: string, zone: string, combo: string | undefined, rotation: 1 | 2 | 3 | 4 | 5 | 6) => rally([
  touch({ teamSide: 'home', skill: 'serve' }),
  touch({ teamSide: 'away', skill: 'receive' }),
  touch({ teamSide: 'away', skill: 'attack', playerId, startZoneCode: zone, combinationCode: combo, evaluation: '#' }),
], rotation);
const player = (id: string, jersey: number, lastName: string) => ({ id, jerseyNumber: jersey, firstName: 'A', lastName, source: 'archive' } as unknown as MatchRosterPlayer);

const input = (matchId: string, ids: [string, string], rallies: RallyStats[]): ReportMatchInput => ({
  matchId, side: 'away', events: [], rallies, rotationStats: [],
  roster: [player(ids[0], 7, 'Rossi'), player(ids[1], 11, 'Bianchi')],
});

const t = (key: string, params?: Record<string, string | number>) => (params ? `${key}:${JSON.stringify(params)}` : key);

describe('report zone analysis', () => {
  it('merges the matches, splits phases and rotations, and counts the served attacker', () => {
    const view = buildReportZoneView([
      input('m1', ['a1', 'b1'], [sideOut('a1', '4', 'X5', 1), sideOut('b1', '3', 'V3', 1)]),
      input('m2', ['a2', 'b2'], [sideOut('a2', '4', 'X5', 1), sideOut('b2', '2', undefined, 4)]),
    ], t);
    const reception = view.phases.find((p) => p.key === 'reception')!;
    expect(reception.total).toBe(4);
    expect(view.phases.find((p) => p.key === 'transition')!.total).toBe(0);
    const p1 = reception.courts.find((c) => c.rotation === 1)!;
    expect(p1.sample).toContain('"n":3');
    // Rossi from both matches counted as one athlete, Bianchi's cross from 2 to 3 in zone 2.
    expect(p1.svg).toContain('7 Rossi 2');
    expect(p1.svg).toMatch(/data-zone="2"><title>2: 1</);
    expect(reception.courts.map((c) => c.rotation)).toEqual([4, 3, 2, 5, 6, 1]);
  });
});
