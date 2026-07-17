import type { MatchPhase, TeamSide } from '@src/domain/common/enums';
import type {
  MatchMetadata,
  MatchTeamSelection,
} from '@src/domain/match/types';
import type { ScoutingMatchConfig } from '@src/domain/scouting/types';
import type { MatchVideoAnalysis } from '@src/domain/video/types';
import type {
  BallTouch,
  NumBlockers,
  TouchInferenceReason,
  TouchOrigin,
  TouchSource,
} from '@src/domain/touch/types';
import type { SkillEvaluation, SkillType } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';

export const OVS_FORMAT_VERSION = 1;

export interface OvsManifest {
  ovsFormatVersion: number;
  kind: 'match';
  matchId: string;
  exportedAt: string;
  exportedByDeviceId: string;
  appVersion: string;
}

/**
 * Everything in `MatchProject` that isn't derived. `homeTeam`/`awayTeam` are
 * read models derived from the selections, and `scoutingSession` is fully
 * recomputable from `events` — neither travels in the bundle.
 */
export interface OvsMetaJson {
  metadata: MatchMetadata;
  homeSelection: MatchTeamSelection;
  awaySelection: MatchTeamSelection;
  phase: MatchPhase;
  scoutingConfig?: ScoutingMatchConfig;
  linkedSystemIds?: string[];
  linkedAttackCombinationIds?: string[];
  linkedSetterCallIds?: string[];
  videoAnalysis?: MatchVideoAnalysis;
  createdAt: number;
  updatedAt: number;
}

/**
 * One row per `touch_recorded` event. Scalar `BallTouch` fields become real
 * columns; nested/spatial fields are kept as JSON-string columns so the
 * Arrow schema stays stable as those sub-shapes evolve.
 */
export interface OvsTouchRow {
  eventId: string;
  touchId: string;
  createdAt: number;
  sequenceIndex: number;
  setNumber: number;
  rallyNumber: number;
  sequenceNumber: number;
  teamSide: TeamSide;
  playerId?: string;
  skill: SkillType;
  evaluation?: SkillEvaluation;
  combinationCode?: string;
  setterCallCode?: string;
  customCode?: string;
  recordedAtTime?: string;
  recordedAtIso?: string;
  videoTimeSeconds?: number;
  homeSetterPosition?: number;
  awaySetterPosition?: number;
  attackType?: string;
  setType?: string;
  serveType?: string;
  skillTypeCode?: string;
  startZoneCode?: string;
  endZoneCode?: string;
  numBlockers?: NumBlockers;
  source?: TouchSource;
  touchOrigin?: TouchOrigin;
  requiredExplicitInput?: boolean;
  inferredCandidate?: boolean;
  pendingInference?: boolean;
  inferenceReason?: TouchInferenceReason;
  inferredFromTouchId?: string;
  zoneJson?: string;
  originZoneJson?: string;
  targetZoneJson?: string;
  directionJson?: string;
  ballDirectionJson?: string;
  trajectoryJson?: string;
  advancedDetailsJson?: string;
  locationJson?: string;
}

/**
 * One row per non-`touch_recorded` event. `payloadJson` carries whatever
 * fields are specific to that variant — new `MatchEvent` variants need no
 * changes here since flatten/unflatten works generically off the common keys.
 */
export interface OvsEventRow {
  id: string;
  type: Exclude<MatchEvent['type'], 'touch_recorded'>;
  createdAt: number;
  sequenceIndex: number;
  setNumber?: number;
  rallyNumber?: number;
  teamSide?: TeamSide;
  payloadJson: string;
}

export type TouchRecordedEvent = Extract<MatchEvent, { type: 'touch_recorded' }>;
export type NonTouchEvent = Exclude<MatchEvent, { type: 'touch_recorded' }>;

export interface ParsedOvsBundle {
  manifest: OvsManifest;
  meta: OvsMetaJson;
  touchRows: OvsTouchRow[];
  eventRows: OvsEventRow[];
}

export type { BallTouch };
