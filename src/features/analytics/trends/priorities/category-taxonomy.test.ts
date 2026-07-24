/**
 * Category taxonomy tests.
 * Runs under Node.js via ts-node/esm (only type-only @src imports here).
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { PRIORITY_CATEGORIES, getCategoriesForRole } from './category-taxonomy';

describe('getCategoriesForRole', () => {
  it('returns every category when no role is given (team-level diagnosis)', () => {
    assert.strictEqual(getCategoriesForRole(undefined).length, PRIORITY_CATEGORIES.length);
  });

  it('excludes serve for libero (liberos do not serve)', () => {
    const categories = getCategoriesForRole('libero');
    assert.ok(!categories.some((c) => c.id === 'serveEfficiency'));
  });

  it('excludes attack/reception/block categories for setter, keeps serve', () => {
    const categories = getCategoriesForRole('setter');
    assert.ok(!categories.some((c) => c.id === 'attackEfficiency'));
    assert.ok(!categories.some((c) => c.id === 'receptionEfficiency'));
    assert.ok(categories.some((c) => c.id === 'serveEfficiency'));
  });

  it('includes reception and MTRP for outside hitters', () => {
    const categories = getCategoriesForRole('outside_hitter');
    assert.ok(categories.some((c) => c.id === 'receptionEfficiency'));
    assert.ok(categories.some((c) => c.id === 'mtrpPct'));
  });
});
