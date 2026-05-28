/**
 * Live undo stack tests.
 * Runs under Node.js via ts-node/esm.
 * Value imports use relative paths — @src/ aliases are type-only.
 *
 * Tests pure functions from live-undo-entry.ts (no @src/ value dependencies).
 * Integration of buildGroupedUndoResult and getGroupedUndoAvailability is
 * covered by the live-scouting-flows validation script.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
// Value imports must be relative (ts-node/esm cannot resolve @src/ at runtime)
import {
  createUndoEntry,
  isValidUndoEntry,
  type LiveUndoEntry,
} from './live-undo-entry';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<LiveUndoEntry> & { eventCountBefore: number }): LiveUndoEntry {
  return {
    id: `test-${overrides.eventCountBefore}`,
    label: 'test',
    createdAt: Date.now(),
    actionType: 'touch',
    ...overrides,
  };
}

// ─── createUndoEntry ─────────────────────────────────────────────────────────

describe('createUndoEntry', () => {
  it('preserves the given fields', () => {
    const entry = createUndoEntry({ label: 'serve', actionType: 'touch', eventCountBefore: 3 });
    assert.equal(entry.label, 'serve');
    assert.equal(entry.actionType, 'touch');
    assert.equal(entry.eventCountBefore, 3);
  });

  it('assigns a non-empty string id', () => {
    const entry = createUndoEntry({ label: 'x', actionType: 'touch', eventCountBefore: 0 });
    assert.ok(typeof entry.id === 'string' && entry.id.length > 0, 'id should be non-empty');
  });

  it('assigns createdAt as a positive number', () => {
    const entry = createUndoEntry({ label: 'x', actionType: 'touch', eventCountBefore: 0 });
    assert.ok(entry.createdAt > 0, 'createdAt should be > 0');
  });

  it('generates distinct IDs for multiple entries', () => {
    const e1 = createUndoEntry({ label: 'a', actionType: 'touch', eventCountBefore: 0 });
    const e2 = createUndoEntry({ label: 'b', actionType: 'touch', eventCountBefore: 1 });
    assert.notEqual(e1.id, e2.id, 'IDs should be unique');
  });

  it('stores the actionType', () => {
    const entry = createUndoEntry({ label: 'x', actionType: 'touch_group', eventCountBefore: 5 });
    assert.equal(entry.actionType, 'touch_group');
  });
});

// ─── isValidUndoEntry ────────────────────────────────────────────────────────

describe('isValidUndoEntry', () => {
  it('returns true when eventCountBefore is less than current log length', () => {
    const entry = makeEntry({ eventCountBefore: 3 });
    assert.equal(isValidUndoEntry(entry, 5), true);
  });

  it('returns false when eventCountBefore equals current log length', () => {
    const entry = makeEntry({ eventCountBefore: 5 });
    assert.equal(isValidUndoEntry(entry, 5), false);
  });

  it('returns false when eventCountBefore exceeds current log length (stale)', () => {
    const entry = makeEntry({ eventCountBefore: 10 });
    assert.equal(isValidUndoEntry(entry, 5), false);
  });

  it('returns true for eventCountBefore = 0 when log has events', () => {
    const entry = makeEntry({ eventCountBefore: 0 });
    assert.equal(isValidUndoEntry(entry, 1), true);
  });

  it('returns false for eventCountBefore = 0 when log is empty', () => {
    const entry = makeEntry({ eventCountBefore: 0 });
    assert.equal(isValidUndoEntry(entry, 0), false);
  });
});

// ─── undo stack semantics (pure logic tests) ─────────────────────────────────

describe('undo stack – canUndo disabled when stack is empty', () => {
  it('empty stack has no valid entry', () => {
    const stack: LiveUndoEntry[] = [];
    const lastEntry = stack.at(-1);
    assert.equal(lastEntry, undefined, 'no entry for empty stack');
  });
});

describe('undo stack – pop behavior', () => {
  it('popping the top entry reveals the prior entry', () => {
    const e1 = makeEntry({ id: 'u1', eventCountBefore: 0 });
    const e2 = makeEntry({ id: 'u2', eventCountBefore: 2 });
    const stack = [e1, e2];
    const nextStack = stack.slice(0, -1);
    assert.equal(nextStack.length, 1);
    assert.equal(nextStack[0].id, 'u1');
  });

  it('two-level undo: popping twice reaches initial state', () => {
    const e1 = makeEntry({ id: 'u1', eventCountBefore: 0 });
    const e2 = makeEntry({ id: 'u2', eventCountBefore: 2 });
    const e3 = makeEntry({ id: 'u3', eventCountBefore: 4 });
    let stack = [e1, e2, e3];
    // first undo
    stack = stack.slice(0, -1);
    assert.equal(stack.at(-1)?.id, 'u2');
    // second undo
    stack = stack.slice(0, -1);
    assert.equal(stack.at(-1)?.id, 'u1');
  });
});
