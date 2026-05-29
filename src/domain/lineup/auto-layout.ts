import type { CourtPosition } from '../common/enums';
import type { Player } from '../roster/types';
import { PlayerRole } from '../systems/types';
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

// Counter-clockwise traversal from a starting position.
// Italian volleyball PCS/PSC notation reads roles going counterclockwise
// (i.e., in the direction of rotation) from the setter's position.
// Positions: 1(back-right) 2(front-right) 3(front-center) 4(front-left) 5(back-left) 6(back-center)
// Clockwise: 1→2→3→4→5→6  |  Counter-clockwise: 1→6→5→4→3→2
function counterClockwiseFrom(setterPos: CourtPosition): CourtPosition[] {
  const all: CourtPosition[] = [1, 2, 3, 4, 5, 6];
  const startIndex = all.indexOf(setterPos);
  const result: CourtPosition[] = [];
  for (let i = 0; i < 6; i++) {
    result.push(all[(startIndex - i + 6) % 6]);
  }
  return result;
}

// Maps counterclockwise position index (0–5) to tactical role for PCS and PSC.
// Index 0 = setter position, index 3 = opposite position.
const PATTERN_ROLE_MAP: Record<AutoLayoutPattern, PlayerRole[]> = {
  // PCS: Palleggiatore → Centrale → Schiacciatore → Opposto → Centrale → Schiacciatore
  PCS: [
    PlayerRole.SETTER,
    PlayerRole.MIDDLE_BLOCKER_1,
    PlayerRole.OUTSIDE_HITTER_1,
    PlayerRole.OPPOSITE,
    PlayerRole.MIDDLE_BLOCKER_2,
    PlayerRole.OUTSIDE_HITTER_2,
  ],
  // PSC: Palleggiatore → Schiacciatore → Centrale → Opposto → Schiacciatore → Centrale
  PSC: [
    PlayerRole.SETTER,
    PlayerRole.OUTSIDE_HITTER_1,
    PlayerRole.MIDDLE_BLOCKER_1,
    PlayerRole.OPPOSITE,
    PlayerRole.OUTSIDE_HITTER_2,
    PlayerRole.MIDDLE_BLOCKER_2,
  ],
};

export function generateAutoTacticalLayout(options: AutoLayoutOptions): AutoLayoutResult | null {
  const { pattern, setterPlayerId, slots } = options;

  const setterSlot = slots.find((s) => s.playerId === setterPlayerId);
  if (!setterSlot) return null;

  const setterPos = setterSlot.courtPosition;
  const ccwPositions = counterClockwiseFrom(setterPos);
  const roleMap = PATTERN_ROLE_MAP[pattern];

  const positionToRole = new Map<CourtPosition, PlayerRole>();
  ccwPositions.forEach((pos, index) => {
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
