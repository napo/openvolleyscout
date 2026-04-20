import type { CourtPosition } from '../common/enums';
import type { CourtZoneId } from '../court';

export type SystemKind = 'reception' | 'defense';

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
