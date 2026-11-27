// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import type { BallTouch } from '@src/domain/touch/types';
import { mapDataVolleyMatchToOvsProject, parseDataVolleyFile } from '@src/features/import';
import type { RallyStats, RotationNumber } from '@src/features/scouting/model/match-stats';
import { buildProjectMatchStats } from '@src/features/scouting/model/project-match-stats';
import { collectAttackCodeOptions } from '../../attack-context/attack-codes';
import { createDefaultFilters, type DashboardFilters } from '../filters/dashboard-filters';
import { getFilteredTouches, pickRallyContextFilters } from './dashboard-selectors';
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
    expect(rallyMatchesContext(r, { scoreRange: ['leading'] }, 'home')).toBe(true);
    expect(rallyMatchesContext(r, { scoreRange: ['trailing'] }, 'away')).toBe(true);
    expect(rallyMatchesContext(r, { scoreRange: ['leading'] }, 'away')).toBe(false);
    expect(rallyMatchesContext(rally({ score: [7, 7] }), { scoreRange: ['tied'] }, 'away')).toBe(true);
  });

  it('counts a close finish from 20 points (12 in a deciding set) with a gap of 2 or less', () => {
    expect(rallyMatchesContext(rally({ score: [22, 20] }), { scoreRange: ['clutch'] }, 'home')).toBe(true);
    expect(rallyMatchesContext(rally({ score: [20, 17] }), { scoreRange: ['clutch'] }, 'home')).toBe(false);
    expect(rallyMatchesContext(rally({ score: [19, 18] }), { scoreRange: ['clutch'] }, 'home')).toBe(false);
    expect(rallyMatchesContext(rally({ score: [12, 11], setTargetPoints: 15 }), { scoreRange: ['clutch'] }, 'away')).toBe(true);
    expect(rallyMatchesContext(rally({ score: [11, 10], setTargetPoints: 15 }), { scoreRange: ['clutch'] }, 'away')).toBe(false);
  });

  it('reads the rotation of the given team', () => {
    const r = rally({ rotations: { home: 2, away: 5 } });
    expect(rallyMatchesContext(r, { rotation: [2] }, 'home')).toBe(true);
    expect(rallyMatchesContext(r, { rotation: [2] }, 'away')).toBe(false);
    expect(rallyMatchesContext(r, { rotation: [5] }, 'away')).toBe(true);
  });

  it('several rotations or score situations keep the rallies in any of them', () => {
    const r = rally({ rotations: { home: 2, away: 5 }, score: [10, 8] });
    expect(rallyMatchesContext(r, { rotation: [1, 2] }, 'home')).toBe(true);
    expect(rallyMatchesContext(r, { rotation: [1, 3] }, 'home')).toBe(false);
    expect(rallyMatchesContext(r, { scoreRange: ['tied', 'leading'] }, 'home')).toBe(true);
    expect(rallyMatchesContext(r, { scoreRange: ['tied', 'trailing'] }, 'home')).toBe(false);
    // Both groups together: each must be satisfied.
    expect(rallyMatchesContext(r, { rotation: [2], scoreRange: ['trailing'] }, 'home')).toBe(false);
  });

  it('keeps the rallies in which the player served, received or attacked', () => {
    const r = rally({ touches: [touch({ skill: 'serve', playerId: 's' }), touch({ skill: 'receive', playerId: 'r', teamSide: 'away' }), touch({ skill: 'attack', playerId: 'a', teamSide: 'away' })] });
    expect(rallyMatchesContext(r, { server: 's', receiver: 'r', attacker: 'a' }, 'home')).toBe(true);
    expect(rallyMatchesContext(r, { server: 'r' }, 'home')).toBe(false);
    expect(rallyMatchesContext(r, { attacker: 's' }, 'home')).toBe(false);
  });

  it('never matches an active filter without the rally context, and keeps everything without filters', () => {
    const bare = { ...rally({}), scoreBefore: undefined, rotations: undefined };
    expect(rallyMatchesContext(bare, { rotation: [1] }, 'home')).toBe(false);
    expect(rallyMatchesContext(bare, { scoreRange: ['tied'] }, 'home')).toBe(false);
    const rallies = [bare];
    expect(filterRalliesForTeam(rallies, { rotation: [] }, 'home')).toBe(rallies);
  });

  it('filters each touch from its own team', () => {
    const home = touch({ teamSide: 'home' });
    const away = touch({ teamSide: 'away' });
    const r = rally({ touches: [home, away], rotations: { home: 3, away: 1 } });
    expect(filterTouchesByRallyContext([r], [home, away], { rotation: [3] })).toEqual([home]);
    expect(filterTouchesByRallyContext([r], [home, away], { rotation: [1] })).toEqual([away]);
  });
});

