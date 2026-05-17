import { DEFAULT_RECEPTION_SYSTEM_BLOCK } from '@src/config/systems';
import type {
  ReceptionPosition,
  ReceptionRotation,
  ReceptionSystemBlock,
} from '@src/domain/systems';

export function getReceptionRotationPositions(
  system: ReceptionSystemBlock,
  rotation: ReceptionRotation,
): ReceptionPosition[] {
  return system.rotations.find((entry) => entry.rotation === rotation)?.positions
    ?? DEFAULT_RECEPTION_SYSTEM_BLOCK.rotations.find((entry) => entry.rotation === rotation)?.positions
    ?? [];
}

export function getReceptionLayoutPositions({
  rotation,
  receptionSystemBlock,
}: {
  rotation: ReceptionRotation;
  receptionSystemBlock?: ReceptionSystemBlock | null;
}): ReceptionPosition[] {
  return getReceptionRotationPositions(
    receptionSystemBlock ?? DEFAULT_RECEPTION_SYSTEM_BLOCK,
    rotation,
  );
}
