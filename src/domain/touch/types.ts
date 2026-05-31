import type { SkillEvaluation, SkillType, TeamSide } from '../common/enums';
import type { ScoutingDirectionData, ScoutingZoneReference } from '../spatial';
import type { BallDirection, BallTrajectory } from '../trajectory';
import type { AdvancedTouchDetails } from './advanced-details';

export type { AdvancedTouchDetails } from './advanced-details';

export type TouchSource = 'explicit' | 'inferred';
export type TouchOrigin = 'live_scouting' | 'ace_victim_selection' | 'implicit_inference' | 'future_inference';
export type TouchInferenceReason =
  | 'setter_after_receive'
  | 'setter_after_dig'
  | 'dig_after_positive_attack'
  | 'freeball_after_negative_attack'
  | 'cover_after_recovered_block'
  | 'serve_from_reception'
  | 'block_from_attack';

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
  ballDirection?: BallDirection;
  trajectory?: BallTrajectory;
  combinationCode?: string;
  setterCallCode?: string;
  customCode?: string;
  createdAt: number;
  recordedAtTime?: string; // DataVolley format: HH:MM:SS for video sync
  recordedAtIso?: string; // ISO 8601 timestamp backup
  attackType?: string;
  setType?: string;
  serveType?: string;
  startZoneCode?: string;
  endZoneCode?: string;
  advancedDetails?: AdvancedTouchDetails;
  source?: TouchSource;
  touchOrigin?: TouchOrigin;
  requiredExplicitInput?: boolean;
  inferredCandidate?: boolean;
  pendingInference?: boolean;
  inferenceReason?: TouchInferenceReason;
  inferredFromTouchId?: string;
}
