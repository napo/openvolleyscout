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

export interface ActiveLiberoState {
  liberoPlayerId: string;
  replacedPlayerId: string;
  replacedPlayerRole?: PlayerRole;
  teamSide: TeamSide;
  enteredAtRallyNumber: number;
  mustExitBeforeFrontRow?: boolean;
}

export interface NormalSubstitutionRecord {
  teamSide: TeamSide;
  playerOutId: string;
  playerInId: string;
  setNumber: number;
  rallyNumber: number;
  canReenterOnlyForPlayerId: string;
  hasReentered: boolean;
}

export interface TeamSetPersonnelState {
  onCourtPlayerIds: string[];
  benchPlayerIds: string[];
  liberoPlayerId?: string;
  secondLiberoPlayerId?: string;
  liberoAutoMiddleReplacement: boolean;
  activeLiberoState?: ActiveLiberoState;
  lastLiberoReplacementRallyNumber?: number;
  substitutionPairs: NormalSubstitutionRecord[];
  substitutionHistory: NormalSubstitutionRecord[];
}

export interface StartingLineup {
  teamSide: TeamSide;
  setterPlayerId?: string;
  liberoPlayerIds: string[];
  liberoAutoMiddleReplacement?: boolean;
  benchPlayerIds?: string[];
  slots: LineupSlot[];
  displaySide: 'left' | 'right';
}

export interface ActiveLineup {
  teamSide: TeamSide;
  rotationIndex?: 1 | 2 | 3 | 4 | 5 | 6;
  setterPlayerId?: string;
  liberoPlayerIds: string[];
  slots: ActiveLineupSlot[];
  personnelState: TeamSetPersonnelState;
}

export interface RotationState {
  teamSide: TeamSide;
  currentRotationIndex: 1 | 2 | 3 | 4 | 5 | 6;
  slots: LineupSlot[];
}

export type ReportRotationPosition = 1 | 2 | 3 | 4 | 5 | 6;

export interface PlayerSetEntry {
  teamSide: TeamSide;
  playerId: string;
  playerOutId: string;
  setNumber: number;
  rallyNumber: number;
  entryOrder: number;
  exitedSet?: boolean;
  exitRallyNumber?: number;
}

export interface LiberoSetReplacement {
  liberoPlayerId: string;
  replacedPlayerId: string;
  enteredAtRallyNumber: number;
  exitedAtRallyNumber?: number;
  secondLiberoSwap?: boolean;
}

export interface PlayerSetParticipation {
  teamSide: TeamSide;
  playerId: string;
  setNumber: number;
  startedSet: boolean;
  startingRotationPosition?: ReportRotationPosition;
  enteredSet: boolean;
  entryOrder?: number;
  entryRallyNumber?: number;
  firstServer: boolean;
  isLibero: boolean;
  liberoReplacements?: LiberoSetReplacement[];
  replacedByLiberoIds?: string[];
  exitedSet?: boolean;
}

export interface SetLineupSnapshot {
  setNumber: number;
  teamSide: TeamSide;
  startingPlayerIdsByRotation: Record<ReportRotationPosition, string>;
  firstServerPlayerId?: string;
  entries: PlayerSetEntry[];
  liberoEvents: LiberoSetReplacement[];
}
