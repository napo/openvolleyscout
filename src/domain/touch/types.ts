import type { SkillEvaluation, SkillType, TeamSide } from '../common/enums';
import type { ScoutingDirectionData, ScoutingZoneReference } from '../spatial';

export type TouchSource = 'explicit' | 'inferred';
export type TouchOrigin = 'live_scouting' | 'ace_victim_selection' | 'future_inference';

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
  attackType?: string;
  setType?: string;
  serveType?: string;
  startZoneCode?: string;
  endZoneCode?: string;
  source?: TouchSource;
  touchOrigin?: TouchOrigin;
  requiredExplicitInput?: boolean;
  inferredCandidate?: boolean;
  pendingInference?: boolean;
}
