import type { CourtPosition, TeamSide } from '../common/enums';
import type { PlayerRole } from '../systems/types';

export interface LineupSlot {
  courtPosition: CourtPosition;
  playerId: string;
  tacticalRole?: PlayerRole;
}

export interface ActiveLineupSlot {
  courtPosition: CourtPosition;
  playerId: string;
  tacticalRole?: PlayerRole;
  isLibero?: boolean;
  replacedPlayerId?: string;
}

export interface StartingLineup {
  teamSide: TeamSide;
  setterPlayerId?: string;
  liberoPlayerIds: string[];
  slots: LineupSlot[];
  displaySide: 'left' | 'right';
}

export interface ActiveLineup {
  teamSide: TeamSide;
  rotationIndex?: 1 | 2 | 3 | 4 | 5 | 6;
  setterPlayerId?: string;
  liberoPlayerIds: string[];
  slots: ActiveLineupSlot[];
}

export interface RotationState {
  teamSide: TeamSide;
  currentRotationIndex: 1 | 2 | 3 | 4 | 5 | 6;
  slots: LineupSlot[];
}
