import type { CourtPosition } from '../common/enums';
import type { Player } from '../roster/types';
import { PlayerRole } from '../systems/types';
import { ROLE_ORDER_SEQUENCES } from '../systems/formations';
import type { LineupSlot, StartingLineup } from './types';

export type AutoLayoutPattern = 'PCS' | 'PSC';

export interface AutoLayoutOptions {
  pattern: AutoLayoutPattern;
  setterPlayerId: string;
  slots: LineupSlot[];
}

export interface AutoLayoutResult {
  slots: LineupSlot[];
  pattern: AutoLayoutPattern;
  setterCourtPosition: CourtPosition;
}

export interface AutoLayoutValidationResult {
  valid: boolean;
  errors: AutoLayoutValidationError[];
}

export type AutoLayoutValidationError =
  | 'setter_not_in_lineup'
  | 'duplicate_tactical_roles'
  | 'invalid_slot_count'
  | 'libero_in_front_row'
  | 'setter_role_missing';

// Positions from the setter's, in court-number order: P-S-C / P-C-S name the
// roles from the setter towards position 2, 3, ... (the next servers), so
// P-S-C puts the outside hitter right after the setter and the middle next.
// Positions: 1(back-right) 2(front-right) 3(front-center) 4(front-left) 5(back-left) 6(back-center)
function positionsFromSetter(setterPos: CourtPosition): CourtPosition[] {
  return Array.from({ length: 6 }, (_, offset) => (((setterPos - 1 + offset) % 6) + 1) as CourtPosition);
}

const PATTERN_ROLE_MAP: Record<AutoLayoutPattern, readonly PlayerRole[]> = ROLE_ORDER_SEQUENCES;

export function generateAutoTacticalLayout(options: AutoLayoutOptions): AutoLayoutResult | null {
  const { pattern, setterPlayerId, slots } = options;

  const setterSlot = slots.find((s) => s.playerId === setterPlayerId);
  if (!setterSlot) return null;

  const setterPos = setterSlot.courtPosition;
  const orderedPositions = positionsFromSetter(setterPos);
  const roleMap = PATTERN_ROLE_MAP[pattern];

  const positionToRole = new Map<CourtPosition, PlayerRole>();
  orderedPositions.forEach((pos, index) => {
    positionToRole.set(pos, roleMap[index]);
  });

  const updatedSlots: LineupSlot[] = slots.map((slot) => ({
    ...slot,
    tacticalRole: positionToRole.get(slot.courtPosition) ?? slot.tacticalRole,
  }));

  return {
    slots: updatedSlots,
    pattern,
    setterCourtPosition: setterPos,
  };
}

export function detectSetterFromPlayers(
  players: Pick<Player, 'id' | 'role'>[],
  preferredSetterPlayerId?: string,
): string | undefined {
  if (preferredSetterPlayerId) {
    const preferred = players.find((p) => p.id === preferredSetterPlayerId);
    if (preferred) return preferred.id;
  }

  return players.find((p) => p.role === 'setter')?.id;
}

export function detectSetterFromLineup(
  lineup: StartingLineup,
  players: Pick<Player, 'id' | 'role'>[],
): string | undefined {
  if (lineup.setterPlayerId) return lineup.setterPlayerId;

  const slotPlayerIds = new Set(lineup.slots.map((s) => s.playerId));
  const rosterOnCourt = players.filter((p) => slotPlayerIds.has(p.id));

  return detectSetterFromPlayers(rosterOnCourt);
}

export function validateTacticalLayout(slots: LineupSlot[]): AutoLayoutValidationResult {
  const errors: AutoLayoutValidationError[] = [];

  if (slots.length !== 6) {
    errors.push('invalid_slot_count');
    return { valid: false, errors };
  }

  const roles = slots.map((s) => s.tacticalRole).filter(Boolean) as PlayerRole[];

  const setterSlot = slots.find((s) => s.tacticalRole === PlayerRole.SETTER);
  if (!setterSlot) {
    errors.push('setter_role_missing');
  }

  const roleCounts = new Map<PlayerRole, number>();
  roles.forEach((role) => {
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
  });
  const hasDuplicates = [...roleCounts.values()].some((count) => count > 1);
  if (hasDuplicates) {
    errors.push('duplicate_tactical_roles');
  }

  // Front-row positions: 2, 3, 4
  const frontRowPositions = new Set<CourtPosition>([2, 3, 4]);
  const liberoInFrontRow = slots.some(
    (s) => s.tacticalRole === PlayerRole.LIBERO && frontRowPositions.has(s.courtPosition),
  );
  if (liberoInFrontRow) {
    errors.push('libero_in_front_row');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function applyAutoLayoutToStartingLineup(
  lineup: StartingLineup,
  pattern: AutoLayoutPattern,
): StartingLineup | null {
  if (!lineup.setterPlayerId) return null;

  const result = generateAutoTacticalLayout({
    pattern,
    setterPlayerId: lineup.setterPlayerId,
    slots: lineup.slots,
  });

  if (!result) return null;

  return {
    ...lineup,
    slots: result.slots,
  };
}
