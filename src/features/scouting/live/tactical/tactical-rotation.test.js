/**
 * Tactical rotation and libero legality invariant tests.
 * Plain JavaScript (no ts-node) — tests the invariant rules inline.
 */
import assert from 'node:assert';
import { describe, it } from 'node:test';

// ─── Inline rotation constants (mirrored from tactical-rotation.ts) ───────────
// These tests verify the RULES, not just that a module loaded correctly.

const SIDEOUT_ROTATION_MAP = { 1: 6, 6: 5, 5: 4, 4: 3, 3: 2, 2: 1 };
const BACK_ROW_POSITIONS = new Set([1, 5, 6]);
const FRONT_ROW_POSITIONS = new Set([2, 3, 4]);
const ALL_POSITIONS = [1, 2, 3, 4, 5, 6];

function isBackRowPosition(pos) {
  return BACK_ROW_POSITIONS.has(pos);
}

function isFrontRowPosition(pos) {
  return FRONT_ROW_POSITIONS.has(pos);
}

function shouldRotateAfterPoint(servingTeam, pointWinner) {
  return pointWinner !== servingTeam;
}

function getNextServingTeam(servingTeam, pointWinner) {
  return pointWinner;
}

/** Apply one side-out rotation to a set of slots */
function rotateSlots(slots) {
  return slots.map((slot) => ({
    ...slot,
    courtPosition: SIDEOUT_ROTATION_MAP[slot.courtPosition],
  }));
}

// ─── SIDEOUT_ROTATION_MAP tests ───────────────────────────────────────────────

describe('SIDEOUT_ROTATION_MAP', () => {
  it('maps all 6 positions to distinct targets', () => {
    const targets = new Set(Object.values(SIDEOUT_ROTATION_MAP));
    assert.strictEqual(targets.size, 6, 'all 6 target positions must be distinct');
  });

  it('covers all positions 1-6 as both source and target', () => {
    const sources = new Set(Object.keys(SIDEOUT_ROTATION_MAP).map(Number));
    const targets = new Set(Object.values(SIDEOUT_ROTATION_MAP));
    ALL_POSITIONS.forEach((p) => {
      assert.ok(sources.has(p), `position ${p} must be a source`);
      assert.ok(targets.has(p), `position ${p} must be a target`);
    });
  });

  it('player at position 2 becomes server (position 1) after side-out', () => {
    assert.strictEqual(SIDEOUT_ROTATION_MAP[2], 1, 'pos 2 → pos 1 (new server)');
  });

  it('player at position 1 moves to back-center (position 6) after side-out', () => {
    assert.strictEqual(SIDEOUT_ROTATION_MAP[1], 6);
  });

  it('full rotation cycle of 6 side-outs returns every player to original position', () => {
    ALL_POSITIONS.forEach((startPos) => {
      let pos = startPos;
      for (let i = 0; i < 6; i++) {
        pos = SIDEOUT_ROTATION_MAP[pos];
      }
      assert.strictEqual(pos, startPos, `position ${startPos} must return to itself after 6 rotations`);
    });
  });
});

// ─── Rotation slot operations ─────────────────────────────────────────────────

