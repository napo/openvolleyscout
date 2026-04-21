import type { TacticalSystemKind } from '../tactical/types';
import type { CourtPosition } from '../common/enums';
import type { CourtZoneId } from '../court';

export type SystemKind = TacticalSystemKind;

export interface ZoneResponsibility {
  zoneId: CourtZoneId;
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
