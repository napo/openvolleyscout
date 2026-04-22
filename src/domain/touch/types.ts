import type { SkillEvaluation, SkillType, TeamSide } from '../common/enums';
import type { ScoutingDirectionData, ScoutingZoneReference } from '../spatial';

export interface BallTouch {
  id: string;
  setNumber: number;
  rallyNumber: number;
  sequenceNumber: number;
  teamSide: TeamSide;
  playerId?: string;
  skill: SkillType;
  evaluation?: SkillEvaluation;
  zone?: ScoutingZoneReference;
  originZone?: ScoutingZoneReference;
  targetZone?: ScoutingZoneReference;
  direction?: ScoutingDirectionData;
  combinationCode?: string;
  setterCallCode?: string;
  customCode?: string;
  createdAt: number;
}
