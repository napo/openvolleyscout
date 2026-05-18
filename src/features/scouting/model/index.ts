// Scouting feature model exports and shared types.
import type { TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { MatchProject } from '@src/domain/match/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { ScoutingSession } from '@src/domain/scouting/types';
import type { CompletedSetSummary, ScoutingMatchConfig } from '@src/domain/scouting/types';
import type { BallTouch } from '@src/domain/touch/types';
import type { ScoutingCorrectionReason } from './corrections';

export interface LiveMatchState extends ScoutingSession {
  eventLog: MatchEvent[];
}

export interface ScoutingStoreActionResult {
  ok: boolean;
  reason?: ScoutingCorrectionReason;
  eventType?: MatchEvent['type'];
}

export type ScoutingState = {
  liveMatch: LiveMatchState | null;
  activeConfig: ScoutingMatchConfig | null;
  syncWithProject: (project: MatchProject | null) => void;
  startSet: (input: {
    activeProjectId: string;
    setNumber: number;
    homeStartingLineup: StartingLineup;
    awayStartingLineup: StartingLineup;
    servingTeam: TeamSide;
    existingEvents?: MatchEvent[];
    completedSets?: CompletedSetSummary[];
  }) => MatchEvent;
  endSet: () => void;
  startRally: () => void;
  recordTouch: (touch: BallTouch) => void;
  awardPoint: (teamSide: TeamSide, reason?: string) => void;
  awardManualPoint: (teamSide: TeamSide) => boolean;
  endRally: () => void;
  undoLastAction: () => ScoutingStoreActionResult;
  undoLastPoint: () => boolean;
  removeLastTouchFromCurrentRally: () => ScoutingStoreActionResult;
  clearCurrentRallyPoint: () => ScoutingStoreActionResult;
  reopenCurrentRally: () => ScoutingStoreActionResult;
  replaceLiveMatchEvents: (eventLog: MatchEvent[]) => boolean;
  resetLiveMatch: () => void;
};

export { useScoutingStore } from './scouting-store';
export { useScoutingPersistence } from './use-scouting-persistence';
export {
  useLiveTouchFlowController,
  useLiveTouchFlowStore,
  type LiveTouchFlowControllerInput,
  type LiveTouchFlowPhase,
} from './live-touch-flow-store';

export {
  getScoutingStageSummary,
  getSetQuickStats,
  isScoutingConfigReady,
  type ScoutingStage,
  type ScoutingStageSummary,
} from './stages';

export {
  getScoutingStageLayoutPolicy,
  isLandscapeRequiredForScoutingStage,
  isOperationalScoutingStage,
  usesFixedScoutingShell,
  type ScoutingStageLayoutPolicy,
} from './stage-layout-policy';

export {
  updateScoutingConfig,
  createAnalysisReadyProject,
  createClosedMatchProject,
} from './project-actions';

export {
  validatePreMatchConfig,
  type PreMatchConfigField,
  type PreMatchConfigFieldErrors,
  type PreMatchConfigValidationResult,
} from './pre-match-config';

export {
  createPointProgressionEvents,
  getCurrentSetTargetPoints,
  isCurrentMatchComplete,
  isCurrentSetComplete,
  getCurrentSetsWon,
} from './progression';

export {
  getCompletedSetDisplaySummary,
  getCompletedSetsDisplaySummary,
  type CompletedSetDisplaySummary,
} from './stage-results';

export {
  formatMatchResult,
  formatProjectMatchResult,
  type FormattedMatchResult,
  type FormatMatchResultInput,
  type MatchResultCurrentSetScore,
  type MatchResultSetScore,
} from './match-result-format';

export {
  getCurrentRallyCorrectionAvailability,
  getUndoLastActionAvailability,
  type CurrentRallyCorrectionAvailability,
  type ScoutingActionAvailability,
  type ScoutingCorrectionReason,
} from './corrections';

export {
  SIDEOUT_ROTATION_MAP,
  getNextServingTeamAfterPoint,
  shouldRotateLineupAfterPoint,
  rotateLineupForSideOut,
} from './rally-transition';

export {
  getOppositeTeamSide as getScoringOppositeTeamSide,
  getPointWinnerFromTouch,
  isTrueTerminalTouch,
  isPositiveNonTerminalSkill,
  isTerminalEvaluation as isScoringTerminalEvaluation,
  resolvePointWinnerFromTouch,
  resolveRallyOutcomeFromTouch,
  type RallyOutcome,
  type ScoringTouch,
} from './scoring-rules';

export {
  getAllowedZonesForLiveCourtPhase,
  getNextLiveCourtPhase,
  getServingPlayerServeStartPosition,
  type LiveCourtPhase,
} from './live-court';

export {
  TOUCH_SKILLS,
  DEFAULT_TOUCH_EVALUATIONS,
  TOUCH_EVALUATIONS,
  TOUCH_EVALUATIONS_BY_SKILL,
  DEFAULT_EVALUATION_BY_SKILL,
  getEvaluationsForSkill,
  getDefaultEvaluationForSkill,
  getOppositeTeamSide,
  isTerminalTouch,
  suggestNextTouchSkill,
  getNextTouchTeamSide,
  getNextTouchContext,
  getNextItem,
  type NextTouchContext,
} from './touch-popup';

export {
  POPUP_AVOIDANCE_GAP,
  computeBallTouchPopupLayout,
  createPopupPlacementRect,
  doPopupPlacementRectsOverlap,
  type BallTouchPopupLayout,
  type BallTouchPopupPlacementInput,
  type PopupPlacementPoint,
  type PopupPlacementRect,
} from './popup-placement';

export {
  buildDataVolleyTouchCode,
  buildDataVolleyRallyCode,
} from './datavolley-code';

export {
  buildMatchStats,
  buildSetMatchStats,
  buildAdvancedStats,
  buildPlayerStats,
  buildTeamStats,
  applyTouchToPlayerStats,
  applyTouchToTeamStats,
  createEmptyPlayerStats,
  createEmptySkillStats,
  createEmptyTeamStats,
  getPlayerDisplayName,
  getPlayerJerseyNumber,
  safeDivide,
  updateSkillStats,
  type BuildMatchStatsInput,
  type AdvancedStats,
  type BreakPointStats,
  type MatchStats,
  type MatchStatsQuickStats,
  type PlayerStats,
  type PlayerQuickStats,
  type RallyStats,
  type RotationNumber,
  type RotationStats,
  type SetStats,
  type SideOutStats,
  type SkillStats,
  type TeamAttackQuickStats,
  type TeamBlockQuickStats,
  type TeamQuickStats,
  type TeamReceptionQuickStats,
  type TeamServeQuickStats,
  type TeamStats,
  type TrackedSkill,
} from './match-stats';

export {
  buildMatchReportHtml,
  createMatchReportFilename,
  downloadMatchReportHtml,
  printMatchReportHtml,
  buildPlayerParticipationBySet,
  buildSetPartialScores,
  buildSetTeamStatsMap,
  computePlayerBreakPointPoints,
} from './match-report';

export {
  getLastConfirmedLineups,
  getNextSetPrefillConfig,
  getNextSetServingTeam,
  invertCourtSide,
  invertCourtSides,
  type ConfirmedSetLineups,
  type NextSetPrefillConfig,
} from './next-set';

export {
  getNextTouchContext as getDataVolleyNextTouchContext,
  shouldAssignPoint,
  resolvePointTeam,
  isAce,
  isNoPointSkill,
  buildNextPendingTouch,
  resolveAceFlow,
  type PendingTouch,
} from './datavolley-flow';

// Compatibility export. Prefer live/tactical/positioning/tactical-role-mapping.
export {
  mapRolesToPlayers,
  getCurrentSetterRotation,
  getRoleCourtPositionForCurrentRotation,
  getTeamRolePlayerMap,
} from './system-role-mapping';

// Compatibility export. Prefer resolveTacticalCourtPlayers from
// live/tactical/positioning/tactical-position-resolver.
export {
  getInitialTeamTacticalPhases,
  getNextTeamTacticalPhasesAfterTouch,
  getTeamTacticalPhasesAfterTouches,
  getSetterAfterReceptionOverride,
  getSetterReleaseCoordinate,
  getPlayerTacticalPositions,
  resolveTacticalCourtPlayers,
  getSystemRotationPositions,
  getTeamPhaseFromCurrentRally,
  getTeamTacticalPhase,
  SETTER_RELEASE_COORDINATE,
  SETTER_RELEASE_ZONE,
  type TacticalCourtPlayer,
  type TacticalSystemPosition,
  type TeamTacticalPhase,
  type TeamTacticalPhases,
} from './tactical-positioning';

export {
  buildManualPointEventLog,
  buildRedCardCorrectionEventLog,
  buildReplayCorrectionEventLog,
  buildRotationFaultCorrectionEventLog,
  buildUndoLastPointEventLog,
  buildVideoCheckCorrectionEventLog,
  getUndoLastPointAvailability,
  getLatestVideoCheckContext,
  type UndoLastPointAvailability,
  type ScoreCorrectionAction,
  type ScoreCorrectionReason,
  type VideoCheckContext,
} from './score-corrections';

export {
  applyLiberoReplacementToLineup,
  applyNormalSubstitutionToLineup,
  buildLiberoReplacementMadeEvent,
  buildOtherDeadBallEvent,
  buildRedCardPointEvent,
  buildReplayActionEvent,
  buildSanctionRecordedEvent,
  buildSubstitutionMadeEvent,
  buildTimeoutCalledEvent,
  buildVideoCheckCorrectionEvent,
  getAutomaticLiberoReplacementProposal,
  getEligiblePlayersInForSubstitution,
  getManualLiberoReplacementProposals,
  getNormalSubstitutionEligibility,
  normalizeActiveLineup,
  updateLiberoFrontRowStatus,
  type DeadBallEventType,
  type LiberoReplacementProposal,
} from './personnel';
