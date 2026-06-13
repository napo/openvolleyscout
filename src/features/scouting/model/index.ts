// Scouting feature model exports and shared types.
import type { TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { MatchProject } from '@src/domain/match/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { ScoutingMode as LiveScoutingMode } from '@src/domain/scouting/types';
import type { ScoutingSession } from '@src/domain/scouting/types';
import type { CompletedSetSummary, ScoutingMatchConfig } from '@src/domain/scouting/types';
import type { BallTouch } from '@src/domain/touch/types';
import type { ScoutingCorrectionReason } from './corrections';
import type { LiveUndoEntry } from './live-undo-stack';

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
  undoStack: LiveUndoEntry[];
  syncWithProject: (project: MatchProject | null) => void;
  startSet: (input: {
    activeProjectId: string;
    setNumber: number;
    homeStartingLineup: StartingLineup;
    awayStartingLineup: StartingLineup;
    servingTeam: TeamSide;
    scoutingMode?: LiveScoutingMode;
    existingEvents?: MatchEvent[];
    completedSets?: CompletedSetSummary[];
  }) => MatchEvent;
  endSet: () => void;
  startRally: () => void;
  recordTouch: (touch: BallTouch) => void;
  setScoutingMode: (mode: LiveScoutingMode) => boolean;
  awardPoint: (teamSide: TeamSide, reason?: string) => void;
  awardManualPoint: (teamSide: TeamSide) => boolean;
  endRally: () => void;
  undoLastAction: () => ScoutingStoreActionResult;
  undoLastPoint: () => boolean;
  removeLastTouchFromCurrentRally: () => ScoutingStoreActionResult;
  clearCurrentRallyTouches: () => void;
  clearCurrentRallyPoint: () => ScoutingStoreActionResult;
  reopenCurrentRally: () => ScoutingStoreActionResult;
  replaceLiveMatchEvents: (eventLog: MatchEvent[]) => boolean;
  resetLiveMatch: () => void;
  pushUndoEntry: (entry: { label: string; actionType: string; eventCountBefore: number }) => void;
  clearUndoStack: () => void;
  performGroupedUndo: () => ScoutingStoreActionResult;
};

export { useScoutingStore } from './scouting-store';
export { useScoutingPersistence } from './use-scouting-persistence';
export {
  DEFAULT_SCOUTING_MODE,
  SCOUTING_MODES,
  getProjectScoutingMode,
  getScoutingModeLabelKey,
  normalizeScoutingMode,
  updateProjectScoutingMode,
  type ScoutingMode,
} from './scouting-mode';
export {
  canCommitPendingTouchWithDefaults,
  getScoutingModeConfig,
  type ScoutingModeConfig,
  type ScoutingModeInputRequirements,
} from './scouting-mode-config';
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
  LIVE_SCOUTING_SMARTPHONE_LANDSCAPE_MAX_HEIGHT,
  LIVE_SCOUTING_SMARTPHONE_PORTRAIT_MAX_WIDTH,
  createLiveScoutingLayoutSnapshot,
  getLiveScoutingCompactToolbarControls,
  getLiveScoutingOrientationGuardMediaQuery,
  getLiveScoutingViewportFlags,
  shouldUseLiveScoutingOrientationGuard,
  type LiveScoutingCompactToolbarControls,
  type LiveScoutingLayoutSnapshot,
  type LiveScoutingViewport,
  type LiveScoutingViewportFlags,
} from './live-scouting-layout';

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
  getZoneCode,
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
  getUnassignedStatsPlayerId,
  safeDivide,
  validateAceReceptionConsistency,
  validatePlayerSkillTotals,
  validateStatsIntegrity,
  validateTeamTotals,
  updateSkillStats,
  aggregateSkillEvaluationTotals,
  TRACKED_SKILLS,
  SKILL_STAT_TOTAL_KEYS,
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
  type SkillStatTotalKey,
  type StatsIntegrityIssue,
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
  buildMatchReportPngSvg,
  buildDataVolleyMatchReport,
  buildMatchTabellinoReport,
  createMatchReportPrintTitle,
  createMatchReportFilename,
  downloadMatchReportPng,
  openPrintableMatchReportHtml,
  buildPlayerParticipationBySet,
  buildSetPartialScores,
  buildSetPhaseSplits,
  buildSetTeamStatsMap,
  computePlayerBreakPointPoints,
  computeTeamBreakPointPoints,
  getSetPhaseCount,
  MATCH_REPORT_PNG_HEIGHT,
  MATCH_REPORT_PNG_WIDTH,
  validateMatchReportTotals,
  validateTabellinoTeamTotals,
  type BuildMatchReportDocumentInput,
  type DataVolleyMatchReport,
  type MatchReportTotalsIntegrityIssue,
  type MatchReportAttackSummary,
  type MatchReportBlockSummary,
  type MatchReportEntryMarker,
  type MatchReportPlayerRow,
  type MatchReportReceiveSummary,
  type MatchReportServeSummary,
  type MatchReportSetHeaderSummary,
  type MatchReportSetSection,
  type MatchReportTeamTable,
  type MatchTabellinoReport,
  type TabellinoTeamTable,
  type TabellinoSetSummaryRow,
  type SetPhaseSplit,
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
  getGroupedUndoAvailability,
  type LiveUndoEntry,
} from './live-undo-stack';

export {
  applyLiberoReplacementToLineup,
  applyNormalSubstitutionToLineup,
  buildLiberoReplacementMadeEvent,
  buildOtherDeadBallEvent,
  buildRedCardPointEvent,
  buildReplayActionEvent,
  buildSanctionRecordedEvent,
  buildSubstitutionMadeEvent,
  buildSetterAssignedEvent,
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
