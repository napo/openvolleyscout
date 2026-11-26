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

/**
 * How the attack was hit (DataVolley skill subtype): H hard spike ("forte"),
 * P soft spike / placed shot ("piazzata"), T tip ("pallonetto").
 */
export type AttackSubtype = 'H' | 'P' | 'T';
export const ATTACK_SUBTYPES: readonly AttackSubtype[] = ['H', 'P', 'T'];

export function parseAttackSubtypeCode(skill: string, code: string | undefined): AttackSubtype | undefined {
  if (skill !== 'attack' || !code) return undefined;
  const upper = code.toUpperCase();
  return upper === 'H' || upper === 'P' || upper === 'T' ? upper : undefined;
}

/**
 * Button input (Basic / Tags) records a touch with only a placeholder court zone. Its zones are not real
 * data, unless they were then picked on purpose: the analysis views must not read them as a position.
 */
export function hasPlaceholderZones(touch: Pick<BallTouch, 'withoutZones' | 'zonesPicked'>): boolean {
  return touch.withoutZones === true && touch.zonesPicked !== true;
}

/** The attack subtype of a touch, also from the older advanced details (power / roll shot / tip). */
export function getAttackSubtype(touch: Pick<BallTouch, 'skill' | 'attackSubtype' | 'advancedDetails'>): AttackSubtype | undefined {
  if (touch.skill !== 'attack') return undefined;
  if (touch.attackSubtype) return touch.attackSubtype;
  const type = touch.advancedDetails?.attack?.type;
  return type === 'power' ? 'H' : type === 'roll_shot' ? 'P' : type === 'tip' ? 'T' : undefined;
}

/** DataVolley writes every attack with a subtype: hard spike unless told otherwise. */
export function getAttackSubtypeOrDefault(touch: Pick<BallTouch, 'skill' | 'attackSubtype' | 'advancedDetails'>): AttackSubtype | undefined {
  return touch.skill === 'attack' ? getAttackSubtype(touch) ?? 'H' : undefined;
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
  homeSetterPlayerId?: string; // Resolved from the DVW row's home lineup snapshot
  awaySetterPlayerId?: string; // Resolved from the DVW row's away lineup snapshot
  attackType?: string;
  setType?: string;
  serveType?: string;
  skillTypeCode?: string;
  startZoneCode?: string;
  endZoneCode?: string;
  numBlockers?: NumBlockers;
  /** Attacks: hard spike, placed shot or tip (DataVolley skill subtype). */
  attackSubtype?: AttackSubtype;
  /** Recorded with buttons only (Basic / Tags input): no zones were entered, none are exported. */
  withoutZones?: boolean;
  /** Button input whose zones were then picked on purpose (Tags zone picker): those zones are exported. */
  zonesPicked?: boolean;
  advancedDetails?: AdvancedTouchDetails;
  source?: TouchSource;
  touchOrigin?: TouchOrigin;
  requiredExplicitInput?: boolean;
  inferredCandidate?: boolean;
  pendingInference?: boolean;
  inferenceReason?: TouchInferenceReason;
  inferredFromTouchId?: string;
}
