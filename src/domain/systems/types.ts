import type { TacticalSystemKind } from '../tactical/types';
import type { CourtPosition } from '../common/enums';
import type { ScoutingZoneId } from '../spatial';

export type SystemKind = TacticalSystemKind;

export interface ZoneResponsibility {
  zoneId: ScoutingZoneId;
  primaryCourtPosition: CourtPosition;
  fallbackCourtPositions: CourtPosition[];
}

export interface TacticalSystemDefinition {
  id: string;
  name: string;
  kind: SystemKind;
  teamId?: string;
  rotationIndex?: 1 | 2 | 3 | 4 | 5 | 6;
  responsibilities: ZoneResponsibility[];
}

export enum PlayerRole {
  SETTER = 'SETTER',
  OPPOSITE = 'OPPOSITE',
  OUTSIDE_HITTER_1 = 'OUTSIDE_HITTER_1',
  OUTSIDE_HITTER_2 = 'OUTSIDE_HITTER_2',
  MIDDLE_BLOCKER_1 = 'MIDDLE_BLOCKER_1',
  MIDDLE_BLOCKER_2 = 'MIDDLE_BLOCKER_2',
  LIBERO = 'LIBERO',
}

export type DefenseRotation = 1 | 2 | 3 | 4 | 5 | 6;

export type DefenseContext = 'break_point' | 'side_out';

export interface PlayingSystem {
  id: string;
  roleSequence: PlayerRole[];
}

export interface DefensePosition {
  role: PlayerRole;
  dataVolleyZone: string;
  x: number;
  y: number;
}

export interface DefenseRotationSystem {
  rotation: DefenseRotation;
  positions: DefensePosition[];
}

export type DefenseSystemContexts = Record<DefenseContext, DefenseRotationSystem[]>;

export interface DefenseSystemBlock {
  id: string;
  name: string;
  teamId?: string;
  playingSystemId?: string;
  roleSequence: PlayerRole[];
  contexts: DefenseSystemContexts;
}
