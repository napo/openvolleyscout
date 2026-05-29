import assert from 'node:assert';
import { describe, it } from 'node:test';
import { PlayerRole } from '../systems/types';
import type { LineupSlot, StartingLineup } from './types';
import {
  applyAutoLayoutToStartingLineup,
  detectSetterFromLineup,
  detectSetterFromPlayers,
  generateAutoTacticalLayout,
  validateTacticalLayout,
  type AutoLayoutPattern,
} from './auto-layout';

// Six players for a complete lineup (setter at position 1)
function makeSlots(setterPos: number = 1): LineupSlot[] {
  return [
    { courtPosition: 1, playerId: 'p1' },
    { courtPosition: 2, playerId: 'p2' },
    { courtPosition: 3, playerId: 'p3' },
    { courtPosition: 4, playerId: 'p4' },
    { courtPosition: 5, playerId: 'p5' },
    { courtPosition: 6, playerId: 'p6' },
  ].map((s) => ({ ...s, courtPosition: s.courtPosition as 1 | 2 | 3 | 4 | 5 | 6 }));
}

function slotsWithSetterAt(pos: 1 | 2 | 3 | 4 | 5 | 6): LineupSlot[] {
  // Place setter player 'ps' at the given position, shift others to fill gaps
  const all: (1 | 2 | 3 | 4 | 5 | 6)[] = [1, 2, 3, 4, 5, 6];
  return all.map((p, i) => ({
    courtPosition: p,
    playerId: p === pos ? 'ps' : `p${i + 1}`,
  }));
}

function getRoleAtPosition(slots: LineupSlot[], pos: 1 | 2 | 3 | 4 | 5 | 6): PlayerRole | undefined {
  return slots.find((s) => s.courtPosition === pos)?.tacticalRole;
}

function getPositionForRole(slots: LineupSlot[], role: PlayerRole): number | undefined {
  return slots.find((s) => s.tacticalRole === role)?.courtPosition;
}

// ─────────────────────────────────────────────────────────────────────────────
// Setter detection
// ─────────────────────────────────────────────────────────────────────────────

describe('detectSetterFromPlayers', () => {
  it('returns the player whose role is setter', () => {
    const players = [
      { id: 'p1', role: 'outside_hitter' as const },
      { id: 'p2', role: 'setter' as const },
      { id: 'p3', role: 'middle_blocker' as const },
    ];
    assert.equal(detectSetterFromPlayers(players), 'p2');
  });

  it('returns undefined when no setter role is found', () => {
    const players = [
      { id: 'p1', role: 'outside_hitter' as const },
      { id: 'p2', role: 'middle_blocker' as const },
    ];
    assert.equal(detectSetterFromPlayers(players), undefined);
  });

  it('prefers the explicit preferred player id', () => {
    const players = [
      { id: 'p1', role: 'setter' as const },
      { id: 'p2', role: 'outside_hitter' as const },
    ];
    // p2 is explicitly preferred even though it is not a setter by role
    assert.equal(detectSetterFromPlayers(players, 'p2'), 'p2');
  });

  it('falls back to role-based detection when preferred id is not in list', () => {
    const players = [{ id: 'p1', role: 'setter' as const }];
    assert.equal(detectSetterFromPlayers(players, 'unknown'), 'p1');
  });
});

