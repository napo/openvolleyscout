import type { CourtPosition, TeamSide } from '../common/enums';
import type { CourtZoneId } from '../court';

export type TacticalPhase = 'reception' | 'defense';

export interface TacticalZoneAssignment {
  zoneId: CourtZoneId;
  courtPositions: CourtPosition[];
}

export interface TacticalPhaseMap {
  phase: TacticalPhase;
  assignments: TacticalZoneAssignment[];
}

export interface TacticalSystem {
  teamSide: TeamSide;
  activePhase: TacticalPhase;
  rotationIndex?: 1 | 2 | 3 | 4 | 5 | 6;
  phases: Record<TacticalPhase, TacticalPhaseMap>;
}

export interface PlayerResolutionResult {
  zoneId: CourtZoneId;
  phase: TacticalPhase;
  primaryPlayerId: string | null;
  candidatePlayerIds: string[];
  resolvedCourtPositions: CourtPosition[];
}

export interface AttackCombination {
  id: string;
  name: string;
  teamId?: string;
  rotationIndex?: number;
  description?: string;
  targetZones: CourtZoneId[];
}

export interface SetterCall {
  id: string;
  name: string;
  teamId?: string;
  rotationIndex?: number;
  targetCombinationId?: string;
  description?: string;
}