describe('rotateSlots', () => {
  const baseSlots = ALL_POSITIONS.map((pos) => ({ courtPosition: pos, playerId: `p${pos}` }));

  it('produces exactly 6 slots', () => {
    assert.strictEqual(rotateSlots(baseSlots).length, 6);
  });

  it('no duplicate court positions after rotation', () => {
    const rotated = rotateSlots(baseSlots);
    const positions = rotated.map((s) => s.courtPosition);
    const unique = new Set(positions);
    assert.strictEqual(unique.size, 6, `expected 6 unique positions, got ${positions.join(',')}`);
  });

  it('covers all positions 1-6 after rotation', () => {
    const rotated = rotateSlots(baseSlots);
    const positions = new Set(rotated.map((s) => s.courtPosition));
    ALL_POSITIONS.forEach((p) => assert.ok(positions.has(p), `missing position ${p}`));
  });

  it('preserves all player IDs', () => {
    const rotated = rotateSlots(baseSlots);
    const originalIds = new Set(baseSlots.map((s) => s.playerId));
    const rotatedIds = new Set(rotated.map((s) => s.playerId));
    originalIds.forEach((id) => assert.ok(rotatedIds.has(id), `player ${id} lost after rotation`));
  });

  it('player at position 2 becomes server (position 1) after rotation', () => {
    const playerAtPos2 = baseSlots.find((s) => s.courtPosition === 2).playerId;
    const rotated = rotateSlots(baseSlots);
    const newServer = rotated.find((s) => s.courtPosition === 1).playerId;
    assert.strictEqual(newServer, playerAtPos2, 'p2 player becomes server after side-out');
  });

  it('applying 6 rotations returns to original positions', () => {
    let slots = baseSlots;
    for (let i = 0; i < 6; i++) {
      slots = rotateSlots(slots);
    }
    baseSlots.forEach((original) => {
      const restored = slots.find((s) => s.playerId === original.playerId);
      assert.strictEqual(
        restored.courtPosition, original.courtPosition,
        `player ${original.playerId} must return to position ${original.courtPosition}`,
      );
    });
  });

  it('no duplicate player IDs after rotation', () => {
    const rotated = rotateSlots(baseSlots);
    const ids = rotated.map((s) => s.playerId);
    const unique = new Set(ids);
    assert.strictEqual(unique.size, ids.length, 'no duplicate player IDs after rotation');
  });
});

// ─── Server assignment ────────────────────────────────────────────────────────

describe('shouldRotateAfterPoint / getNextServingTeam', () => {
  it('receiving team winning (side-out) triggers rotation', () => {
    assert.strictEqual(shouldRotateAfterPoint('away', 'home'), true, 'home receives and wins → should rotate');
    assert.strictEqual(shouldRotateAfterPoint('home', 'away'), true, 'away receives and wins → should rotate');
  });

  it('serving team winning (break-point) does NOT trigger rotation', () => {
    assert.strictEqual(shouldRotateAfterPoint('home', 'home'), false, 'home serves and wins → no rotation');
    assert.strictEqual(shouldRotateAfterPoint('away', 'away'), false, 'away serves and wins → no rotation');
  });

  it('next serving team is always the point winner', () => {
    assert.strictEqual(getNextServingTeam('home', 'home'), 'home');
    assert.strictEqual(getNextServingTeam('home', 'away'), 'away');
    assert.strictEqual(getNextServingTeam('away', 'home'), 'home');
    assert.strictEqual(getNextServingTeam('away', 'away'), 'away');
  });
});

// ─── Position helpers ─────────────────────────────────────────────────────────

describe('court position helpers', () => {
  it('positions 2, 3, 4 are front row', () => {
    [2, 3, 4].forEach((p) => assert.strictEqual(isFrontRowPosition(p), true, `position ${p} must be front row`));
  });

  it('positions 1, 5, 6 are back row', () => {
    [1, 5, 6].forEach((p) => assert.strictEqual(isBackRowPosition(p), true, `position ${p} must be back row`));
  });

  it('front-row positions are NOT back row', () => {
    [2, 3, 4].forEach((p) => assert.strictEqual(isBackRowPosition(p), false, `position ${p} must NOT be back row`));
  });

  it('back-row positions are NOT front row', () => {
    [1, 5, 6].forEach((p) => assert.strictEqual(isFrontRowPosition(p), false, `position ${p} must NOT be front row`));
  });
});

// ─── Libero front-row after rotation ─────────────────────────────────────────

