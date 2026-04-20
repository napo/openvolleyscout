import type { SkillEvaluation, SkillType, TeamSide } from '../common/enums';
import type { CourtGridPosition, CourtPoint, CourtZoneId } from '../court';

export interface CourtZoneReference {
  teamSide: TeamSide;
  zoneId?: CourtZoneId;
  gridPosition?: CourtGridPosition;
  point?: CourtPoint;
}

export interface BallTouch {
  id: string;
  setNumber: number;
  rallyNumber: number;
  sequenceNumber: number;
  teamSide: TeamSide;
  playerId?: string;
  skill: SkillType;
  evaluation?: SkillEvaluation;
  zone?: CourtZoneReference;
  originZone?: CourtZoneReference;
  targetZone?: CourtZoneReference;
  combinationCode?: string;
  setterCallCode?: string;
  customCode?: string;
  createdAt: number;
}
