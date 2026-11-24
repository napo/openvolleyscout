// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import type { BallTouch } from '@src/domain/touch/types';
import { mapDataVolleyMatchToOvsProject, parseDataVolleyFile } from '@src/features/import';
import type { RallyStats, RotationNumber } from '@src/features/scouting/model/match-stats';
import { buildProjectMatchStats } from '@src/features/scouting/model/project-match-stats';
import { createDefaultFilters } from '../filters/dashboard-filters';
import { getFilteredTouches } from './dashboard-selectors';
import { filterRalliesForTeam, filterTouchesByRallyContext, rallyMatchesContext } from './rally-context-filters';

function touch(partial: Partial<BallTouch>): BallTouch {
  return { id: Math.random().toString(36), teamSide: 'home', skill: 'attack', playerId: 'h1', ...partial } as BallTouch;
}

function rally(partial: Partial<RallyStats> & { score?: [number, number]; rotations?: Record<'home' | 'away', RotationNumber> }): RallyStats {
  const { score = [0, 0], ...rest } = partial;
  return {
    setNumber: 1,
    rallyNumber: 1,
    touches: [],
    dataVolleyCode: '',
    servingTeam: 'home',
    pointWinner: 'home',
    terminalReason: null,
    scoreBefore: { home: score[0], away: score[1] },
    setTargetPoints: 25,
    rotations: { home: 1, away: 1 },
    ...rest,
  };
}

describe('rally context filters', () => {
  it('reads the score situation from the given team', () => {
    const r = rally({ score: [10, 8] });
    expect(rallyMatchesContext(r, { scoreRange: 'leading' }, 'home')).toBe(true);
    expect(rallyMatchesContext(r, { scoreRange: 'trailing' }, 'away')).toBe(true);
    expect(rallyMatchesContext(r, { scoreRange: 'leading' }, 'away')).toBe(false);
    expect(rallyMatchesContext(rally({ score: [7, 7] }), { scoreRange: 'tied' }, 'away')).toBe(true);
  });

  it('counts a close finish from 20 points (12 in a deciding set) with a gap of 2 or less', () => {
    expect(rallyMatchesContext(rally({ score: [22, 20] }), { scoreRange: 'clutch' }, 'home')).toBe(true);
    expect(rallyMatchesContext(rally({ score: [20, 17] }), { scoreRange: 'clutch' }, 'home')).toBe(false);
    expect(rallyMatchesContext(rally({ score: [19, 18] }), { scoreRange: 'clutch' }, 'home')).toBe(false);
    expect(rallyMatchesContext(rally({ score: [12, 11], setTargetPoints: 15 }), { scoreRange: 'clutch' }, 'away')).toBe(true);
    expect(rallyMatchesContext(rally({ score: [11, 10], setTargetPoints: 15 }), { scoreRange: 'clutch' }, 'away')).toBe(false);
  });

  it('reads the rotation of the given team', () => {
    const r = rally({ rotations: { home: 2, away: 5 } });
    expect(rallyMatchesContext(r, { rotation: 2 }, 'home')).toBe(true);
    expect(rallyMatchesContext(r, { rotation: 2 }, 'away')).toBe(false);
    expect(rallyMatchesContext(r, { rotation: 5 }, 'away')).toBe(true);
  });

  it('keeps the rallies in which the player served, received or attacked', () => {
    const r = rally({ touches: [touch({ skill: 'serve', playerId: 's' }), touch({ skill: 'receive', playerId: 'r', teamSide: 'away' }), touch({ skill: 'attack', playerId: 'a', teamSide: 'away' })] });
    expect(rallyMatchesContext(r, { server: 's', receiver: 'r', attacker: 'a' }, 'home')).toBe(true);
    expect(rallyMatchesContext(r, { server: 'r' }, 'home')).toBe(false);
    expect(rallyMatchesContext(r, { attacker: 's' }, 'home')).toBe(false);
  });

  it('never matches an active filter without the rally context, and keeps everything without filters', () => {
    const bare = { ...rally({}), scoreBefore: undefined, rotations: undefined };
    expect(rallyMatchesContext(bare, { rotation: 1 }, 'home')).toBe(false);
    expect(rallyMatchesContext(bare, { scoreRange: 'tied' }, 'home')).toBe(false);
    const rallies = [bare];
    expect(filterRalliesForTeam(rallies, { rotation: 'all' }, 'home')).toBe(rallies);
  });

  it('filters each touch from its own team', () => {
    const home = touch({ teamSide: 'home' });
    const away = touch({ teamSide: 'away' });
    const r = rally({ touches: [home, away], rotations: { home: 3, away: 1 } });
    expect(filterTouchesByRallyContext([r], [home, away], { rotation: 3 })).toEqual([home]);
    expect(filterTouchesByRallyContext([r], [home, away], { rotation: 1 })).toEqual([away]);
  });
});

describe('rally context on a real match', () => {
  // The demo match shipped with the app: Melodic Spikers vs Hollywood Blockers.
  const text = readFileSync(resolve(__dirname, '../../../../../public/samples/demo-melodic-spikers-hollywood-blockers.dvw'), 'latin1');
  const { project } = mapDataVolleyMatchToOvsProject(parseDataVolleyFile(text, { sourceName: 'x.dvw' } as never), { sourceName: 'x.dvw' });
  const stats = buildProjectMatchStats(project);

  it('gives every rally the score before it, the set target and both rotations', () => {
    for (const set of stats.setStats) {
      const rallies = stats.rallyStats.filter((r) => r.setNumber === set.setNumber && r.pointWinner);
      expect(rallies[0].scoreBefore).toEqual({ home: 0, away: 0 });
      const last = rallies.at(-1)!;
      const final = { ...last.scoreBefore! };
      final[last.pointWinner!] += 1;
      expect(final).toEqual({ home: set.homeScore, away: set.awayScore });
      expect(last.setTargetPoints).toBe(Math.max(set.homeScore, set.awayScore) < 25 ? 15 : 25);
    }
    expect(stats.rallyStats.every((r) => r.rotations && r.rotations.home >= 1 && r.rotations.away <= 6)).toBe(true);
  });

  it('tracks rotations exactly like the rotation stats', () => {
    for (const side of ['home', 'away'] as const) {
      for (const rotation of stats.rotationStats[side]) {
        const attempts = stats.rallyStats.filter((r) => r.servingTeam && r.pointWinner && r.servingTeam !== side
          && r.rotations?.[side] === rotation.rotationNumber).length;
        expect(attempts).toBe(rotation.sideOutAttempts);
      }
    }
  });

  it('narrows the dashboard touches with the rotation filter', () => {
    const all = getFilteredTouches(stats, { ...createDefaultFilters(), team: 'home' });
    const p1 = getFilteredTouches(stats, { ...createDefaultFilters(), team: 'home', rotation: 1 });
    expect(p1.length).toBeGreaterThan(0);
    expect(p1.length).toBeLessThan(all.length);
    const byRotation = ([1, 2, 3, 4, 5, 6] as const)
      .map((rotation) => getFilteredTouches(stats, { ...createDefaultFilters(), team: 'home', rotation }).length);
    expect(byRotation.reduce((sum, n) => sum + n, 0)).toBe(all.length);
  });
});
