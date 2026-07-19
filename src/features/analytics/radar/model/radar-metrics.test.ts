/**
 * Radar metrics tests.
 * Runs under Node.js via ts-node/esm.
 * Value imports use relative paths — @src/ aliases are type-only.
 * match-stats.ts itself is NOT value-imported here: its transitive deps
 * (live/libero) still use @src/ value imports that ts-node/esm can't resolve,
 * so fixtures below are plain literals typed via `import type` only.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { MatchStats, PlayerStats, SkillStats, TeamStats } from '@src/features/scouting/model/match-stats';
// Value imports must be relative (ts-node/esm cannot resolve @src/ at runtime)
import {
  computeRadarValuesFromSkillStats,
  computePlayerRadarValues,
  computeTeamRadarValues,
  DEFAULT_RADAR_AXIS_IDS,
  RADAR_AXES,
} from './radar-metrics';
import { makeIndicators } from '../../../scouting/model/indicators';

function emptySkillStats(overrides: Partial<SkillStats> = {}): SkillStats {
  return {
    total: 0,
    positive: 0,
    perfect: 0,
    errors: 0,
    points: 0,
    neutral: 0,
    slash: 0,
    exclamation: 0,
    minus: 0,
    plus: 0,
    hash: 0,
    equal: 0,
    ...overrides,
  };
}

function emptyTeamStats(teamSide: TeamStats['teamSide'], teamName: string): TeamStats {
  return {
    teamSide,
    teamName,
    totalTouches: 0,
    points: 0,
    errors: 0,
    winningTouches: 0,
    aces: 0,
    attackPoints: 0,
    blockPoints: 0,
    serveErrors: 0,
    attackErrors: 0,
    attackBlocked: 0,
    receptionErrors: 0,
    serve: emptySkillStats(),
    receive: emptySkillStats(),
    set: emptySkillStats(),
    attack: emptySkillStats(),
    block: emptySkillStats(),
    dig: emptySkillStats(),
    freeball: emptySkillStats(),
    cover: emptySkillStats(),
  };
}

function emptyPlayerStats(playerId: string, teamSide: PlayerStats['teamSide']): PlayerStats {
  return {
    playerId,
    jerseyNumber: 4,
    playerName: 'Test Player',
    teamSide,
    totalTouches: 0,
    points: 0,
    errors: 0,
    winningTouches: 0,
    aces: 0,
    attackPoints: 0,
    blockPoints: 0,
    serveErrors: 0,
    attackErrors: 0,
    attackBlocked: 0,
    receptionErrors: 0,
    serve: emptySkillStats(),
    receive: emptySkillStats(),
    set: emptySkillStats(),
    attack: emptySkillStats(),
    block: emptySkillStats(),
    dig: emptySkillStats(),
    freeball: emptySkillStats(),
    cover: emptySkillStats(),
  };
}

function emptyMatchStats(): MatchStats {
  const home = emptyTeamStats('home', 'Home');
  const away = emptyTeamStats('away', 'Away');
  const emptySideOut = { sideOutAttempts: 0, sideOutWins: 0, sideOutPercentage: null };
  const emptyBreakPoint = { breakPointAttempts: 0, breakPointWins: 0, breakPointPercentage: null };
  return {
    teamStats: { home, away },
    playerStats: [],
    setStats: [],
    rallyStats: [],
    setsWon: { home: 0, away: 0 },
    totalTouches: 0,
    quickStats: { teams: {} as never, players: [] },
    advancedStats: {
      sideOut: { home: emptySideOut, away: emptySideOut },
      breakPoint: { home: emptyBreakPoint, away: emptyBreakPoint },
      rotations: { home: [], away: [] },
    },
    sideOutStats: { home: emptySideOut, away: emptySideOut },
    breakPointStats: { home: emptyBreakPoint, away: emptyBreakPoint },
    rotationStats: { home: [], away: [] },
    crossRotationStats: { bySide: {} as never },
  };
}

describe('RADAR_AXES / DEFAULT_RADAR_AXIS_IDS', () => {
  it('exposes exactly 8 axes, 5 marked default', () => {
    assert.strictEqual(RADAR_AXES.length, 8);
    assert.strictEqual(DEFAULT_RADAR_AXIS_IDS.length, 5);
    assert.deepStrictEqual(
      DEFAULT_RADAR_AXIS_IDS,
      ['serveEfficiency', 'receptionEfficiency', 'attackEfficiency', 'sideOutPct', 'breakPointPct'],
    );
  });
});

describe('computeRadarValuesFromSkillStats', () => {
  it('returns null for efficiency/rate axes when total is 0', () => {
    const skills = { serve: emptySkillStats(), receive: emptySkillStats(), attack: emptySkillStats() };
    const values = computeRadarValuesFromSkillStats(skills, null, null);
    assert.strictEqual(values.serveEfficiency, null);
    assert.strictEqual(values.receptionEfficiency, null);
    assert.strictEqual(values.attackEfficiency, null);
    assert.strictEqual(values.servePositiveRate, null);
    assert.strictEqual(values.receptionPositiveRate, null);
    assert.strictEqual(values.attackKillRate, null);
    assert.strictEqual(values.sideOutPct, null);
    assert.strictEqual(values.breakPointPct, null);
  });

  it('matches makeIndicators() formulas directly (no divergence)', () => {
    const serve = emptySkillStats({ total: 10, hash: 3, plus: 2, minus: 1, equal: 1 });
    const receive = emptySkillStats({ total: 10, hash: 4, plus: 3, slash: 1, equal: 1 });
    const attack = emptySkillStats({ total: 10, hash: 5, slash: 1, equal: 1 });
    const indicators = makeIndicators();

    const values = computeRadarValuesFromSkillStats({ serve, receive, attack }, 0.5, 0.4, indicators);

    assert.strictEqual(values.serveEfficiency, indicators.serveEfficiency(serve));
    assert.strictEqual(values.receptionEfficiency, indicators.receptionEfficiency(receive));
    assert.strictEqual(values.attackEfficiency, indicators.attackEfficiency(attack));
    assert.strictEqual(values.servePositiveRate, indicators.servePositiveRate(serve));
    assert.strictEqual(values.receptionPositiveRate, indicators.receptionPositiveRate(receive));
    assert.strictEqual(values.attackKillRate, indicators.attackKillRate(attack));
    assert.strictEqual(values.sideOutPct, 0.5);
    assert.strictEqual(values.breakPointPct, 0.4);
  });
});

describe('computeTeamRadarValues / computePlayerRadarValues', () => {
  it('returns all-null radar values for a team with no rallies/touches', () => {
    const stats = emptyMatchStats();
    const values = computeTeamRadarValues(stats, 'home');
    assert.strictEqual(values.serveEfficiency, null);
    assert.strictEqual(values.sideOutPct, null);
    assert.strictEqual(values.breakPointPct, null);
  });

  it('returns all-null radar values for a player with no touches/rallies', () => {
    const stats = emptyMatchStats();
    const player = emptyPlayerStats('p1', 'home');
    const values = computePlayerRadarValues(stats, player);
    assert.strictEqual(values.attackEfficiency, null);
    assert.strictEqual(values.sideOutPct, null);
    assert.strictEqual(values.breakPointPct, null);
  });
});
