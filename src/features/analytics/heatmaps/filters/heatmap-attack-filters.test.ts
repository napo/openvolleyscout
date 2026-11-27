// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { SkillType, TeamSide } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
import {
  collectHeatmapAttackCodes,
  countActiveAttackFilters,
  EMPTY_HEATMAP_ATTACK_FILTERS,
  filterRalliesByAttackFilters,
  hasAnyAttackFilter,
  type HeatmapAttackFilters,
} from './heatmap-attack-filters';

let counter = 0;
function touch(teamSide: TeamSide, skill: SkillType, extra: Partial<BallTouch> = {}): BallTouch {
  counter += 1;
  return { id: `t${counter}`, setNumber: 1, rallyNumber: 1, sequenceNumber: counter, createdAt: counter, teamSide, skill, ...extra };
}

function rally(rallyNumber: number, touches: BallTouch[]): RallyStats {
  return {
    setNumber: 1,
    rallyNumber,
    // Rally order is the order given here, whatever order the touches were built in.
    touches: touches.map((t, index) => Object.assign(t, { rallyNumber, sequenceNumber: index + 1, createdAt: index + 1 })),
    dataVolleyCode: '',
    servingTeam: 'away',
    pointWinner: 'home',
    terminalReason: null,
    scoreBefore: { home: rallyNumber - 1, away: 0 },
    setTargetPoints: 25,
  };
}

function filters(partial: Partial<HeatmapAttackFilters>): HeatmapAttackFilters {
  return { ...EMPTY_HEATMAP_ATTACK_FILTERS, ...partial };
}

/** Home attack ids kept by the filter, over all rallies. */
function keptAttacks(rallies: readonly RallyStats[], f: HeatmapAttackFilters, teamSide: TeamSide = 'home'): string[] {
  return filterRalliesByAttackFilters(rallies, teamSide, f)
    .flatMap((r) => r.touches)
    .filter((t) => t.skill === 'attack' && t.teamSide === teamSide)
    .map((t) => t.id);
}

// Rally 1: K1 set, quick X5 attack by p1 (recorded setter in P1).
const r1Attack = touch('home', 'attack', { playerId: 'p1', combinationCode: 'X5', attackType: 'Q', homeSetterPosition: 1 });
const r1 = rally(1, [
  touch('away', 'serve'),
  touch('home', 'receive', { evaluation: '#' }),
  touch('home', 'set', { setterCallCode: 'K1' }),
  r1Attack,
  touch('away', 'dig'),
]);
// Rally 2: older data with the call saved in the set's combination, high V5 attack by p2, no recorded setter.
const r2Attack = touch('home', 'attack', { playerId: 'p2', combinationCode: 'V5', skillTypeCode: 'h' });
const r2OpponentAttack = touch('away', 'attack', { combinationCode: 'X6', attackType: 'Q' });
const r2 = rally(2, [
  touch('away', 'serve'),
  touch('home', 'receive', { evaluation: '+' }),
  touch('home', 'set', { combinationCode: 'k2' }),
  r2Attack,
  touch('away', 'dig'),
  touch('away', 'set', { setterCallCode: 'K7' }),
  r2OpponentAttack,
]);
const rallies = [r1, r2];

describe('filterRalliesByAttackFilters', () => {
  it('returns every rally unchanged when no filter is chosen', () => {
    const result = filterRalliesByAttackFilters(rallies, 'home', EMPTY_HEATMAP_ATTACK_FILTERS);
    expect(result).toEqual(rallies);
    expect(result[0]).toBe(r1);
  });

  it('matches the Base on the set before the attack, even when the attack has its own combination', () => {
    expect(keptAttacks(rallies, filters({ setterCalls: ['K1'] }))).toEqual([r1Attack.id]);
    // The older combination field of the set still gives the Base.
    expect(keptAttacks(rallies, filters({ setterCalls: ['K2'] }))).toEqual([r2Attack.id]);
  });

  it("matches the Combination on the attack's own code only; a K code is never a combination", () => {
    expect(keptAttacks(rallies, filters({ combinationCodes: ['X5'] }))).toEqual([r1Attack.id]);
    expect(keptAttacks(rallies, filters({ combinationCodes: ['K1'] }))).toEqual([]);
  });

  it('crosses Base and Combination with AND', () => {
    expect(keptAttacks(rallies, filters({ setterCalls: ['K1'], combinationCodes: ['V5'] }))).toEqual([]);
    expect(keptAttacks(rallies, filters({ setterCalls: ['K1', 'K2'], combinationCodes: ['V5'] }))).toEqual([r2Attack.id]);
  });

  it('matches the set type on the attack letter, from the attack type or the skill type code, ignoring case', () => {
    expect(keptAttacks(rallies, filters({ attackBallTypes: ['Q'] }))).toEqual([r1Attack.id]);
    expect(keptAttacks(rallies, filters({ attackBallTypes: ['H'] }))).toEqual([r2Attack.id]);
    expect(keptAttacks(rallies, filters({ attackBallTypes: ['H'], setterCalls: ['K1'] }))).toEqual([]);
  });

  it("keeps the other skills and the other team's attacks", () => {
    const result = filterRalliesByAttackFilters(rallies, 'home', filters({ attackBallTypes: ['Q'] }));
    expect(result[0]).toBe(r1);
    expect(result[1].touches.map((t) => t.id)).toEqual(r2.touches.filter((t) => t.id !== r2Attack.id).map((t) => t.id));
    expect(result[1].touches.some((t) => t.id === r2OpponentAttack.id)).toBe(true);
  });

  it('filters the away team with its own codes', () => {
    expect(keptAttacks(rallies, filters({ setterCalls: ['K7'], combinationCodes: ['X6'] }), 'away')).toEqual([r2OpponentAttack.id]);
  });

  it('keeps using only the recorded setter position for the rotation', () => {
    expect(keptAttacks(rallies, filters({ rotations: [1] }))).toEqual([r1Attack.id]);
  });
});

describe('collectHeatmapAttackCodes', () => {
  it("lists the Base and Combination codes of the team's attacks", () => {
    expect(collectHeatmapAttackCodes(rallies, 'home')).toEqual({ setterCalls: ['K1', 'K2'], combinationCodes: ['V5', 'X5'] });
    expect(collectHeatmapAttackCodes(rallies, 'home', 'all')).toEqual({ setterCalls: ['K1', 'K2'], combinationCodes: ['V5', 'X5'] });
    expect(collectHeatmapAttackCodes(rallies, 'away')).toEqual({ setterCalls: ['K7'], combinationCodes: ['X6'] });
  });

  it('keeps only the chosen attacker', () => {
    expect(collectHeatmapAttackCodes(rallies, 'home', 'p2')).toEqual({ setterCalls: ['K2'], combinationCodes: ['V5'] });
  });
});

describe('countActiveAttackFilters', () => {
  it('counts one per chosen group, the code groups included', () => {
    expect(countActiveAttackFilters(EMPTY_HEATMAP_ATTACK_FILTERS)).toBe(0);
    expect(hasAnyAttackFilter(EMPTY_HEATMAP_ATTACK_FILTERS)).toBe(false);
    const f = filters({ rotations: [1, 2], setterCalls: ['K1'], combinationCodes: ['X5'], attackBallTypes: ['Q'] });
    expect(countActiveAttackFilters(f)).toBe(4);
    expect(hasAnyAttackFilter(filters({ attackBallTypes: ['H'] }))).toBe(true);
  });
});
