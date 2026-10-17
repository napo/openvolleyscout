import type { SkillEvaluation, SkillType, TeamSide } from '../common/enums';
import type { ScoutingDirectionData, ScoutingZoneReference } from '../spatial';
import type { BallDirection, BallTrajectory } from '../trajectory';
import type { AdvancedTouchDetails } from './advanced-details';

export type { AdvancedTouchDetails } from './advanced-details';

/**
 * Players jumping at the net against an attack (DataVolley extended code).
 * DataVolley allows 0-3 on attack codes; 4 (hole block / "muro aperto") is
 * defined for block codes only.
 */
export type NumBlockers = 0 | 1 | 2 | 3 | 4;

/**
 * DataVolley "players at the net" code (extended code, after the skill
 * subtype) on attacks and blocks: 0-3 blockers, 4 = hole block. The manual
 * lists 4 for blocks only, but DataVolley 4 files use it on attacks too.
 * Receptions reuse the same position for the reception formation, so other
 * skills are ignored.
 */
export function parseNumBlockersCode(skill: string, code: string | undefined): NumBlockers | undefined {
  if (skill !== 'attack' && skill !== 'block') return undefined;
  return code && /^[0-4]$/.test(code) ? Number(code) as NumBlockers : undefined;
}

export type TouchSource = 'explicit' | 'inferred';
export type TouchOrigin = 'live_scouting' | 'ace_victim_selection' | 'implicit_inference' | 'future_inference';
export type TouchInferenceReason =
  | 'setter_after_receive'
  | 'setter_after_dig'
  | 'dig_after_positive_attack'
  | 'freeball_after_negative_attack'
  | 'cover_after_recovered_block'
  | 'serve_from_reception'
  | 'block_from_attack'
  | 'dig_from_redraw'
  | 'set_from_redraw';

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
  videoTimeSeconds?: number; // DVW field 12: seconds from the start of the associated video
  homeSetterPosition?: number; // DVW field 9: home setter court position (1-6) when the touch happened
  awaySetterPosition?: number; // DVW field 10: away setter court position (1-6) when the touch happened
  attackType?: string;
  setType?: string;
  serveType?: string;
  skillTypeCode?: string;
  startZoneCode?: string;
  endZoneCode?: string;
  numBlockers?: NumBlockers;
  /** Recorded with buttons only (Basic / Tags input): no zones were entered, none are exported. */
  withoutZones?: boolean;
  advancedDetails?: AdvancedTouchDetails;
  source?: TouchSource;
  touchOrigin?: TouchOrigin;
  requiredExplicitInput?: boolean;
  inferredCandidate?: boolean;
  pendingInference?: boolean;
  inferenceReason?: TouchInferenceReason;
  inferredFromTouchId?: string;
}