describe('Base, Combination and Set type filters', () => {
  // Touches in rally order: sequence numbers follow the array.
  const inOrder = (touches: Partial<BallTouch>[]) => touches.map((partial, index) => touch({ sequenceNumber: index + 1, createdAt: index, ...partial }));
  // Reception K1 set and X5 quick attack, then a transition K2 set and a V6 high ball.
  const twoAttacks = () => rally({
    touches: inOrder([
      { teamSide: 'away', skill: 'serve' },
      { skill: 'receive' },
      { skill: 'set', setterCallCode: 'K1' },
      { skill: 'attack', combinationCode: 'X5', attackType: 'Q' },
      { teamSide: 'away', skill: 'dig' },
      { teamSide: 'away', skill: 'set', setterCallCode: 'K7' },
      { teamSide: 'away', skill: 'attack', combinationCode: 'X1', attackType: 'Q' },
      { skill: 'dig' },
      { skill: 'set', setterCallCode: 'K2' },
      { skill: 'attack', combinationCode: 'V6', attackType: 'H' },
    ]),
  });

  it('Base alone keeps the rallies in which the team set or attacked on that call', () => {
    const r = twoAttacks();
    expect(rallyMatchesContext(r, { setterCalls: ['K1'] }, 'home')).toBe(true);
    expect(rallyMatchesContext(r, { setterCalls: ['K2', 'K9'] }, 'home')).toBe(true);
    expect(rallyMatchesContext(r, { setterCalls: ['K7'] }, 'home')).toBe(false);
    expect(rallyMatchesContext(r, { setterCalls: ['K7'] }, 'away')).toBe(true);
    // A set with a call and no attack after it still counts for the Base alone.
    const setOnly = rally({ touches: inOrder([{ skill: 'receive' }, { skill: 'set', setterCallCode: 'K3' }]) });
    expect(rallyMatchesContext(setOnly, { setterCalls: ['K3'] }, 'home')).toBe(true);
    expect(rallyMatchesContext(setOnly, { setterCalls: ['K3'], attackBallTypes: ['Q'] }, 'home')).toBe(false);
  });

  it('Combination and Set type keep the rallies with such an attack of the team', () => {
    const r = twoAttacks();
    expect(rallyMatchesContext(r, { combinationCodes: ['V6'] }, 'home')).toBe(true);
    expect(rallyMatchesContext(r, { combinationCodes: ['X1'] }, 'home')).toBe(false);
    expect(rallyMatchesContext(r, { combinationCodes: ['X1'] }, 'away')).toBe(true);
    expect(rallyMatchesContext(r, { attackBallTypes: ['H'] }, 'home')).toBe(true);
    expect(rallyMatchesContext(r, { attackBallTypes: ['T'] }, 'home')).toBe(false);
    expect(rallyMatchesContext(r, { attackBallTypes: ['H'] }, 'away')).toBe(false);
  });

  it('several lists must hold on the same attack', () => {
    const r = twoAttacks();
    expect(rallyMatchesContext(r, { setterCalls: ['K1'], combinationCodes: ['X5'] }, 'home')).toBe(true);
    // K1 and V6 are both in the rally, but on different attacks.
    expect(rallyMatchesContext(r, { setterCalls: ['K1'], combinationCodes: ['V6'] }, 'home')).toBe(false);
    expect(rallyMatchesContext(r, { combinationCodes: ['X5'], attackBallTypes: ['Q'] }, 'home')).toBe(true);
    expect(rallyMatchesContext(r, { combinationCodes: ['V6'], attackBallTypes: ['Q'] }, 'home')).toBe(false);
    expect(rallyMatchesContext(r, { setterCalls: ['K2'], combinationCodes: ['V6'], attackBallTypes: ['H'] }, 'home')).toBe(true);
  });

  it('reads an older K code kept as a combination as a Base, never as a Combination', () => {
    const r = rally({ touches: inOrder([{ skill: 'set', combinationCode: 'K1' }, { skill: 'attack', combinationCode: 'X5' }]) });
    expect(rallyMatchesContext(r, { setterCalls: ['K1'], combinationCodes: ['X5'] }, 'home')).toBe(true);
    expect(rallyMatchesContext(r, { combinationCodes: ['K1'] }, 'home')).toBe(false);
  });

  it('filters each touch from its own team, rally by rally', () => {
    const r = twoAttacks();
    const kept = filterTouchesByRallyContext([r], r.touches, { combinationCodes: ['X1'] });
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((item) => item.teamSide === 'away')).toBe(true);
    expect(kept).toEqual(r.touches.filter((item) => item.teamSide === 'away'));
  });

  it('passes the three lists along with the other rally filters', () => {
    const picked = pickRallyContextFilters({ ...createDefaultFilters(), setterCalls: ['K1'], combinationCodes: ['X5'], attackBallTypes: ['Q'] });
    expect(picked).toMatchObject({ setterCalls: ['K1'], combinationCodes: ['X5'], attackBallTypes: ['Q'] });
    expect('base' in picked).toBe(false);
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
    const p1 = getFilteredTouches(stats, { ...createDefaultFilters(), team: 'home', rotation: [1] });
    expect(p1.length).toBeGreaterThan(0);
    expect(p1.length).toBeLessThan(all.length);
    const byRotation = ([1, 2, 3, 4, 5, 6] as const)
      .map((rotation) => getFilteredTouches(stats, { ...createDefaultFilters(), team: 'home', rotation: [rotation] }).length);
    expect(byRotation.reduce((sum, n) => sum + n, 0)).toBe(all.length);
  });

  it('narrows the dashboard touches with the Set type filter', () => {
    const all = getFilteredTouches(stats, { ...createDefaultFilters(), team: 'home' });
    const quick = getFilteredTouches(stats, { ...createDefaultFilters(), team: 'home', attackBallTypes: ['Q'] });
    expect(quick.length).toBeGreaterThan(0);
    expect(quick.length).toBeLessThan(all.length);
  });

  it('Base and Combination together keep no more touches than either alone', () => {
    const options = collectAttackCodeOptions(stats.rallyStats, (item) => item.teamSide === 'home');
    expect(options.setterCalls.length).toBeGreaterThan(0);
    expect(options.combinationCodes.length).toBeGreaterThan(0);
    const count = (extra: Partial<DashboardFilters>) => (
      getFilteredTouches(stats, { ...createDefaultFilters(), team: 'home', ...extra }).length
    );
    let combined = 0;
    for (const call of options.setterCalls) {
      for (const combination of options.combinationCodes) {
        const both = count({ setterCalls: [call], combinationCodes: [combination] });
        expect(both).toBeLessThanOrEqual(count({ setterCalls: [call] }));
        expect(both).toBeLessThanOrEqual(count({ combinationCodes: [combination] }));
        combined += both;
      }
    }
    expect(combined).toBeGreaterThan(0);
  });

  it('Base alone keeps the same rallies as the old combined filter did with a setter call', () => {
    // The old reading: a set's own call, an attack's set call through covers (K codes only here).
    const clean = (code: string | undefined) => (code?.trim() ? code.trim().toUpperCase() : null);
    const oldCalls = (touches: readonly BallTouch[], side: 'home' | 'away') => {
      const codes = new Set<string>();
      touches.forEach((item, index) => {
        if (item.teamSide !== side) return;
        let code: string | null = null;
        if (item.skill === 'set') code = clean(item.setterCallCode) ?? clean(item.combinationCode);
        else if (item.skill === 'attack') {
          code = clean(item.combinationCode);
          if (!code) {
            for (let i = index - 1; i >= 0; i -= 1) {
              const prev = touches[i];
              if (prev.teamSide !== side) break;
              if (prev.skill === 'set') { code = clean(prev.setterCallCode) ?? clean(prev.combinationCode); break; }
              if (prev.skill !== 'cover') break;
            }
            code ??= clean(item.setterCallCode);
          }
        }
        if (code) codes.add(code);
      });
      return codes;
    };
    const options = collectAttackCodeOptions(stats.rallyStats, (item) => item.teamSide === 'home');
    for (const call of options.setterCalls) {
      const now = filterRalliesForTeam(stats.rallyStats, { setterCalls: [call] }, 'home');
      const before = stats.rallyStats.filter((r) => oldCalls(r.touches, 'home').has(call));
      expect(now.length).toBeGreaterThan(0);
      expect(now).toEqual(before);
    }
  });
});
