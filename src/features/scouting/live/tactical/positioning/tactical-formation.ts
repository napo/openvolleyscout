import type { CourtPosition } from '@src/domain/common/enums';
import type { ActiveLineupSlot } from '@src/domain/lineup/types';
import type { Player, Team } from '@src/domain/roster/types';
import type { DefenseSystemBlock, ReceptionSystemBlock } from '@src/domain/systems';
import { DEFAULT_RECEPTION_SYSTEM_BLOCK } from '@src/config/systems';

export type TacticalSystemBlock = DefenseSystemBlock | ReceptionSystemBlock;

export function createFallbackSlots(team: Team | null): ActiveLineupSlot[] {
  return Array.from({ length: 6 }, (_, index) => ({
    courtPosition: (index + 1) as CourtPosition,
    playerId: team?.players[index]?.id ?? `placeholder-${index + 1}`,
  }));
}

export function getPlayerJerseyNumber(
  player: Player | undefined,
  fallbackPlayer: Player | undefined,
  courtPosition: CourtPosition,
): number | string {
  return player?.jerseyNumber ?? fallbackPlayer?.jerseyNumber ?? courtPosition;
}

export function getRoleSequence(systemBlock: TacticalSystemBlock): TacticalSystemBlock['roleSequence'] {
  return systemBlock.roleSequence.length > 0
    ? systemBlock.roleSequence
    : DEFAULT_RECEPTION_SYSTEM_BLOCK.roleSequence;
}

export function getRoleSlot({
  slots,
  rolePlayerId,
  displayPlayerId,
}: {
  slots: readonly ActiveLineupSlot[];
  rolePlayerId: string;
  displayPlayerId: string;
}): ActiveLineupSlot | undefined {
  return slots.find((slot) => slot.playerId === rolePlayerId)
    ?? slots.find((slot) => slot.playerId === displayPlayerId)
    ?? slots.find((slot) => slot.replacedPlayerId === rolePlayerId);
}
