/**
 * Live undo persistence tests.
 * Runs under Node.js via ts-node/esm, with an in-memory localStorage stub.
 * Value imports use relative paths — @src/ aliases are type-only.
 */

import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import type { MatchEvent } from '@src/domain/events/types';
import type { LiveUndoEntry } from './live-undo-entry';
import { loadUndoStack, saveUndoStack } from './live-undo-persistence';

// ─── Helpers ────────────────────────────────────────────────────────────────

const storage = new Map<string, string>();

(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  },
};

function makeLog(ids: string[]): MatchEvent[] {
  return ids.map((id) => ({ id }) as MatchEvent);
}

function makeEntry(eventCountBefore: number): LiveUndoEntry {
  return {
    id: `undo-${eventCountBefore}`,
    label: 'test',
    createdAt: 0,
    actionType: 'touch',
    eventCountBefore,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('live undo persistence', () => {
  beforeEach(() => storage.clear());

  it('restores the stack of the same match', () => {
    const log = makeLog(['e0', 'e1', 'e2', 'e3']);
    const stack = [makeEntry(1), makeEntry(3)];
    saveUndoStack('match-a', log, stack);

    assert.deepStrictEqual(loadUndoStack('match-a', log), stack);
  });

  it('returns nothing for another match', () => {
    const log = makeLog(['e0', 'e1']);
    saveUndoStack('match-a', log, [makeEntry(1)]);

    assert.deepStrictEqual(loadUndoStack('match-b', log), []);
  });

  it('drops entries whose events did not reach the saved log', () => {
    saveUndoStack('match-a', makeLog(['e0', 'e1', 'e2', 'e3']), [makeEntry(1), makeEntry(3)]);

    // The last action's events were not persisted before the reload.
    const savedLog = makeLog(['e0', 'e1', 'e2']);
    assert.deepStrictEqual(loadUndoStack('match-a', savedLog).map((entry) => entry.eventCountBefore), [1]);
  });

  it('drops entries whose starting event differs in the saved log', () => {
    saveUndoStack('match-a', makeLog(['e0', 'e1', 'e2', 'e3']), [makeEntry(1), makeEntry(3)]);

    // Same length, different history from index 3: the entry would cut the wrong event.
    const savedLog = makeLog(['e0', 'e1', 'e2', 'other']);
    assert.deepStrictEqual(loadUndoStack('match-a', savedLog).map((entry) => entry.eventCountBefore), [1]);
  });

  it('clears storage when the stack is empty', () => {
    const log = makeLog(['e0', 'e1']);
    saveUndoStack('match-a', log, [makeEntry(1)]);
    saveUndoStack('match-a', log, []);

    assert.strictEqual(storage.size, 0);
    assert.deepStrictEqual(loadUndoStack('match-a', log), []);
  });

  it('ignores corrupted storage', () => {
    storage.set('openvolleyscout.liveUndoStack', '{not json');
    assert.deepStrictEqual(loadUndoStack('match-a', makeLog(['e0'])), []);
  });
});
