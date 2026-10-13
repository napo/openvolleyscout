import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RECEPTION_SYSTEM_BLOCK,
  RECEPTION_SYSTEM_PRESET_OPTIONS,
  createDefenseContextsForPreset,
  createReceptionRotationsForPreset,
  getRoleSequenceForOrder,
} from '@src/config/systems';
import { useReceptionSystemStore } from '@src/features/systems/model/reception-system-store';
import { findReceptionSystemForTeam } from '@src/features/systems/model';
import {
  PlayerRole,
  ROLE_ORDER_SEQUENCES,
  getReceptionOverlapFaults,
  getRoleCourtPositions,
  getRoleOrder,
} from '@src/domain/systems';

const FRONT_ROW = new Set([2, 3, 4]);

describe('role order', () => {
  it('reads P-S-C as outside hitter in 2 and middle in 3 (the base OVS system)', () => {
    expect(getRoleOrder(DEFAULT_RECEPTION_SYSTEM_BLOCK.roleSequence)).toBe('PSC');
    expect(getRoleOrder(ROLE_ORDER_SEQUENCES.PCS)).toBe('PCS');
    const pcs = getRoleCourtPositions(ROLE_ORDER_SEQUENCES.PCS, 1);
    expect(pcs.get(PlayerRole.SETTER)).toBe(1);
    expect(pcs.get(PlayerRole.MIDDLE_BLOCKER_1)).toBe(2);
    expect(pcs.get(PlayerRole.OUTSIDE_HITTER_1)).toBe(3);
  });

  it('rotates players from position p to p-1 on each side-out', () => {
    const positions = getRoleCourtPositions(ROLE_ORDER_SEQUENCES.PSC, 6);
    expect(positions.get(PlayerRole.SETTER)).toBe(6);
    expect(positions.get(PlayerRole.OUTSIDE_HITTER_1)).toBe(1);
    expect(positions.get(PlayerRole.MIDDLE_BLOCKER_1)).toBe(5);
  });
});

describe('reception overlap check', () => {
  it('finds no positional fault in the base system', () => {
    DEFAULT_RECEPTION_SYSTEM_BLOCK.rotations.forEach((rotation) => {
      expect(getReceptionOverlapFaults(DEFAULT_RECEPTION_SYSTEM_BLOCK.roleSequence, rotation.rotation, rotation.positions))
        .toEqual([]);
    });
  });

  it('flags a back-row player standing in front of their front-row counterpart', () => {
    const rotation = DEFAULT_RECEPTION_SYSTEM_BLOCK.rotations[0];
    // Rotation 1: the middle blocker in 3 must stay in front of position 6.
    const positions = rotation.positions.map((position) => (
      position.role === PlayerRole.MIDDLE_BLOCKER_2 ? { ...position, y: 90 } : position
    ));
    expect(getReceptionOverlapFaults(DEFAULT_RECEPTION_SYSTEM_BLOCK.roleSequence, 1, positions))
      .toContainEqual({ kind: 'depth', front: 3, back: 6 });
  });
});

describe('reception presets', () => {
  RECEPTION_SYSTEM_PRESET_OPTIONS.forEach((preset) => {
    it(`${preset.id}: legal in every rotation, three receivers`, () => {
      const roleSequence = getRoleSequenceForOrder(preset.order);
      createReceptionRotationsForPreset(preset).forEach((rotation) => {
        expect(getReceptionOverlapFaults(roleSequence, rotation.rotation, rotation.positions)).toEqual([]);

        const courtPositions = getRoleCourtPositions(roleSequence, rotation.rotation);
        const receivers = rotation.positions
          .filter((position) => position.y >= 45)
          .filter((position) => position.role !== PlayerRole.SETTER)
          .filter((position) => !(position.role === PlayerRole.OPPOSITE && position.y > 80))
          .map((position) => position.role);
        expect(receivers).toHaveLength(3);

        const frontOutside = [PlayerRole.OUTSIDE_HITTER_1, PlayerRole.OUTSIDE_HITTER_2]
          .find((role) => FRONT_ROW.has(courtPositions.get(role)!))!;
        if (preset.oppositeReceives) {
          expect(receivers).toContain(PlayerRole.OPPOSITE);
          expect(receivers).not.toContain(frontOutside);
        } else {
          expect(receivers).not.toContain(PlayerRole.OPPOSITE);
          expect(receivers).toContain(frontOutside);
        }
      });
    });
  });
});

describe('defense presets', () => {
  it('P-C-S puts the front-row middle in 3 and the back-row middle (libero) in 5', () => {
    const contexts = createDefenseContextsForPreset({ id: 'pcs-base', order: 'PCS' });
    const roleSequence = getRoleSequenceForOrder('PCS');
    contexts.break_point.forEach((rotation) => {
      const courtPositions = getRoleCourtPositions(roleSequence, rotation.rotation);
      rotation.positions
        .filter((position) => position.role === PlayerRole.MIDDLE_BLOCKER_1 || position.role === PlayerRole.MIDDLE_BLOCKER_2)
        .forEach((position) => {
          expect(position.dataVolleyZone).toBe(FRONT_ROW.has(courtPositions.get(position.role)!) ? '3b' : '7a');
        });
    });
  });
});

describe('team assignment', () => {
  it('gives each team one reception system', () => {
    const { createReceptionSystemBlock, saveReceptionSystemBlock } = useReceptionSystemStore.getState();
    const first = createReceptionSystemBlock({ name: 'A', teamId: 'team-1' });
    const second = createReceptionSystemBlock({ name: 'B', preset: RECEPTION_SYSTEM_PRESET_OPTIONS[2] });
    expect(getRoleOrder(second.roleSequence)).toBe('PCS');

    saveReceptionSystemBlock({ ...second, teamId: 'team-1' });
    const blocks = useReceptionSystemStore.getState().receptionSystemBlocks;
    expect(findReceptionSystemForTeam(blocks, 'team-1')?.id).toBe(second.id);
    expect(blocks.find((block) => block.id === first.id)?.teamId).toBeUndefined();
  });

  it('copies a system without taking its team', () => {
    const { createReceptionSystemBlock } = useReceptionSystemStore.getState();
    const original = createReceptionSystemBlock({ name: 'Original', teamId: 'team-2' });
    const copy = createReceptionSystemBlock({ name: 'Copy', source: original });
    expect(copy.teamId).toBeUndefined();
    expect(copy.rotations).toEqual(original.rotations);
    expect(findReceptionSystemForTeam(useReceptionSystemStore.getState().receptionSystemBlocks, 'team-2')?.id)
      .toBe(original.id);
  });
});