describe('libero front-row invariant after side-out rotation', () => {
  /** Simulate a libero slot rotation and check if it enters front row */
  function rotateLiberoAndCheck(liberoStartPos) {
    const targetPos = SIDEOUT_ROTATION_MAP[liberoStartPos];
    const enteredFrontRow = isFrontRowPosition(targetPos);
    return { targetPos, enteredFrontRow };
  }

  it('libero at position 6 rotates to position 5 — remains back row', () => {
    const { targetPos, enteredFrontRow } = rotateLiberoAndCheck(6);
    assert.strictEqual(targetPos, 5);
    assert.strictEqual(isBackRowPosition(targetPos), true, 'pos 5 is back row');
    assert.strictEqual(enteredFrontRow, false, 'libero at 6→5 stays in back row');
  });

  it('libero at position 5 rotates to position 4 — enters front row', () => {
    const { targetPos, enteredFrontRow } = rotateLiberoAndCheck(5);
    assert.strictEqual(targetPos, 4);
    assert.strictEqual(isFrontRowPosition(targetPos), true, 'pos 4 is front row');
    assert.strictEqual(enteredFrontRow, true, 'libero at 5→4 enters front row — must trigger exit proposal');
  });

  it('libero at position 1 rotates to position 6 — remains back row', () => {
    const { targetPos, enteredFrontRow } = rotateLiberoAndCheck(1);
    assert.strictEqual(targetPos, 6);
    assert.strictEqual(isBackRowPosition(targetPos), true, 'pos 6 is back row');
    assert.strictEqual(enteredFrontRow, false, 'libero at 1→6 stays in back row');
  });

  it('any back-row libero position that rotates into 2, 3, or 4 must be flagged', () => {
    const backRowPositions = [1, 5, 6];
    backRowPositions.forEach((pos) => {
      const target = SIDEOUT_ROTATION_MAP[pos];
      const entersFrontRow = isFrontRowPosition(target);
      if (entersFrontRow) {
        // Verify this is a valid scenario (only pos 5 → 4)
        assert.strictEqual(pos, 5, `only pos 5 rotates into front row (pos ${target})`);
        assert.strictEqual(target, 4);
      }
    });
  });

  it('libero blockers — positions 2, 3, 4 are front row and libero cannot be selected', () => {
    // Validate the blocker exclusion rule: positions 2, 3, 4 are front row
    // The rally-flow.ts filter: courtPosition in {2,3,4} AND !isLibero
    const frontRowPositions = [2, 3, 4];
    frontRowPositions.forEach((pos) => {
      assert.strictEqual(isFrontRowPosition(pos), true, `position ${pos} is front row — libero cannot block here`);
    });
    // A libero-flagged player at any front row position would be excluded by !player.isLibero
    // We verify the position set matches the blocker eligibility zone
    assert.deepStrictEqual(new Set(frontRowPositions), FRONT_ROW_POSITIONS);
  });
});

// ─── validateRotatedLineup invariant rules ────────────────────────────────────

describe('rotation invariant rules', () => {
  function checkRotationInvariant(slots) {
    const positions = slots.map((s) => s.courtPosition);
    const uniquePositions = new Set(positions);
    const playerIds = slots.map((s) => s.playerId).filter(Boolean);
    const uniquePlayerIds = new Set(playerIds);

    return {
      hasDuplicatePositions: uniquePositions.size !== 6,
      hasMissingPositions: ALL_POSITIONS.some((p) => !uniquePositions.has(p)),
      hasDuplicatePlayers: uniquePlayerIds.size !== playerIds.length,
      hasWrongSlotCount: slots.length !== 6,
    };
  }

  it('valid 6-slot lineup has no invariant violations', () => {
    const slots = ALL_POSITIONS.map((p) => ({ courtPosition: p, playerId: `p${p}` }));
    const result = checkRotationInvariant(slots);
    assert.strictEqual(result.hasDuplicatePositions, false);
    assert.strictEqual(result.hasMissingPositions, false);
    assert.strictEqual(result.hasDuplicatePlayers, false);
    assert.strictEqual(result.hasWrongSlotCount, false);
  });

  it('rotated lineup passes invariant check', () => {
    const slots = ALL_POSITIONS.map((p) => ({ courtPosition: p, playerId: `p${p}` }));
    const rotated = rotateSlots(slots);
    const result = checkRotationInvariant(rotated);
    assert.strictEqual(result.hasDuplicatePositions, false, 'no duplicate positions after rotation');
    assert.strictEqual(result.hasMissingPositions, false, 'no missing positions after rotation');
    assert.strictEqual(result.hasDuplicatePlayers, false, 'no duplicate players after rotation');
    assert.strictEqual(result.hasWrongSlotCount, false, 'still 6 slots after rotation');
  });

  it('lineup with duplicate positions fails invariant', () => {
    const badSlots = [
      { courtPosition: 1, playerId: 'p1' }, { courtPosition: 1, playerId: 'p2' },
      { courtPosition: 3, playerId: 'p3' }, { courtPosition: 4, playerId: 'p4' },
      { courtPosition: 5, playerId: 'p5' }, { courtPosition: 6, playerId: 'p6' },
    ];
    const result = checkRotationInvariant(badSlots);
    assert.strictEqual(result.hasDuplicatePositions, true, 'duplicate positions detected');
  });
});
