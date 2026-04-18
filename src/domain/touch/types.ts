import type { SkillEvaluation, SkillType, TeamSide } from '../common/enums';

export interface CourtZoneReference {
  startZone?: string;
  endZone?: string;
  endSubzone?: string;
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
  zones?: CourtZoneReference;
  combinationCode?: string;
  setterCallCode?: string;
  customCode?: string;
  createdAt: number;
}
