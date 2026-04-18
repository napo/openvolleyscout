import type { CourtPosition, TeamSide } from '../common/enums';

export interface LineupSlot {
  courtPosition: CourtPosition;
  playerId: string;
}

export interface StartingLineup {
  teamSide: TeamSide;
  setterPlayerId?: string;
  liberoPlayerIds: string[];
  slots: LineupSlot[];
}

export interface RotationState {
  teamSide: TeamSide;
  currentRotationIndex: 1 | 2 | 3 | 4 | 5 | 6;
  slots: LineupSlot[];
}
