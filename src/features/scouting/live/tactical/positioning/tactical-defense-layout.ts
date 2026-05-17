import { DEFAULT_DEFENSE_SYSTEM_BLOCK } from '@src/config/systems';
import type {
  DefenseContext,
  DefensePosition,
  DefenseRotation,
  DefenseSystemBlock,
} from '@src/domain/systems';
import {
  getDefenseContextForTacticalPhase,
  type TeamTacticalPhase,
} from '../tactical-transition';

export function getDefenseRotationPositions(
  system: DefenseSystemBlock,
  context: DefenseContext,
  rotation: DefenseRotation,
): DefensePosition[] {
  return system.contexts[context].find((entry) => entry.rotation === rotation)?.positions
    ?? DEFAULT_DEFENSE_SYSTEM_BLOCK.contexts[context].find((entry) => entry.rotation === rotation)?.positions
    ?? [];
}

export function getDefenseLayoutPositions({
  phase,
  rotation,
  defenseSystemBlock,
}: {
  phase: TeamTacticalPhase;
  rotation: DefenseRotation;
  defenseSystemBlock?: DefenseSystemBlock | null;
}): DefensePosition[] {
  return getDefenseRotationPositions(
    defenseSystemBlock ?? DEFAULT_DEFENSE_SYSTEM_BLOCK,
    getDefenseContextForTacticalPhase(phase),
    rotation,
  );
}