describe('detectSetterFromLineup', () => {
  it('returns setterPlayerId when already set', () => {
    const lineup: StartingLineup = {
      teamSide: 'home',
      setterPlayerId: 'ps',
      liberoPlayerIds: [],
      slots: makeSlots(),
      displaySide: 'left',
    };
    const players = [{ id: 'ps', role: 'setter' as const }];
    assert.equal(detectSetterFromLineup(lineup, players), 'ps');
  });

  it('auto-detects setter by role when setterPlayerId is absent', () => {
    const lineup: StartingLineup = {
      teamSide: 'home',
      liberoPlayerIds: [],
      slots: [
        { courtPosition: 1, playerId: 'p1' },
        { courtPosition: 2, playerId: 'ps' },
        { courtPosition: 3, playerId: 'p3' },
        { courtPosition: 4, playerId: 'p4' },
        { courtPosition: 5, playerId: 'p5' },
        { courtPosition: 6, playerId: 'p6' },
      ],
      displaySide: 'left',
    };
    const players = [
      { id: 'ps', role: 'setter' as const },
      { id: 'p1', role: 'outside_hitter' as const },
    ];
    assert.equal(detectSetterFromLineup(lineup, players), 'ps');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PCS auto-layout
// ─────────────────────────────────────────────────────────────────────────────

describe('generateAutoTacticalLayout – PCS, setter at position 1', () => {
  const slots = slotsWithSetterAt(1);
  const result = generateAutoTacticalLayout({ pattern: 'PCS', setterPlayerId: 'ps', slots });

  it('returns a result', () => assert.ok(result));
  it('reports setter court position as 1', () => assert.equal(result?.setterCourtPosition, 1));
  it('assigns SETTER to position 1', () => assert.equal(getRoleAtPosition(result!.slots, 1), PlayerRole.SETTER));
  it('assigns MIDDLE_BLOCKER_1 to position 6 (ccw[1] from 1)', () => assert.equal(getRoleAtPosition(result!.slots, 6), PlayerRole.MIDDLE_BLOCKER_1));
  it('assigns OUTSIDE_HITTER_1 to position 5 (ccw[2] from 1)', () => assert.equal(getRoleAtPosition(result!.slots, 5), PlayerRole.OUTSIDE_HITTER_1));
  it('assigns OPPOSITE to position 4 (ccw[3] – diagonal)', () => assert.equal(getRoleAtPosition(result!.slots, 4), PlayerRole.OPPOSITE));
  it('assigns MIDDLE_BLOCKER_2 to position 3 (ccw[4])', () => assert.equal(getRoleAtPosition(result!.slots, 3), PlayerRole.MIDDLE_BLOCKER_2));
  it('assigns OUTSIDE_HITTER_2 to position 2 (ccw[5])', () => assert.equal(getRoleAtPosition(result!.slots, 2), PlayerRole.OUTSIDE_HITTER_2));
});

describe('generateAutoTacticalLayout – PCS, setter at position 3', () => {
  const slots = slotsWithSetterAt(3);
  const result = generateAutoTacticalLayout({ pattern: 'PCS', setterPlayerId: 'ps', slots });

  it('returns a result', () => assert.ok(result));
  it('assigns SETTER to position 3', () => assert.equal(getRoleAtPosition(result!.slots, 3), PlayerRole.SETTER));
  // ccw from 3: 3→2→1→6→5→4
  it('assigns MIDDLE_BLOCKER_1 to position 2 (ccw[1] from 3)', () => assert.equal(getRoleAtPosition(result!.slots, 2), PlayerRole.MIDDLE_BLOCKER_1));
  it('assigns OUTSIDE_HITTER_1 to position 1 (ccw[2])', () => assert.equal(getRoleAtPosition(result!.slots, 1), PlayerRole.OUTSIDE_HITTER_1));
  it('assigns OPPOSITE to position 6 (ccw[3])', () => assert.equal(getRoleAtPosition(result!.slots, 6), PlayerRole.OPPOSITE));
  it('assigns MIDDLE_BLOCKER_2 to position 5 (ccw[4])', () => assert.equal(getRoleAtPosition(result!.slots, 5), PlayerRole.MIDDLE_BLOCKER_2));
  it('assigns OUTSIDE_HITTER_2 to position 4 (ccw[5])', () => assert.equal(getRoleAtPosition(result!.slots, 4), PlayerRole.OUTSIDE_HITTER_2));
});

// ─────────────────────────────────────────────────────────────────────────────
// PSC auto-layout
// ─────────────────────────────────────────────────────────────────────────────

describe('generateAutoTacticalLayout – PSC, setter at position 1', () => {
  const slots = slotsWithSetterAt(1);
  const result = generateAutoTacticalLayout({ pattern: 'PSC', setterPlayerId: 'ps', slots });

  it('returns a result', () => assert.ok(result));
  it('assigns SETTER to position 1', () => assert.equal(getRoleAtPosition(result!.slots, 1), PlayerRole.SETTER));
  it('assigns OUTSIDE_HITTER_1 to position 6 (ccw[1] from 1)', () => assert.equal(getRoleAtPosition(result!.slots, 6), PlayerRole.OUTSIDE_HITTER_1));
  it('assigns MIDDLE_BLOCKER_1 to position 5 (ccw[2])', () => assert.equal(getRoleAtPosition(result!.slots, 5), PlayerRole.MIDDLE_BLOCKER_1));
  it('assigns OPPOSITE to position 4 (ccw[3])', () => assert.equal(getRoleAtPosition(result!.slots, 4), PlayerRole.OPPOSITE));
  it('assigns OUTSIDE_HITTER_2 to position 3 (ccw[4])', () => assert.equal(getRoleAtPosition(result!.slots, 3), PlayerRole.OUTSIDE_HITTER_2));
  it('assigns MIDDLE_BLOCKER_2 to position 2 (ccw[5])', () => assert.equal(getRoleAtPosition(result!.slots, 2), PlayerRole.MIDDLE_BLOCKER_2));
});

describe('generateAutoTacticalLayout – PCS vs PSC differ for middle and outside positions', () => {
  const slots = slotsWithSetterAt(1);
  const pcs = generateAutoTacticalLayout({ pattern: 'PCS', setterPlayerId: 'ps', slots })!;
  const psc = generateAutoTacticalLayout({ pattern: 'PSC', setterPlayerId: 'ps', slots })!;

  it('PCS and PSC agree on SETTER position', () => {
    assert.equal(getPositionForRole(pcs.slots, PlayerRole.SETTER), getPositionForRole(psc.slots, PlayerRole.SETTER));
  });

  it('PCS and PSC agree on OPPOSITE position', () => {
    assert.equal(getPositionForRole(pcs.slots, PlayerRole.OPPOSITE), getPositionForRole(psc.slots, PlayerRole.OPPOSITE));
  });

  it('PCS and PSC differ for OUTSIDE_HITTER_1 position', () => {
    assert.notEqual(
      getPositionForRole(pcs.slots, PlayerRole.OUTSIDE_HITTER_1),
      getPositionForRole(psc.slots, PlayerRole.OUTSIDE_HITTER_1),
    );
  });

  it('PCS and PSC differ for MIDDLE_BLOCKER_1 position', () => {
    assert.notEqual(
      getPositionForRole(pcs.slots, PlayerRole.MIDDLE_BLOCKER_1),
      getPositionForRole(psc.slots, PlayerRole.MIDDLE_BLOCKER_1),
    );
  });
});

describe('generateAutoTacticalLayout – setter not in slots', () => {
  it('returns null when setterPlayerId is not found', () => {
    const slots = slotsWithSetterAt(1);
    const result = generateAutoTacticalLayout({ pattern: 'PCS', setterPlayerId: 'nobody', slots });
    assert.equal(result, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

describe('validateTacticalLayout', () => {
  it('passes for a complete PCS layout', () => {
    const slots = slotsWithSetterAt(1);
    const result = generateAutoTacticalLayout({ pattern: 'PCS', setterPlayerId: 'ps', slots })!;
    const validation = validateTacticalLayout(result.slots);
    assert.ok(validation.valid, `Expected valid, got errors: ${validation.errors.join(', ')}`);
  });

  it('fails when slot count is not 6', () => {
    const slots: LineupSlot[] = [{ courtPosition: 1, playerId: 'p1', tacticalRole: PlayerRole.SETTER }];
    const validation = validateTacticalLayout(slots);
    assert.ok(!validation.valid);
    assert.ok(validation.errors.includes('invalid_slot_count'));
  });

  it('fails when setter role is missing', () => {
    const slots: LineupSlot[] = [
      { courtPosition: 1, playerId: 'p1', tacticalRole: PlayerRole.OUTSIDE_HITTER_1 },
      { courtPosition: 2, playerId: 'p2', tacticalRole: PlayerRole.MIDDLE_BLOCKER_1 },
      { courtPosition: 3, playerId: 'p3', tacticalRole: PlayerRole.OUTSIDE_HITTER_2 },
      { courtPosition: 4, playerId: 'p4', tacticalRole: PlayerRole.OPPOSITE },
      { courtPosition: 5, playerId: 'p5', tacticalRole: PlayerRole.MIDDLE_BLOCKER_2 },
      { courtPosition: 6, playerId: 'p6' },
    ];
    const validation = validateTacticalLayout(slots);
    assert.ok(!validation.valid);
    assert.ok(validation.errors.includes('setter_role_missing'));
  });

  it('fails when tactical roles are duplicated', () => {
    const slots: LineupSlot[] = [
      { courtPosition: 1, playerId: 'p1', tacticalRole: PlayerRole.SETTER },
      { courtPosition: 2, playerId: 'p2', tacticalRole: PlayerRole.SETTER },
      { courtPosition: 3, playerId: 'p3', tacticalRole: PlayerRole.MIDDLE_BLOCKER_1 },
      { courtPosition: 4, playerId: 'p4', tacticalRole: PlayerRole.OPPOSITE },
      { courtPosition: 5, playerId: 'p5', tacticalRole: PlayerRole.OUTSIDE_HITTER_1 },
      { courtPosition: 6, playerId: 'p6', tacticalRole: PlayerRole.OUTSIDE_HITTER_2 },
    ];
    const validation = validateTacticalLayout(slots);
    assert.ok(!validation.valid);
    assert.ok(validation.errors.includes('duplicate_tactical_roles'));
  });

  it('fails when libero is in a front-row position', () => {
    const slots: LineupSlot[] = [
      { courtPosition: 1, playerId: 'p1', tacticalRole: PlayerRole.SETTER },
      { courtPosition: 2, playerId: 'p2', tacticalRole: PlayerRole.LIBERO },
      { courtPosition: 3, playerId: 'p3', tacticalRole: PlayerRole.MIDDLE_BLOCKER_1 },
      { courtPosition: 4, playerId: 'p4', tacticalRole: PlayerRole.OPPOSITE },
      { courtPosition: 5, playerId: 'p5', tacticalRole: PlayerRole.OUTSIDE_HITTER_1 },
      { courtPosition: 6, playerId: 'p6', tacticalRole: PlayerRole.OUTSIDE_HITTER_2 },
    ];
    const validation = validateTacticalLayout(slots);
    assert.ok(!validation.valid);
    assert.ok(validation.errors.includes('libero_in_front_row'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyAutoLayoutToStartingLineup
// ─────────────────────────────────────────────────────────────────────────────

describe('applyAutoLayoutToStartingLineup', () => {
  it('returns null when setterPlayerId is not set', () => {
    const lineup: StartingLineup = {
      teamSide: 'home',
      liberoPlayerIds: [],
      slots: makeSlots(),
      displaySide: 'left',
    };
    assert.equal(applyAutoLayoutToStartingLineup(lineup, 'PCS'), null);
  });

  it('returns a lineup with tactical roles assigned for PCS', () => {
    const lineup: StartingLineup = {
      teamSide: 'home',
      setterPlayerId: 'ps',
      liberoPlayerIds: [],
      slots: slotsWithSetterAt(1),
      displaySide: 'left',
    };
    const updated = applyAutoLayoutToStartingLineup(lineup, 'PCS');
    assert.ok(updated);
    const setterSlot = updated.slots.find((s) => s.playerId === 'ps');
    assert.equal(setterSlot?.tacticalRole, PlayerRole.SETTER);
  });

  it('preserves setter player id after auto layout', () => {
    const lineup: StartingLineup = {
      teamSide: 'home',
      setterPlayerId: 'ps',
      liberoPlayerIds: [],
      slots: slotsWithSetterAt(2),
      displaySide: 'right',
    };
    const updated = applyAutoLayoutToStartingLineup(lineup, 'PSC');
    assert.ok(updated);
    assert.equal(updated.setterPlayerId, 'ps');
  });

  it('all six slots get a tactical role assigned', () => {
    const lineup: StartingLineup = {
      teamSide: 'away',
      setterPlayerId: 'ps',
      liberoPlayerIds: [],
      slots: slotsWithSetterAt(4),
      displaySide: 'left',
    };
    const updated = applyAutoLayoutToStartingLineup(lineup, 'PCS')!;
    const assignedCount = updated.slots.filter((s) => s.tacticalRole !== undefined).length;
    assert.equal(assignedCount, 6);
  });
});
