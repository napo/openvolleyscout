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

export type DefenseSystemRole = 'P' | 'O' | 'S1' | 'S2' | 'C1' | 'C2' | 'L';

export interface DefenseSystemPosition {
  role: DefenseSystemRole;
  zone: string;
  x: number;
  y: number;
}

export interface DefenseSystem {
  id: string;
  name: string;
  teamId?: string;
  positions: DefenseSystemPosition[];
}
