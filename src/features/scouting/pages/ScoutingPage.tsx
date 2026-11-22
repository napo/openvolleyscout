import { formatPlayerLabel, getPlayerDisplayName } from '@src/domain/roster/helpers';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import { isTouchOnlyDevice, useAppStore } from '@src/app/store/app-store';
import { useAttackSubtypeStore } from '@src/app/store/attack-subtype-store';
import { useLiveMenuStore } from '@src/app/store/live-menu-store';
import { OrientationGuard } from '@src/app/layout/OrientationGuard';
import type { CourtPosition, SkillEvaluation, TeamSide } from '@src/domain/common/enums';
import { PlayerRole } from '@src/domain/systems';
import type { MatchEvent } from '@src/domain/events/types';
import { getMatchCodeTables, getMatchRosterPlayerKey, getMatchTeamSnapshot } from '@src/domain/match';
import type { QuickEntryPlayer } from '@src/domain/roster/quick-entry';
import { QuickJerseyEntry, type QuickJerseyEntryOutcome } from '@src/components/roster/QuickJerseyEntry';
import { addJerseyPlayerToMatch } from '../model/add-match-player';
import { syncProjectWithLiveMatch } from '../model/session';
import type { AddPlayersResult } from '../components/SetStartFlow';
import type { MatchProject } from '@src/domain/match/types';
import { createDefaultScoutingMatchConfig } from '@src/domain/scouting';
import {
  getDefaultServeStartZoneForTeam,
  remapScoutingZonesForDisplaySides,
  type ScoutingZone,
} from '@src/domain/spatial';
import { createBallTrajectory, updateBallTrajectoryMetadata } from '@src/domain/trajectory';
import type { BallTouch } from '@src/domain/touch/types';
import { MatchReadinessSection } from '@src/features/startup/components/MatchReadinessSection';
import { matchRepository } from '@src/infrastructure/repositories';
import { evaluateMatchReadiness } from '@src/lib/validation/match-readiness';
import { formatDisplayDate, formatDisplayTime } from '@src/lib/utils/local-date';
import {
  findDefenseSystemForTeam,
  findReceptionSystemForTeam,
  useDefenseSystemStore,
  useReceptionSystemStore,
} from '@src/features/systems/model';
import { useScoutingStore } from '../model/scouting-store';
import { useCourtOrientationStore } from '../model/court-orientation-store';
import { useDisplaySideSwapStore } from '../model/display-side-swap-store';
import { getOppositeDisplaySide } from '../model/set-start';
import {
  LiveRallyStage,
  MatchEndStage,
  PreMatchConfigStage,
  ScoutingStageFrame,
  SetEndStage,
  SetSetupStage,
} from '../components';
import { PortraitGuard } from '../components/PortraitGuard';
import { PointNoteModal } from '../components/PointNoteModal';
import { ScoutingTopBar } from '../components/ScoutingTopBar';
import { SetterAssignmentDialog } from '../components/SetterAssignmentDialog';
import { LiveExitDialog } from '../components/LiveExitDialog';
import { createDefaultMatchVideoAnalysis, type PointNote, type PointNoteTag } from '@src/domain/video/types';
import { addPointNote, createPointNote, deletePointNote, updatePointNote } from '@src/domain/video/point-notes';
import { ImageTutorialSlideShow } from '@src/features/landing/tutorials/ImageTutorialSlideShow';
import { getInputModeTutorial } from '@src/features/landing/tutorials/image-tutorials';
import { ScoutingOnboardingCard } from '../components/ScoutingOnboardingCard';
import { InputLevelChooser, type InputLevel } from '../components/InputLevelChooser';
import { buildQuickStartLineups, type QuickStartRequest } from '../model/quick-start';
import { isUnscoutedTeam } from '../model/unscouted-team';
import { TagZonePicker } from '../tagging/TagZonePicker';
import { OpponentAttackPanel, extractAttackStats, extractAttackEntries, extractServeStats } from '../components/OpponentAttackPanel';
import type { ServePhaseInfo } from '../components/OpponentAttackPanel';
import { CodeInputPanel, MatchCodeListPanel } from '../expert';
import {
  
  buildDataVolleyRallyCode,
  getZoneCode,
  buildMatchStats,
  buildSetMatchStats,
  createAnalysisReadyProject,
  createClosedMatchProject,
  getCompletedSetDisplaySummary,
  getCompletedSetsDisplaySummary,
  formatMatchResult,
  getCorrectableSetStart,
  getLastConfirmedLineups,
  getNextSetPrefillConfig,
  replaceCurrentSetStart,
  getScoutingStageSummary,
  getScoutingStageLayoutPolicy,
  getLiveScoutingOrientationGuardMediaQuery,
  isLandscapeRequiredForScoutingStage,
  isOperationalScoutingStage,
  updateScoutingConfig,
  usesFixedScoutingShell,
  useScoutingPersistence,
  buildReplayCorrectionEventLog,
  buildRedCardCorrectionEventLog,
  buildManualCorrectionEventLog,
  isManualCorrectionType,
  MANUAL_CORRECTION_TYPES,
  buildRotationFaultCorrectionEventLog,
  getUndoLastPointAvailability,
  getGroupedUndoAvailability,
  getCurrentRallyCorrectionAvailability,
  buildVideoCheckCorrectionEventLog,
  buildOtherDeadBallEvent,
  buildReplayActionEvent,
  buildSanctionRecordedEvent,
  buildSubstitutionMadeEvent,
  buildSetterAssignedEvent,
  isStandInSetterThisBreak,
  buildTimeoutCalledEvent,
  buildVideoCheckCorrectionEvent,
  getEligiblePlayersInForSubstitution,
  getNormalSubstitutionEligibility,
  getEvaluationsForSkill,
  getLatestVideoCheckContext,
  type LiveMatchState,
  type DeadBallEventType,
  type PendingTouch,
  type ScoutingStage,
} from '../model';
import {
  buildLiberoReplacementMadeEvent,
  buildLiberoTapEventLog,
  getAutomaticLiberoReplacementProposal,
  getLiberoTapProposal,
  getSidelinePlayers,
  getManualLiberoReplacementProposals,
  validateLiberoTouch,
  type LiberoReplacementProposal,
} from '../live/libero';
import {
  getNextLiveCourtPhase,
  type LiveCourtPhase,
} from '../live/tactical/tactical-zones';
import {
  getInitialTeamTacticalPhases,
  getNextTeamTacticalPhasesAfterTouch,
  getTeamTacticalPhasesAfterTouches,
  type TeamTacticalPhases,
} from '../live/tactical/tactical-transition';
import {
  shouldRenderCourtFirstLiveRally,
  shouldRenderDeadBallEventsPanel,
} from '../live/rally/live-stage-layout';
import { shouldReplaceLatestPendingTouch } from '../live/rally/rally-validation';
import { LIVE_SCOUTING_SMARTPHONE_LANDSCAPE_MAX_HEIGHT } from '../model/live-scouting-layout';
import { useMediaQuery } from '@src/lib/hooks/useMediaQuery';
import { LiveScoutingVideoPanel, type LiveScoutingVideoPanelHandle } from '../live/video/LiveScoutingVideoPanel';
import { TagInputPanel } from '../tagging/TagInputPanel';
import { playConfirmFeedback } from '@src/lib/utils/confirm-feedback';
import '../scouting-screen.css';
import '../scouting-simple-input.css';
import '../scouting-phone.css';
import '../scouting-tablet.css';
import { resolveActionVideoSeconds } from '../live/video/action-video-time';
import { confirmAction } from '@src/components/confirm-dialog';
import { useDismissedVideoNotices } from './use-dismissed-video-notices';
import { createLiberoMessages, getLiberoProposalPriority, getManageActionEventLabel as getManageActionEventLabelFor } from './libero-messages';

import {
  ManageActionDraft,
  ScoreFeedback,
  ScoreSnapshot,
  SCORE_FEEDBACK_DURATION_MS,
  LIVE_SCOUTING_CELLS,
  LIVE_SCOUTING_ONBOARDING_KEY,
  createZoneReference,
  formatCurrentEventLabel,
  getLatestPointTeamSide,
  VIDEO_SIDEBAR_MEDIA_QUERY,
  TABLET_PORTRAIT_MEDIA_QUERY,
  VideoHiddenReason,
  resolveVideoHiddenReason,
} from './scouting-page-model';

export function ScoutingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const activeProject = useAppStore((state) => state.activeProject);
  const setActiveProject = useAppStore((state) => state.setActiveProject);
  const closeProject = useAppStore((state) => state.closeProject);
  const simpleInput = useAppStore((state) => state.simpleInput);
  const inputMode = useAppStore((state) => state.inputMode);
  const setInputMode = useAppStore((state) => state.setInputMode);
  const setSimpleInput = useAppStore((state) => state.setSimpleInput);
  const inputLevelChosen = useAppStore((state) => state.inputLevelChosen);
  const setInputLevelChosen = useAppStore((state) => state.setInputLevelChosen);
  // Three levels on one switch: tags (buttons only), court (large buttons,
  // draws zones and courses), detailed (the original full DataVolley input).
  const inputLevel: InputLevel = inputMode === 'tag'
    ? 'tag'
    : simpleInput ? 'court' : 'detailed';
  const selectInputLevel = (level: InputLevel) => {
    setInputMode(level === 'tag' ? 'tag' : 'court');
    if (level === 'court' || level === 'detailed') {
      setSimpleInput(level === 'court');
    }
    setInputLevelChosen(true);
  };
  const confirmPointAssignment = useAppStore((state) => state.confirmPointAssignment);
  const [pointNoteModal, setPointNoteModal] = useState<
    | { mode: 'create'; videoTimeSeconds?: number }
    | { mode: 'edit'; note: PointNote }
    | null
  >(null);
  const readiness = evaluateMatchReadiness(activeProject);
  const courtOrientation = useCourtOrientationStore((state) => state.orientation);
  const tagRecordTeams = useAppStore((state) => state.tagRecordTeams);
  const setTagRecordTeams = useAppStore((state) => state.setTagRecordTeams);
  const isLiveMenuOpen = useLiveMenuStore((state) => state.isOpen);
  const setLiveMenuOpen = useLiveMenuStore((state) => state.setOpen);
  useEffect(() => {
    if (!isLiveMenuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLiveMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isLiveMenuOpen, setLiveMenuOpen]);
  const setCourtOrientation = useCourtOrientationStore((state) => state.setOrientation);
  const liveMatch = useScoutingStore((state) => state.liveMatch);
  const syncWithProject = useScoutingStore((state) => state.syncWithProject);
  const startSet = useScoutingStore((state) => state.startSet);
  const startRally = useScoutingStore((state) => state.startRally);
  const recordTouch = useScoutingStore((state) => state.recordTouch);
  const awardPoint = useScoutingStore((state) => state.awardPoint);
  const awardManualPoint = useScoutingStore((state) => state.awardManualPoint);
  const endRally = useScoutingStore((state) => state.endRally);
  const undoLastPoint = useScoutingStore((state) => state.undoLastPoint);
  const removeLastTouchFromCurrentRally = useScoutingStore((state) => state.removeLastTouchFromCurrentRally);
  const clearCurrentRallyTouches = useScoutingStore((state) => state.clearCurrentRallyTouches);
  const undoStack = useScoutingStore((state) => state.undoStack);
  const pushUndoEntry = useScoutingStore((state) => state.pushUndoEntry);
  const performGroupedUndo = useScoutingStore((state) => state.performGroupedUndo);
  const activeConfig = useScoutingStore((state) => state.activeConfig);
  const replaceLiveMatchEvents = useScoutingStore((state) => state.replaceLiveMatchEvents);
  const activeDefenseSystemBlock = useDefenseSystemStore((state) => state.activeDefenseSystemBlock);
  const activeReceptionSystemBlock = useReceptionSystemStore((state) => state.activeReceptionSystemBlock);
  const defenseSystemBlocks = useDefenseSystemStore((state) => state.defenseSystemBlocks);
  const receptionSystemBlocks = useReceptionSystemStore((state) => state.receptionSystemBlocks);
  const homeArchivedTeamId = activeProject?.homeSelection.archivedTeamId;
  const awayArchivedTeamId = activeProject?.awaySelection.archivedTeamId;
  // Systems assigned to each team in the Systems page win over the active ones.
  const teamSystemBlocks = useMemo(() => ({
    home: {
      defense: findDefenseSystemForTeam(defenseSystemBlocks, homeArchivedTeamId),
      reception: findReceptionSystemForTeam(receptionSystemBlocks, homeArchivedTeamId),
    },
    away: {
      defense: findDefenseSystemForTeam(defenseSystemBlocks, awayArchivedTeamId),
      reception: findReceptionSystemForTeam(receptionSystemBlocks, awayArchivedTeamId),
    },
  }), [awayArchivedTeamId, defenseSystemBlocks, homeArchivedTeamId, receptionSystemBlocks]);
  const teamRoleSequences = useMemo(() => ({
    home: (teamSystemBlocks.home.reception ?? activeReceptionSystemBlock)?.roleSequence,
    away: (teamSystemBlocks.away.reception ?? activeReceptionSystemBlock)?.roleSequence,
  }), [activeReceptionSystemBlock, teamSystemBlocks]);
  const [showHelpModal, setShowHelpModal] = useState(() => searchParams.get('help') === 'true');
  const [, setHasSeenLiveOnboarding] = useState(() => (
    typeof window !== 'undefined' && window.localStorage.getItem(LIVE_SCOUTING_ONBOARDING_KEY) === 'true'
  ));
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selectedZone, setSelectedZone] = useState<ScoutingZone | null>(null);
  const [stageOverride, setStageOverride] = useState<ScoutingStage | null>(
    (location.state as { jumpToSetup?: boolean } | null)?.jumpToSetup ? 'set_setup' : null,
  );
  const [courtPhase, setCourtPhase] = useState<LiveCourtPhase>('waiting_to_serve');
  const [teamTacticalPhases, setTeamTacticalPhases] = useState<TeamTacticalPhases>(() => getInitialTeamTacticalPhases(null));
  const [pendingSetterReleaseTeamSide, setPendingSetterReleaseTeamSide] = useState<TeamSide | null>(null);
  const [courtStatusMessage, setCourtStatusMessage] = useState<string | null>(null);
  const [manageActionDraft, setManageActionDraft] = useState<ManageActionDraft | null>(null);
  // Re-opening the current set's setup to fix its starting lineups (0-0, no rally played).
  const [isCorrectingSetStart, setIsCorrectingSetStart] = useState(false);
  const [isAceVictimSelection, setIsAceVictimSelection] = useState(false);
  const [scoreFeedback, setScoreFeedback] = useState<ScoreFeedback | null>(null);
  const [expertInitialCode, setExpertInitialCode] = useState<string | null>(null);
  const [codeListCollapsed, setCodeListCollapsed] = useState(false);
  const [codeInputCollapsed, setCodeInputCollapsed] = useState(false);
  // Analysis opens over the court on request: closed, it is a narrow tab.
  const [opponentAttackCollapsed, setOpponentAttackCollapsed] = useState(true);
  const hasVideoSidebarSpace = useMediaQuery(VIDEO_SIDEBAR_MEDIA_QUERY);
  const isTabletPortrait = useMediaQuery(TABLET_PORTRAIT_MEDIA_QUERY);
  const isSmartphonePortrait = useMediaQuery(getLiveScoutingOrientationGuardMediaQuery());
  const videoNotices = useDismissedVideoNotices();

  // Reactive (unlike the one-off innerWidth/innerHeight reads elsewhere in
  // this file) because rotating the device mid-session must retroactively
  // force panels closed - see the effect below - not just affect the next
  // mount's default.
  const [isSmartphoneLandscape, setIsSmartphoneLandscape] = useState(() => (
    typeof window === 'undefined'
      ? false
      : window.matchMedia(`(orientation: landscape) and (max-height: ${LIVE_SCOUTING_SMARTPHONE_LANDSCAPE_MAX_HEIGHT}px)`).matches
  ));

  useEffect(() => {
    const mediaQueryList = window.matchMedia(`(orientation: landscape) and (max-height: ${LIVE_SCOUTING_SMARTPHONE_LANDSCAPE_MAX_HEIGHT}px)`);
    const handleChange = () => setIsSmartphoneLandscape(mediaQueryList.matches);
    handleChange();
    mediaQueryList.addEventListener('change', handleChange);
    return () => mediaQueryList.removeEventListener('change', handleChange);
  }, []);

  const isPhone = isSmartphonePortrait || isSmartphoneLandscape;
  // Expert input (the full DataVolley code entry) is not offered on smartphones: a
  // phone left on Expert, or opened on it, switches to Court.
  useEffect(() => {
    if (isPhone && inputMode !== 'tag' && !simpleInput) setSimpleInput(true);
  }, [inputMode, isPhone, setSimpleInput, simpleInput]);

  // Any screen held upright (phone or tablet) gets the vertical court, so the
  // court uses the long side; in landscape a tablet keeps the scout's choice.
  // Back in landscape, the scout's own choice is restored (only if we changed it).
  // Do not re-run when courtOrientation changes, so the corner rotate button works in portrait too.
  const isPortraitScreen = useMediaQuery('(orientation: portrait)');
  useEffect(() => {
    if (isSmartphonePortrait) return;
    const currentOrientation = useCourtOrientationStore.getState().orientation;
    const AUTO_VERTICAL_KEY = 'openvolleyscout.courtAutoVertical';
    const readAuto = () => { try { return window.localStorage.getItem(AUTO_VERTICAL_KEY) === 'true'; } catch { return false; } };
    const writeAuto = (value: boolean) => { try { window.localStorage.setItem(AUTO_VERTICAL_KEY, String(value)); } catch { /* not restored */ } };
    if (isPortraitScreen && currentOrientation === 'horizontal') {
      writeAuto(true);
      setCourtOrientation('vertical');
      setCodeListCollapsed(true);
    } else if (!isPortraitScreen && readAuto()) {
      writeAuto(false);
      if (currentOrientation === 'vertical') setCourtOrientation('horizontal');
    }
  }, [isPortraitScreen, isSmartphonePortrait, setCourtOrientation]);

  // On a phone the court follows the phone: vertical when held upright,
  // horizontal in landscape, so it always gets the long side of the screen.
  useEffect(() => {
    if (isSmartphonePortrait && courtOrientation === 'horizontal') {
      setCourtOrientation('vertical');
    } else if (isSmartphoneLandscape && courtOrientation === 'vertical') {
      setCourtOrientation('horizontal');
    }
  }, [isSmartphonePortrait, isSmartphoneLandscape, courtOrientation, setCourtOrientation]);

  useEffect(() => {
    // Keep the optional analysis rail closed; entered data stays left. Expert keeps
    // its code bar open: typing codes is what that mode is for.
    if (courtOrientation === 'vertical') {
      setOpponentAttackCollapsed(true);
      if (inputMode === 'tag' || simpleInput) setCodeInputCollapsed(true);
    }
  }, [courtOrientation, inputMode, simpleInput]);

  useEffect(() => {
    // Phones and upright tablets keep auxiliary panels closed initially.
    // A phone screen has no room to spare for any of the three dockable
    // panels. Expanding one on a phone takes over the full screen instead
    // (see scouting-screen.css), so default all three closed; the user
    // reopens whichever they need with its own toggle.
    if (isPhone || isTabletPortrait) {
      setCodeListCollapsed(true);
      setOpponentAttackCollapsed(true);
      setCodeInputCollapsed(true);
    }
  }, [isPhone, isTabletPortrait, inputMode, simpleInput]);
  useEffect(() => {
    if (!isTabletPortrait) return;
    const dismissPanels = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setCodeListCollapsed(true);
      setOpponentAttackCollapsed(true);
      setCodeInputCollapsed(true);
    };
    window.addEventListener('keydown', dismissPanels);
    return () => window.removeEventListener('keydown', dismissPanels);
  }, [isTabletPortrait]);
  const [pendingCodeInputSide, setPendingCodeInputSide] = useState<'left' | 'right' | null>(null);
  const [codeInputResetKey, setCodeInputResetKey] = useState(0);
  const [pendingSetterAssignment, setPendingSetterAssignment] = useState<{ teamSide: TeamSide; candidateIds: string[] } | null>(null);
  // A position left empty at set start, waiting for its jersey number.
  const [pendingEmptyPosition, setPendingEmptyPosition] = useState<{ teamSide: TeamSide; courtPosition: CourtPosition; forServe?: boolean } | null>(null);
  const [emptyPositionJersey, setEmptyPositionJersey] = useState('');
  const [emptyPositionError, setEmptyPositionError] = useState<string | null>(null);
  const [emptyPositionMove, setEmptyPositionMove] = useState<{ playerId: string; jerseyNumber: number; from: CourtPosition } | null>(null);
  const [selectedNewSetterId, setSelectedNewSetterId] = useState<string>('');
  // Without a video for this match the floating panel starts closed, so it never
  // covers the court; the "Video" pill opens it on demand.
  const [videoPanelCollapsed, setVideoPanelCollapsed] = useState(!hasVideoSidebarSpace || !activeProject?.videoAnalysis?.source);
  useEffect(() => {
    // A small viewport starts with the floating video closed; its toggle
    // remains available so the scout can choose to open it.
    if (!hasVideoSidebarSpace) setVideoPanelCollapsed(true);
  }, [hasVideoSidebarSpace]);
  const statusTimeoutRef = useRef<number | null>(null);
  const scoreFeedbackTimeoutRef = useRef<number | null>(null);
  const previousScoreSnapshotRef = useRef<ScoreSnapshot | null>(null);
  const touchOriginZoneRef = useRef<ScoutingZone | null>(null);
  const liveVideoPanelRef = useRef<LiveScoutingVideoPanelHandle | null>(null);
  const currentAwayScore = liveMatch?.awayScore ?? 0;
  const currentHomeScore = liveMatch?.homeScore ?? 0;

  useEffect(() => {
    if (searchParams.get('help') === 'true') {
      setShowHelpModal(true);
    }
  }, [searchParams]);

  useScoutingPersistence(activeProject);

  useEffect(() => {
    syncWithProject(activeProject);
  }, [activeProject, syncWithProject]);

  const stageSummary = useMemo(
    () => (activeProject ? getScoutingStageSummary(activeProject, liveMatch) : null),
    [activeProject, liveMatch],
  );

  const currentSetStartedEvent = useMemo(() => {
    if (!liveMatch) {
      return null;
    }

    return [...liveMatch.eventLog].reverse().find((event): event is Extract<MatchEvent, { type: 'set_started' }> => (
      event.type === 'set_started' && event.setNumber === liveMatch.currentSetNumber
    )) ?? null;
  }, [liveMatch]);

  const baseHomeDisplaySide = currentSetStartedEvent?.homeLineup.displaySide ?? 'right';
  const baseAwayDisplaySide = currentSetStartedEvent?.awayLineup.displaySide ?? 'left';
  // Persisted per match/set (not plain component state) so a mid-set court
  // swap (e.g. the deciding-set 8-point change of ends) survives a
  // ScoutingPage remount or app reload - otherwise the keyboard point
  // shortcuts and manual point buttons silently desync from which team is
  // actually sitting on which side. See display-side-swap-store.ts.
  const displaySideSwapStored = useDisplaySideSwapStore((state) => state.stored);
  const toggleDisplaySideSwapped = useDisplaySideSwapStore((state) => state.toggleSwapped);
  const displaySideSwapped = liveMatch !== null
    && displaySideSwapStored !== null
    && displaySideSwapStored.activeProjectId === liveMatch.activeProjectId
    && displaySideSwapStored.setNumber === liveMatch.currentSetNumber
    && displaySideSwapStored.swapped;

  const homeDisplaySide = displaySideSwapped ? getOppositeDisplaySide(baseHomeDisplaySide) : baseHomeDisplaySide;
  const awayDisplaySide = displaySideSwapped ? getOppositeDisplaySide(baseAwayDisplaySide) : baseAwayDisplaySide;
  const leftTeamSide: TeamSide = homeDisplaySide === 'left' ? 'home' : 'away';
  const rightTeamSide: TeamSide = homeDisplaySide === 'right' ? 'home' : 'away';
  const leftPointsScore = leftTeamSide === 'home' ? currentHomeScore : currentAwayScore;
  const rightPointsScore = rightTeamSide === 'home' ? currentHomeScore : currentAwayScore;
  const leftSetsWon = stageSummary ? (leftTeamSide === 'home' ? stageSummary.setsWon.home : stageSummary.setsWon.away) : 0;
  const rightSetsWon = stageSummary ? (rightTeamSide === 'home' ? stageSummary.setsWon.home : stageSummary.setsWon.away) : 0;
  const liveScoutingCells = useMemo(() => remapScoutingZonesForDisplaySides(LIVE_SCOUTING_CELLS, {
    away: awayDisplaySide,
    home: homeDisplaySide,
  }), [awayDisplaySide, homeDisplaySide]);

  const activeStage = isCorrectingSetStart && stageSummary?.currentStage === 'live_rally'
    ? 'set_setup'
    : stageOverride === 'set_setup' && stageSummary?.currentStage === 'set_end'
    ? 'set_setup'
    : stageOverride === 'pre_match_config' && stageSummary?.currentStage === 'set_setup'
      ? 'pre_match_config'
      : stageSummary?.currentStage ?? 'pre_match_config';

  useEffect(() => {
    if (stageSummary?.currentStage !== 'set_end') {
      setStageOverride(null);
    }
  }, [stageSummary?.currentStage]);

  useEffect(() => () => {
    if (statusTimeoutRef.current !== null) {
      window.clearTimeout(statusTimeoutRef.current);
    }
    if (scoreFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(scoreFeedbackTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    const currentSnapshot: ScoreSnapshot = {
      activeProjectId: liveMatch?.activeProjectId ?? null,
      setNumber: liveMatch?.currentSetNumber ?? null,
      awayScore: currentAwayScore,
      homeScore: currentHomeScore,
    };
    const previousSnapshot = previousScoreSnapshotRef.current;
    previousScoreSnapshotRef.current = currentSnapshot;

    if (
      !liveMatch
      || !previousSnapshot
      || previousSnapshot.activeProjectId !== currentSnapshot.activeProjectId
      || previousSnapshot.setNumber !== currentSnapshot.setNumber
    ) {
      return;
    }

    const awayScoreIncreased = currentSnapshot.awayScore > previousSnapshot.awayScore;
    const homeScoreIncreased = currentSnapshot.homeScore > previousSnapshot.homeScore;
    if (!awayScoreIncreased && !homeScoreIncreased) {
      return;
    }

    const scoringTeamSide = awayScoreIncreased && !homeScoreIncreased
      ? 'away'
      : homeScoreIncreased && !awayScoreIncreased
        ? 'home'
        : getLatestPointTeamSide(liveMatch.eventLog);

    if (!scoringTeamSide) {
      return;
    }

    const feedbackId = Date.now();
    setScoreFeedback({ id: feedbackId, teamSide: scoringTeamSide });

    if (scoreFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(scoreFeedbackTimeoutRef.current);
    }

    scoreFeedbackTimeoutRef.current = window.setTimeout(() => {
      setScoreFeedback((currentFeedback) => (
        currentFeedback?.id === feedbackId ? null : currentFeedback
      ));
      scoreFeedbackTimeoutRef.current = null;
    }, SCORE_FEEDBACK_DURATION_MS);
  }, [currentAwayScore, currentHomeScore, liveMatch]);

  useEffect(() => {
    if (activeStage !== 'live_rally' || !liveMatch?.servingTeam || liveMatch.isRallyActive || manageActionDraft) {
      return;
    }

    setCourtPhase('waiting_to_serve');
    setTeamTacticalPhases(getInitialTeamTacticalPhases(liveMatch.servingTeam));
    setIsAceVictimSelection(false);
    setSelectedZone(null);
    touchOriginZoneRef.current = null;
  }, [activeStage, liveMatch?.currentRallyNumber, liveMatch?.isRallyActive, liveMatch?.servingTeam, manageActionDraft]);

  const showTransientCourtMessage = (message: string) => {
    setCourtStatusMessage(message);
    if (statusTimeoutRef.current !== null) {
      window.clearTimeout(statusTimeoutRef.current);
    }
    statusTimeoutRef.current = window.setTimeout(() => {
      setCourtStatusMessage(null);
      statusTimeoutRef.current = null;
    }, 1400);
  };

  const handleRequestCourtMessage = (message: string | null) => {
    if (statusTimeoutRef.current !== null) {
      window.clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = null;
    }
    setCourtStatusMessage(message);
  };

  const handleCodeInputPendingChange = (side: 'left' | 'right' | null) => {
    setPendingCodeInputSide(side);
  };

  const handleConfirmPendingPoint = () => {
    if (!pendingCodeInputSide) return;
    const teamSide = pendingCodeInputSide === 'left' ? leftTeamSide : rightTeamSide;
    handleFinalizeRallyFromForm(teamSide);
    setPendingCodeInputSide(null);
    setCodeInputResetKey((k) => k + 1);
    handleRequestCourtMessage(null);
  };

  const handleCancelPendingPoint = () => {
    setPendingCodeInputSide(null);
    setCodeInputResetKey((k) => k + 1);
    handleRequestCourtMessage(null);
  };

  if (!activeProject) {
    return (
      <main className="scouting-screen scouting-screen--flow">
        <div className="scouting-screen__container">
          <section className="scouting-entry-card">
            <span className="scouting-entry-card__eyebrow">{t('scouting')}</span>
            <h1 className="scouting-entry-card__title">{t('scoutingEntryMatchRequiredTitle')}</h1>
            <p className="scouting-entry-card__description">{t('createMatchToStartScouting')}</p>
            <button type="button" className="btn-primary" onClick={() => navigate('/match')}>
              {t('goToMatchPage')}
            </button>
          </section>
        </div>
      </main>
    );
  }

  if (!readiness.isReady) {
    return (
      <main className="match-setup-page match-setup-page--with-nav">
        <div className="match-setup-container match-setup-container--review">
          <header className="match-setup-header">
            <h1 className="match-setup-title">{t('scouting')}</h1>
            <p className="match-setup-subtitle">{t('matchNotReadyToStartScouting')}</p>
          </header>

          <div className="confirmation-content">
            <MatchReadinessSection readiness={readiness} />
            <div className="match-review-primary-action">
              <button type="button" className="btn-secondary" onClick={() => navigate('/match')}>
                {t('backToMatchSetup')}
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!stageSummary) {
    return null;
  }

  const currentEvent = liveMatch?.eventLog.at(-1);
  const currentEventLabel = formatCurrentEventLabel(currentEvent?.type, t);
  // The snapshots are rebuilt from the selections, so they would be new objects on
  // every render (and after every save, which replaces activeProject). Key them on
  // content instead: the memos below depend on them, some of which scan the whole
  // event log or rebuild the match stats.
  const awayTeamKey = JSON.stringify([activeProject.awaySelection, activeProject.awayTeam?.name]);
  const homeTeamKey = JSON.stringify([activeProject.homeSelection, activeProject.homeTeam?.name]);
  const awayTeam = useMemo(() => getMatchTeamSnapshot(activeProject, 'away'), [awayTeamKey]);
  const homeTeam = useMemo(() => getMatchTeamSnapshot(activeProject, 'home'), [homeTeamKey]);
  const awayTeamName = awayTeam.name.trim() || t('away');
  const homeTeamName = homeTeam.name.trim() || t('home');
  const leftTeamName = leftTeamSide === 'home' ? homeTeamName : awayTeamName;
  const rightTeamName = rightTeamSide === 'home' ? homeTeamName : awayTeamName;
  const completedSets = liveMatch?.completedSets ?? activeProject.scoutingSession?.completedSets ?? [];
  const latestEventLog = liveMatch?.eventLog ?? activeProject.events;
  const currentSetLabel = liveMatch?.currentSetNumber ?? 1;
  const currentRallyLabel = liveMatch?.currentRallyNumber ?? activeProject.scoutingSession?.currentRallyNumber ?? 1;
  const servingTeamLabel = liveMatch?.servingTeam
    ? liveMatch.servingTeam === 'home'
      ? homeTeamName
      : awayTeamName
    : t('notSpecified');
  const activeStageLayoutPolicy = getScoutingStageLayoutPolicy(activeStage);
  // A vertical court wants a tall (portrait) viewport, the opposite of what
  // the landscape guard forces - skip it when the user has opted into
  // vertical mode, so the court actually gets the height it needs.
  // The Tags button pad has no court, so it works upright too.
  const worksInPortrait = courtOrientation === 'vertical' || inputMode === 'tag';
  const requiresLandscape = isLandscapeRequiredForScoutingStage(activeStage) && !worksInPortrait;
  const liveScoutingOrientationGuardMediaQuery = getLiveScoutingOrientationGuardMediaQuery();
  const usesFixedShell = usesFixedScoutingShell(activeStage);
  const isOperationalStage = isOperationalScoutingStage(activeStage);
  const isPreMatchStage = activeStage === 'pre_match_config';
  const currentSetNumber = liveMatch?.isSetStarted ? liveMatch.currentSetNumber : stageSummary.nextSetNumber;
  const scoutingConfig = activeProject.scoutingConfig ?? createDefaultScoutingMatchConfig(activeProject.metadata.format);
  const getTeamCurrentSetStats = (teamSide: TeamSide) => {
    if (!isOperationalStage || !liveMatch) return { timeouts: 0, substitutions: 0 };
    const setNum = liveMatch.currentSetNumber;
    let timeouts = 0;
    let substitutions = 0;
    for (const event of latestEventLog) {
      if ('setNumber' in event && 'teamSide' in event && (event as { setNumber: number; teamSide: TeamSide }).setNumber === setNum && (event as { setNumber: number; teamSide: TeamSide }).teamSide === teamSide) {
        if (event.type === 'timeout_called') timeouts += 1;
        else if (event.type === 'substitution_made') substitutions += 1;
      }
    }
    return { timeouts, substitutions };
  };
  const homeTeamCurrentSetStats = getTeamCurrentSetStats('home');
  const awayTeamCurrentSetStats = getTeamCurrentSetStats('away');

  const matchSummaryParts = [
    `${homeTeamName} - ${awayTeamName}`,
    activeProject.metadata.competition || t('unknownCompetition'),
    formatDisplayDate(activeProject.metadata.playedAt) || t('dateUnavailable'),
    // Optional details are left out when missing rather than shown as "not selected".
    ...(activeProject.metadata.venue ? [activeProject.metadata.venue] : []),
    ...(formatDisplayTime(activeProject.metadata.playedAt) ? [formatDisplayTime(activeProject.metadata.playedAt)] : []),
  ];
  const dataVolleyRallyCode = useMemo(() => {
    if (activeStage !== 'live_rally' || !liveMatch?.isRallyActive || (liveMatch.currentRallyTouches.length ?? 0) === 0) {
      return '';
    }

    const currentTouches = liveMatch.currentRallyTouches;

    return buildDataVolleyRallyCode({
      touches: currentTouches,
      getJerseyNumber: (playerId?: string) => {
        if (!playerId) {
          return undefined;
        }

        const players = [...homeTeam.players, ...awayTeam.players];
        return players.find((player) => player.id === playerId)?.jerseyNumber;
      },
    });
  }, [activeStage, awayTeam.players, homeTeam.players, liveMatch?.currentRallyTouches, liveMatch?.isRallyActive]);

  const courtAutoCode = useMemo(() => {
    if (activeStage !== 'live_rally' || !liveMatch) return null;
    const touches = liveMatch.currentRallyTouches;
    if (touches.length > 0) {
      const allPlayers = [...homeTeam.players, ...awayTeam.players];
      return buildDataVolleyRallyCode({
        touches,
        getJerseyNumber: (playerId) => allPlayers.find((p) => p.id === playerId)?.jerseyNumber,
      });
    }
    if (liveMatch.servingTeam) {
      const servingLineup = liveMatch.servingTeam === 'home' ? liveMatch.homeActiveLineup : liveMatch.awayActiveLineup;
      const serverId = servingLineup?.slots.find((slot) => slot.courtPosition === 1)?.playerId;
      const servingPlayers = liveMatch.servingTeam === 'home' ? homeTeam.players : awayTeam.players;
      const jersey = serverId ? servingPlayers.find((p) => p.id === serverId)?.jerseyNumber : undefined;
      const teamCode = liveMatch.servingTeam === 'home' ? '*' : 'a';
      return jersey != null ? `${teamCode}${jersey}S` : null;
    }
    return null;
  }, [activeStage, liveMatch?.currentRallyTouches, liveMatch?.servingTeam, liveMatch?.homeActiveLineup, liveMatch?.awayActiveLineup, homeTeam.players, awayTeam.players]);

  const attackData = useMemo(() => {
    if (!liveMatch) return null;
    return {
      home: {
        stats: extractAttackStats(liveMatch.eventLog, 'home'),
        attackEntries: extractAttackEntries(liveMatch.eventLog, 'home'),
        currentRotation: liveMatch.homeActiveLineup?.rotationIndex ?? null,
        teamName: homeTeamName,
        serveStats: extractServeStats(liveMatch.eventLog, 'home'),
        getPlayerJersey: (pid: string) => homeTeam.players.find((p) => p.id === pid)?.jerseyNumber,
      },
      away: {
        stats: extractAttackStats(liveMatch.eventLog, 'away'),
        attackEntries: extractAttackEntries(liveMatch.eventLog, 'away'),
        currentRotation: liveMatch.awayActiveLineup?.rotationIndex ?? null,
        teamName: awayTeamName,
        serveStats: extractServeStats(liveMatch.eventLog, 'away'),
        getPlayerJersey: (pid: string) => awayTeam.players.find((p) => p.id === pid)?.jerseyNumber,
      },
    };
  }, [liveMatch?.eventLog, liveMatch?.homeActiveLineup?.rotationIndex, liveMatch?.awayActiveLineup?.rotationIndex, homeTeamName, awayTeamName, homeTeam.players, awayTeam.players]);

  const servePhase: ServePhaseInfo | null = useMemo(() => {
    // Show serve panel while waiting to serve AND during the first moment of the rally (before any touch committed).
    // isRallyActive is intentionally NOT checked - we want to show server tendencies before the rally starts.
    const isServePhase = liveMatch != null
      && (liveMatch.currentRallyTouches.length ?? 0) === 0
      && Boolean(liveMatch.servingTeam);
    if (!isServePhase || !liveMatch.servingTeam) return null;
    const servingTeamSide = liveMatch.servingTeam;
    const lineup = servingTeamSide === 'home' ? liveMatch.homeActiveLineup : liveMatch.awayActiveLineup;
    const servingPlayerId = lineup?.slots.find((s) => s.courtPosition === 1)?.playerId ?? null;
    return {
      servingTeamSide,
      servingPlayerId,
      getPlayerJersey: (side, playerId) => {
        const players = side === 'home' ? homeTeam.players : awayTeam.players;
        return players.find((p) => p.id === playerId)?.jerseyNumber;
      },
    };
  }, [liveMatch, homeTeam.players, awayTeam.players]);

  const getPlayersForTeamSide = (teamSide: TeamSide) => {
    const lineup = teamSide === 'home' ? liveMatch?.homeActiveLineup : liveMatch?.awayActiveLineup;
    const teamPlayers = teamSide === 'home' ? homeTeam.players : awayTeam.players;
    const lineupPlayerIds = lineup?.slots.map((slot) => slot.playerId) ?? [];
    const playersFromLineup = lineupPlayerIds
      .map((playerId) => teamPlayers.find((player) => player.id === playerId))
      .filter((player): player is typeof teamPlayers[number] => Boolean(player));

    return playersFromLineup.length > 0 ? playersFromLineup : teamPlayers;
  };

  const getTeamRosterForTeamSide = (teamSide: TeamSide) => (
    teamSide === 'home' ? homeTeam.players : awayTeam.players
  );

  const getLineupForTeamSide = (teamSide: TeamSide) => (
    teamSide === 'home' ? liveMatch?.homeActiveLineup ?? null : liveMatch?.awayActiveLineup ?? null
  );

  const getPlayerLabel = (teamSide: TeamSide, playerId: string) => {
    const player = getTeamRosterForTeamSide(teamSide).find((item) => item.id === playerId);

    return player ? `${formatPlayerLabel(player.jerseyNumber, getPlayerDisplayName(player))}` : t('notSpecified');
  };

  const {
    getLiberoProposalLabel,
    getLiberoFrontRowMessage,
    getLiberoTouchViolationMessage,
    getLiberoEntryProposalMessage,
    getAutomaticLiberoProposalMessage,
    getLiberoConfirmLabel,
    getInitialLiberoEntryMessages,
  } = createLiberoMessages(t, getPlayerLabel);
  const getManageActionEventLabel = (eventType: DeadBallEventType) => getManageActionEventLabelFor(t, eventType);


  const automaticLiberoProposals = liveMatch && !liveMatch.isRallyActive
    ? (['away', 'home'] as TeamSide[])
      .map((teamSide) => getAutomaticLiberoReplacementProposal(liveMatch, teamSide))
      .filter((proposal): proposal is LiberoReplacementProposal => Boolean(proposal))
      .sort((left, right) => getLiberoProposalPriority(left) - getLiberoProposalPriority(right))
    : [];
  const primaryAutomaticLiberoProposal = automaticLiberoProposals[0] ?? null;

  const createManageActionDraft = (
    eventType: DeadBallEventType,
    teamSide: TeamSide,
    liberoProposal: LiberoReplacementProposal | null = null,
  ): ManageActionDraft => {
    const videoCheckContext = liveMatch ? getLatestVideoCheckContext(liveMatch) : null;
    const lineup = getLineupForTeamSide(teamSide);
    const rosterPlayers = getTeamRosterForTeamSide(teamSide);
    const defaultSubstitutionPlayerOutId = lineup?.slots.find((slot) => (
      !slot.isLibero && !rosterPlayers.find((player) => player.id === slot.playerId)?.isLibero
    ))?.playerId ?? '';
    const defaultSubstitutionPlayerInId = lineup && defaultSubstitutionPlayerOutId
      ? getEligiblePlayersInForSubstitution({
          lineup,
          playerOutId: defaultSubstitutionPlayerOutId,
          rosterPlayers,
        })[0]?.id ?? ''
      : '';
    const defaultLiberoProposal = eventType === 'libero_replacement' && liveMatch
      ? liberoProposal
        ?? (!liveMatch.isRallyActive ? getAutomaticLiberoReplacementProposal(liveMatch, teamSide) : null)
        ?? getManualLiberoReplacementProposals(liveMatch, teamSide)[0]
        ?? null
      : null;

    return {
      eventType,
      teamSide,
      videoCheckContext,
      videoCheckTouch: videoCheckContext?.originalTouch
        ? {
            ...videoCheckContext.originalTouch,
            evaluation: videoCheckContext.proposedEvaluation ?? videoCheckContext.originalTouch.evaluation,
          }
        : null,
      substitutionPlayerOutId: defaultSubstitutionPlayerOutId,
      substitutionPlayerInId: defaultSubstitutionPlayerInId,
      liberoProposal: defaultLiberoProposal,
    };
  };

  // Applies an automatic libero EXIT (mandatory FIVB rule) or ENTRY (when
  // liberoAutoMiddleReplacement is enabled) without any blocking dialog, then
  // chains any follow-up automatic replacement for either team.
  const applyLiberoReplacementAutomatically = (
    sourceLiveMatch: LiveMatchState,
    proposal: LiberoReplacementProposal,
    remainingSteps = 4,
  ): boolean => {
    const nextEventLog = [
      ...sourceLiveMatch.eventLog,
      buildLiberoReplacementMadeEvent(sourceLiveMatch, proposal),
    ];

    if (!replaceLiveMatchEvents(nextEventLog)) {
      return false;
    }

    const updatedLiveMatch = useScoutingStore.getState().liveMatch;
    syncCourtStateFromLiveMatch();

    if (remainingSteps > 1 && updatedLiveMatch && !updatedLiveMatch.isRallyActive) {
      const followUpProposal = (['away', 'home'] as TeamSide[])
        .map((teamSide) => getAutomaticLiberoReplacementProposal(updatedLiveMatch, teamSide))
        .filter((item): item is LiberoReplacementProposal => Boolean(item))
        .sort((left, right) => getLiberoProposalPriority(left) - getLiberoProposalPriority(right))[0] ?? null;

      if (followUpProposal) {
        return applyLiberoReplacementAutomatically(updatedLiveMatch, followUpProposal, remainingSteps - 1);
      }
    }

    showTransientCourtMessage(getAutomaticLiberoProposalMessage(proposal));

    return true;
  };

  const openAutomaticLiberoProposal = (sourceLiveMatch: LiveMatchState | null | undefined) => {
    const proposal = sourceLiveMatch && !sourceLiveMatch.isRallyActive
      ? (['away', 'home'] as TeamSide[])
        .map((teamSide) => getAutomaticLiberoReplacementProposal(sourceLiveMatch, teamSide))
        .filter((item): item is LiberoReplacementProposal => Boolean(item))
        .sort((left, right) => getLiberoProposalPriority(left) - getLiberoProposalPriority(right))[0] ?? null
      : null;

    if (!proposal) {
      return false;
    }

    return applyLiberoReplacementAutomatically(sourceLiveMatch!, proposal);
  };

  const handleSidelinePlayerTap = (playerId: string, teamSide: TeamSide, targetPlayerId?: string): boolean => {
    const currentLiveMatch = useScoutingStore.getState().liveMatch;
    if (!currentLiveMatch) {
      return false;
    }

    const teamLineup = teamSide === 'home'
      ? currentLiveMatch.homeActiveLineup
      : currentLiveMatch.awayActiveLineup;
    // When automatic middle replacement is off, tapping the libero beside the
    // court selects them directly for a touch without recording an exchange.
    if (!(teamLineup?.personnelState?.liberoAutoMiddleReplacement ?? true)) {
      return true;
    }

    const result = getLiberoTapProposal(currentLiveMatch, teamSide, playerId, targetPlayerId);
    if (!result.ok) {
      showTransientCourtMessage(t('noLiberoReplacementAvailable'));
      return false;
    }

    const eventCountBefore = currentLiveMatch.eventLog.length;
    const nextEventLog = buildLiberoTapEventLog(currentLiveMatch, result.proposal);
    if (!replaceLiveMatchEvents(nextEventLog)) {
      showTransientCourtMessage(t('noLiberoReplacementAvailable'));
      return false;
    }

    if (!currentLiveMatch.isRallyActive) {
      // Between rallies the exchange is the last event: one undo step.
      pushUndoEntry({ eventCountBefore, label: 'libero_replacement', actionType: 'libero_replacement' });
    } else {
      // During a rally it is inserted before the rally start: shift the undo
      // entries of this rally, or undoing a touch would also drop the one before.
      const insertedAt = nextEventLog.findIndex((event, index) => event !== currentLiveMatch.eventLog[index]);
      if (insertedAt >= 0 && insertedAt < eventCountBefore) {
        useScoutingStore.getState().shiftUndoStackForInsertion(insertedAt);
      }
    }
    showTransientCourtMessage(result.proposal.action === 'regular_returns'
      ? t('liberoReturnDone', {
          player: getPlayerLabel(teamSide, result.proposal.replacedPlayerId),
          libero: getPlayerLabel(teamSide, result.proposal.liberoPlayerId),
        })
      : t('liberoEntryDone', {
          libero: getPlayerLabel(teamSide, result.proposal.liberoPlayerId),
          player: getPlayerLabel(teamSide, result.proposal.replacedPlayerId),
        }));
    return true;
  };

  const openManageAction = () => {
    const defaultTeamSide = primaryAutomaticLiberoProposal?.teamSide ?? liveMatch?.servingTeam ?? 'away';
    const defaultEventType: DeadBallEventType = primaryAutomaticLiberoProposal ? 'libero_replacement' : 'replay';

    setManageActionDraft(createManageActionDraft(defaultEventType, defaultTeamSide, primaryAutomaticLiberoProposal));
  };

  // Header shortcuts: open the event dialog already set to this team and type.
  const openManageActionFor = (eventType: DeadBallEventType, teamSide: TeamSide) => {
    setManageActionDraft(createManageActionDraft(eventType, teamSide));
  };

  const closeManageAction = () => {
    setManageActionDraft(null);
  };

  useEffect(() => {
    if (
      activeStage !== 'live_rally'
      || manageActionDraft
      || !primaryAutomaticLiberoProposal
    ) {
      return;
    }

    // Exit proposals are applied automatically without dialog (FIVB rule: mandatory).
    // Entries are never forced on the scout: the dialog used to reopen as soon
    // as it was closed, with the set's first libero, so a scout who had
    // switched liberos (or whose roles were mislabelled) could not go on.
    // The libero comes in by a tap beside the court (handleSidelinePlayerTap).
    if (primaryAutomaticLiberoProposal) {
      const sourceLiveMatch = useScoutingStore.getState().liveMatch;
      if (sourceLiveMatch) {
        applyLiberoReplacementAutomatically(sourceLiveMatch, primaryAutomaticLiberoProposal);
      }
    }
  }, [
    activeStage,
    manageActionDraft,
    primaryAutomaticLiberoProposal?.action,
    primaryAutomaticLiberoProposal?.playerInId,
    primaryAutomaticLiberoProposal?.playerOutId,
    primaryAutomaticLiberoProposal?.reason,
    primaryAutomaticLiberoProposal?.teamSide,
  ]);

  const syncCourtStateFromLiveMatch = () => {
    const latestLiveMatch = useScoutingStore.getState().liveMatch;
    if (!latestLiveMatch?.servingTeam) {
      setSelectedZone(null);
      setCourtPhase('waiting_to_serve');
      setTeamTacticalPhases(getInitialTeamTacticalPhases(null));
      setPendingSetterReleaseTeamSide(null);
      setIsAceVictimSelection(false);
      touchOriginZoneRef.current = null;
      return;
    }

    const nextSelectedZone = latestLiveMatch.isRallyActive
      ? null
      : getDefaultServeStartZoneForTeam(latestLiveMatch.servingTeam, liveScoutingCells);

    setSelectedZone(nextSelectedZone);
    setCourtPhase(latestLiveMatch.isRallyActive ? 'rally_in_play' : 'waiting_to_serve');
    setTeamTacticalPhases(getTeamTacticalPhasesAfterTouches({
      servingTeam: latestLiveMatch.servingTeam,
      touches: latestLiveMatch.currentRallyTouches,
    }));
    setPendingSetterReleaseTeamSide(null);
    setIsAceVictimSelection(false);
    touchOriginZoneRef.current = null;
  };

  const persistProject = async (project: MatchProject) => {
    const persistedProject = await matchRepository.update(project);
    setActiveProject(persistedProject);
  };

  // Players can join the match roster by jersey number at any time (set start,
  // substitutions). Recorded events are folded in first so the save never
  // drops touches that are still only in the live store.
  const handleAddPlayersToMatch = async (
    teamSide: TeamSide,
    entries: QuickEntryPlayer[],
  ): Promise<AddPlayersResult> => {
    const latestLiveMatch = useScoutingStore.getState().liveMatch;
    let project = latestLiveMatch && latestLiveMatch.activeProjectId === activeProject.metadata.id
      ? syncProjectWithLiveMatch(activeProject, latestLiveMatch)
      : activeProject;
    const added: number[] = [];
    const skipped: number[] = [];
    const addedPlayerIds: string[] = [];

    for (const entry of entries) {
      const result = await addJerseyPlayerToMatch(project, teamSide, entry);
      if (result.status === 'added') {
        project = result.project;
        added.push(entry.jerseyNumber);
        addedPlayerIds.push(getMatchRosterPlayerKey(result.player));
      } else {
        skipped.push(entry.jerseyNumber);
      }
    }

    if (added.length > 0) {
      await persistProject(project);
    }

    return { added, skipped, addedPlayerIds, team: getMatchTeamSnapshot(project, teamSide) };
  };

  // Tag input: a bench player turned out to be on court. The substitution
  // happened before this rally, so it is recorded before the rally's start
  // (inserting it among the rally's touches would be out of order).
  const recordSubstitutionBeforeRally = (teamSide: TeamSide, playerOutId: string, playerInId: string): boolean => {
    const currentLiveMatch = useScoutingStore.getState().liveMatch;
    const lineup = currentLiveMatch
      ? (teamSide === 'home' ? currentLiveMatch.homeActiveLineup : currentLiveMatch.awayActiveLineup)
      : null;
    if (!currentLiveMatch || !lineup) return false;

    const eligibility = getNormalSubstitutionEligibility({
      lineup,
      playerOutId,
      playerInId,
      rosterPlayers: getTeamRosterForTeamSide(teamSide),
    });
    if (!eligibility.isEligible) return false;

    const reentryPair = lineup.personnelState.substitutionPairs.find((pair) => (
      pair.playerOutId === playerInId && pair.playerInId === playerOutId && !pair.hasReentered
    ));
    const substitution = buildSubstitutionMadeEvent({
      liveMatch: currentLiveMatch,
      teamSide,
      playerOutId,
      playerInId,
      canReenterOnlyForPlayerId: reentryPair ? playerOutId : playerInId,
      hasReentered: Boolean(reentryPair),
    });

    const log = currentLiveMatch.eventLog;
    let insertAt = log.length;
    if (currentLiveMatch.currentRallyTouches.length > 0) {
      for (let index = log.length - 1; index >= 0; index -= 1) {
        if (log[index].type === 'rally_started') {
          insertAt = index;
          break;
        }
      }
    }
    if (!replaceLiveMatchEvents([...log.slice(0, insertAt), substitution, ...log.slice(insertAt)])) {
      return false;
    }
    // Undo entries count events: an insertion in the middle shifts the later ones.
    if (insertAt < log.length) {
      useScoutingStore.getState().shiftUndoStackForInsertion(insertAt);
    }
    syncCourtStateFromLiveMatch();
    return true;
  };

  // A position left empty at set start gets its player by jersey number. The
  // set's starting lineup is completed (the slot keeps its place through the
  // rotations), so replay, rotations and exports see the player there from
  // the start of the set.
  //
  // With `move`, a player who started the set in another position (placed
  // there by mistake) is moved to this one: their starting slot becomes empty.
  const fillEmptyLineupPosition = (
    teamSide: TeamSide,
    playerId: string,
    courtPosition: CourtPosition,
    move = false,
  ): boolean => {
    const currentLiveMatch = useScoutingStore.getState().liveMatch;
    const lineup = currentLiveMatch
      ? (teamSide === 'home' ? currentLiveMatch.homeActiveLineup : currentLiveMatch.awayActiveLineup)
      : null;
    if (!currentLiveMatch || !lineup) return false;
    if (!move && lineup.slots.some((slot) => slot.playerId === playerId)) return false;
    if (lineup.slots.find((slot) => slot.courtPosition === courtPosition)?.playerId) return false;

    const log = currentLiveMatch.eventLog;
    let setStartIndex = -1;
    log.forEach((event, index) => {
      if (event.type === 'set_started' && event.setNumber === currentLiveMatch.currentSetNumber) setStartIndex = index;
    });
    const setStarted = log[setStartIndex];
    if (!setStarted || setStarted.type !== 'set_started') return false;
    const lineupKey = teamSide === 'home' ? 'homeLineup' : 'awayLineup';
    const originalStartingLineup = setStarted[lineupKey];
    const movedFrom = move ? originalStartingLineup.slots.find((slot) => slot.playerId === playerId) : undefined;
    if (move && !movedFrom) return false;
    const startingLineup = movedFrom
      ? {
        ...originalStartingLineup,
        slots: originalStartingLineup.slots.map((slot) => (slot === movedFrom ? { ...slot, playerId: undefined } : slot)),
      }
      : originalStartingLineup;

    // The team may have rotated since the set started: try each slot that
    // started empty and keep the one that is now in the tapped position.
    for (const candidate of startingLineup.slots.filter((slot) => !slot.playerId && slot.courtPosition !== movedFrom?.courtPosition)) {
      const nextLog = [...log];
      nextLog[setStartIndex] = {
        ...setStarted,
        [lineupKey]: {
          ...startingLineup,
          slots: startingLineup.slots.map((slot) => (slot === candidate ? { ...slot, playerId } : slot)),
          setterPlayerId: (movedFrom && startingLineup.setterPlayerId === playerId ? undefined : startingLineup.setterPlayerId)
            ?? (candidate.tacticalRole === PlayerRole.SETTER ? playerId : undefined),
          benchPlayerIds: startingLineup.benchPlayerIds?.filter((benchPlayerId) => benchPlayerId !== playerId),
        },
      };
      if (!replaceLiveMatchEvents(nextLog)) continue;
      const rebuilt = useScoutingStore.getState().liveMatch;
      const rebuiltLineup = teamSide === 'home' ? rebuilt?.homeActiveLineup : rebuilt?.awayActiveLineup;
      // A back-row middle may already be replaced by the libero.
      if (rebuiltLineup?.slots.some((slot) => slot.courtPosition === courtPosition
        && (slot.playerId === playerId || slot.replacedPlayerId === playerId))) {
        // Undo entries count events; the set start changed in place.
        useScoutingStore.getState().clearUndoStack();
        syncCourtStateFromLiveMatch();
        return true;
      }
    }
    replaceLiveMatchEvents(log);
    return false;
  };

  // Tags: a jersey number picked from the number grid. A new number joins the
  // team; with a position, the player fills that empty lineup position.
  const assignJerseyFromTagInput = async (
    teamSide: TeamSide,
    jerseyNumber: number,
    courtPosition: CourtPosition | null,
  ): Promise<string | null> => {
    let playerId = getTeamRosterForTeamSide(teamSide).find((player) => player.jerseyNumber === jerseyNumber)?.id ?? null;
    if (!playerId) {
      const result = await handleAddPlayersToMatch(teamSide, [{ jerseyNumber, isLibero: false }]);
      playerId = result.addedPlayerIds[0]
        ?? result.team.players.find((player) => player.jerseyNumber === jerseyNumber)?.id
        ?? null;
    }
    if (!playerId) return null;
    if (courtPosition !== null && !fillEmptyLineupPosition(teamSide, playerId, courtPosition)) return null;
    return playerId;
  };

  const openEmptyPosition = (teamSide: TeamSide, courtPosition: CourtPosition) => {
    setPendingEmptyPosition({ teamSide, courtPosition });
    setEmptyPositionJersey('');
    setEmptyPositionError(null);
    setEmptyPositionMove(null);
  };

  const confirmEmptyPositionMove = () => {
    if (!pendingEmptyPosition || !emptyPositionMove) return;
    if (!fillEmptyLineupPosition(pendingEmptyPosition.teamSide, emptyPositionMove.playerId, pendingEmptyPosition.courtPosition, true)) {
      setEmptyPositionMove(null);
      setEmptyPositionError(t('emptyPositionMoveFailed', { jersey: emptyPositionMove.jerseyNumber }));
      return;
    }
    setEmptyPositionMove(null);
    setPendingEmptyPosition(null);
  };

  const confirmEmptyPosition = async () => {
    if (!pendingEmptyPosition) return;
    const jerseyNumber = Number(emptyPositionJersey);
    if (!Number.isInteger(jerseyNumber) || jerseyNumber < 0 || jerseyNumber > 99) return;
    const { teamSide, courtPosition } = pendingEmptyPosition;
    const lineup = teamSide === 'home' ? liveMatch?.homeActiveLineup : liveMatch?.awayActiveLineup;
    let playerId = getTeamRosterForTeamSide(teamSide).find((entry) => entry.jerseyNumber === jerseyNumber)?.id;
    const onCourt = playerId ? lineup?.slots.find((slot) => slot.playerId === playerId) : undefined;
    if (playerId && onCourt) {
      // Placed in the wrong position: offer to move them here.
      setEmptyPositionMove({ playerId, jerseyNumber, from: onCourt.courtPosition });
      return;
    }
    if (!playerId) {
      // A new number joins the match roster (and the team archive).
      const result = await handleAddPlayersToMatch(teamSide, [{ jerseyNumber, isLibero: false }]);
      playerId = result.addedPlayerIds[0]
        ?? result.team.players.find((entry) => entry.jerseyNumber === jerseyNumber)?.id;
    }
    if (!playerId || !fillEmptyLineupPosition(teamSide, playerId, courtPosition)) {
      setEmptyPositionError(t('emptyPositionFailed'));
      return;
    }
    setPendingEmptyPosition(null);
  };

  const handleQuickAddSubstitute = async (entries: QuickEntryPlayer[]): Promise<QuickJerseyEntryOutcome> => {
    const teamSide = manageActionDraft?.teamSide;
    if (!teamSide) {
      return { added: [], skipped: entries.map((entry) => entry.jerseyNumber) };
    }

    const result = await handleAddPlayersToMatch(teamSide, entries);
    const newCourtPlayerId = result.addedPlayerIds.find((playerId) => (
      !result.team.players.find((player) => player.id === playerId)?.isLibero
    ));
    if (newCourtPlayerId) {
      handleSubstitutionPlayerInChange(newCourtPlayerId);
    }
    return result;
  };

  const markLiveOnboardingAsSeen = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LIVE_SCOUTING_ONBOARDING_KEY, 'true');
    }
    setHasSeenLiveOnboarding(true);
    setShowOnboarding(false);
  };

  const openLiveHelp = () => {
    markLiveOnboardingAsSeen();
    setShowHelpModal(true);
  };

  const closeLiveHelp = () => {
    setShowHelpModal(false);
  };

  const createTouchEventLocation = (touch: BallTouch): Extract<MatchEvent, { type: 'touch_recorded' }>['location'] => ({
    teamSide: touch.zone?.teamSide ?? touch.teamSide,
    zoneId: touch.zone?.zoneId,
    gridCoordinate: touch.zone?.gridCoordinate,
    point: touch.zone?.point,
  });

  const replaceLatestCurrentRallyTouch = (touch: BallTouch) => {
    const latestLiveMatch = useScoutingStore.getState().liveMatch;
    if (!latestLiveMatch?.isRallyActive) {
      return false;
    }

    const eventIndex = [...latestLiveMatch.eventLog].reverse().findIndex((event) => (
      event.type === 'touch_recorded'
      && event.touch.setNumber === touch.setNumber
      && event.touch.rallyNumber === touch.rallyNumber
      && event.touch.sequenceNumber === touch.sequenceNumber
    ));
    if (eventIndex < 0) {
      return false;
    }

    const eventLogIndex = latestLiveMatch.eventLog.length - 1 - eventIndex;
    const event = latestLiveMatch.eventLog[eventLogIndex];
    if (event.type !== 'touch_recorded') {
      return false;
    }

    const nextEventLog = latestLiveMatch.eventLog.map((currentEvent, index) => (
      index === eventLogIndex
        ? {
            ...event,
            createdAt: touch.createdAt,
            touch,
            location: createTouchEventLocation(touch),
          }
        : currentEvent
    ));

    return replaceLiveMatchEvents(nextEventLog);
  };

  // Video time when the scout started entering the current action (first tap
  // on the court or first key in the code input): the action happened then,
  // not when it is confirmed seconds later.
  const actionStartVideoSecondsRef = useRef<number | null>(null);
  const pendingActionVideoSecondsRef = useRef<number | undefined>(undefined);
  const markActionStart = () => {
    if (actionStartVideoSecondsRef.current !== null) return;
    const now = liveVideoPanelRef.current?.getCurrentTime();
    if (typeof now === 'number' && Number.isFinite(now)) actionStartVideoSecondsRef.current = now;
  };
  const takeActionVideoSeconds = (): number | undefined => {
    const now = liveVideoPanelRef.current?.getCurrentTime();
    const start = actionStartVideoSecondsRef.current;
    actionStartVideoSecondsRef.current = null;
    if (typeof now !== 'number' || !Number.isFinite(now)) return undefined;
    return resolveActionVideoSeconds(start, now);
  };
  /** Confirms a batch of touches entered as one action, all stamped with its start time. */
  const confirmActionTouches = (touches: PendingTouch[]) => {
    pendingActionVideoSecondsRef.current = takeActionVideoSeconds();
    try {
      touches.forEach((touch) => handleTouchConfirm(touch));
    } finally {
      pendingActionVideoSecondsRef.current = undefined;
    }
  };

  const handleTouchConfirm = (draft: PendingTouch) => {
    let latestLiveMatch = useScoutingStore.getState().liveMatch;
    if (!latestLiveMatch) {
      return;
    }

    const liberoTouchValidation = validateLiberoTouch({
      lineups: {
        homeActiveLineup: latestLiveMatch.homeActiveLineup,
        awayActiveLineup: latestLiveMatch.awayActiveLineup,
      },
      teamSide: draft.teamSide,
      playerId: draft.playerId,
      skill: draft.skill,
    });
    if (!liberoTouchValidation.isValid) {
      showTransientCourtMessage(getLiberoTouchViolationMessage(liberoTouchValidation.violation));
      return;
    }

    if (!latestLiveMatch.isRallyActive) {
      if (draft.skill !== 'serve') {
        return;
      }

      startRally();
      latestLiveMatch = useScoutingStore.getState().liveMatch;
      if (!latestLiveMatch?.isRallyActive) {
        return;
      }
    }

    const previousTouch = latestLiveMatch.currentRallyTouches.at(-1) ?? null;
    const replacesPreviousTouch = shouldReplaceLatestPendingTouch(
      previousTouch,
      draft,
      latestLiveMatch.currentSetNumber,
      latestLiveMatch.currentRallyNumber,
    );
    const touchId = replacesPreviousTouch ? previousTouch.id : draft.id ?? `touch-${crypto.randomUUID()}`;
    const ballDirection = draft.ballDirection ?? draft.trajectory?.direction;
    const trajectory = draft.trajectory
      ? updateBallTrajectoryMetadata(draft.trajectory, {
          rallyTouchId: touchId,
          teamSide: draft.teamSide,
          skill: draft.skill,
          evaluation: draft.evaluation,
        })
      : ballDirection
        ? createBallTrajectory({
            id: `trajectory-${touchId}`,
            rallyTouchId: touchId,
            teamSide: draft.teamSide,
            skill: draft.skill,
            evaluation: draft.evaluation,
            direction: ballDirection,
          }) ?? undefined
      : undefined;
    const homeSetterPosition = latestLiveMatch.homeActiveLineup?.setterPlayerId
      ? latestLiveMatch.homeActiveLineup.slots.find((s) => s.playerId === latestLiveMatch.homeActiveLineup!.setterPlayerId)?.courtPosition
      : undefined;
    const awaySetterPosition = latestLiveMatch.awayActiveLineup?.setterPlayerId
      ? latestLiveMatch.awayActiveLineup.slots.find((s) => s.playerId === latestLiveMatch.awayActiveLineup!.setterPlayerId)?.courtPosition
      : undefined;
    const touch: BallTouch = {
      id: touchId,
      setNumber: latestLiveMatch.currentSetNumber,
      rallyNumber: latestLiveMatch.currentRallyNumber,
      sequenceNumber: replacesPreviousTouch ? previousTouch.sequenceNumber : latestLiveMatch.currentRallyTouches.length + 1,
      playerId: draft.playerId,
      teamSide: draft.teamSide,
      skill: draft.skill,
      evaluation: draft.evaluation,
      zone: createZoneReference(draft.zone, draft.destinationPoint),
      originZone: touchOriginZoneRef.current ? createZoneReference(touchOriginZoneRef.current) : undefined,
      targetZone: createZoneReference(draft.zone, draft.destinationPoint),
      ballDirection,
      trajectory,
      createdAt: Date.now(),
      source: draft.source ?? 'explicit',
      touchOrigin: draft.touchOrigin ?? (draft.source === 'inferred' ? 'implicit_inference' : 'live_scouting'),
      advancedDetails: draft.advancedDetails,
      attackType: draft.attackType,
      setType: draft.setType,
      serveType: draft.serveType,
      skillTypeCode: draft.skillTypeCode,
      combinationCode: draft.combinationCode,
      setterCallCode: draft.setterCallCode,
      customCode: draft.customCode,
      numBlockers: draft.numBlockers,
      // Court / Expert: the type chosen on the toolbar before the attack (hard by default).
      attackSubtype: draft.attackSubtype ?? (draft.skill === 'attack' ? useAttackSubtypeStore.getState().take() : undefined),
      ...(draft.withoutZones ? { withoutZones: true } : {}),
      homeSetterPosition,
      awaySetterPosition,
      // draft.zone is the zone where the user snapped the ball.
      // If it's on the same side as the touching team → it's the START zone (e.g. attacker's position).
      // If it crossed to the opponent's side → it's the END zone (ball landing, via ball-drag).
      // In the second case, touchOriginZoneRef holds the last zone on the attacker's side = START zone.
      // Button input (Tags, Basic): no zone from the placeholder position, only zones picked on purpose.
      startZoneCode: draft.withoutZones ? draft.startZoneCode : draft.startZoneCode ?? (
        !draft.zone || draft.zone.teamSide === draft.teamSide
          ? getZoneCode(createZoneReference(draft.zone))
          : getZoneCode(touchOriginZoneRef.current ? createZoneReference(touchOriginZoneRef.current) : undefined)
      ),
      endZoneCode: draft.withoutZones ? draft.endZoneCode : draft.endZoneCode ?? (
        draft.zone && draft.zone.teamSide !== draft.teamSide
          ? getZoneCode(createZoneReference(draft.zone))
          : ''
      ),
      recordedAtTime: draft.recordedAtTime,
      recordedAtIso: draft.recordedAtIso,
      videoTimeSeconds: pendingActionVideoSecondsRef.current ?? liveVideoPanelRef.current?.getCurrentTime(),
      requiredExplicitInput: draft.requiredExplicitInput ?? false,
      inferredCandidate: draft.inferredCandidate ?? false,
      pendingInference: draft.pendingInference ?? false,
      inferenceReason: draft.inferenceReason,
      inferredFromTouchId: draft.inferredFromTouchId,
    };

    if (replacesPreviousTouch && replaceLatestCurrentRallyTouch(touch)) {
      const updatedLiveMatch = useScoutingStore.getState().liveMatch;
      if (updatedLiveMatch) {
        setTeamTacticalPhases(getTeamTacticalPhasesAfterTouches({
          servingTeam: updatedLiveMatch.servingTeam,
          touches: updatedLiveMatch.currentRallyTouches,
        }));
      }
      return;
    }

    recordTouch(touch);
    setTeamTacticalPhases((currentPhases) => getNextTeamTacticalPhasesAfterTouch({
      phases: currentPhases,
      touch,
      previousTouch,
      servingTeam: latestLiveMatch.servingTeam,
    }));
  };

  const finalizeRally = (pointWinner: 'home' | 'away', reason?: string) => {
    playConfirmFeedback('point', useAppStore.getState().feedbackSound);
    // With the video open the point keeps its video position: where the rally ends.
    awardPoint(pointWinner, reason, liveVideoPanelRef.current?.getCurrentTime());
    const pointAwardedLiveMatch = useScoutingStore.getState().liveMatch;
    endRally();
    const rallyEndedLiveMatch = useScoutingStore.getState().liveMatch;
    setSelectedZone(null);
    setCourtPhase('waiting_to_serve');
    setTeamTacticalPhases(getInitialTeamTacticalPhases(pointWinner));
    setIsAceVictimSelection(false);
    touchOriginZoneRef.current = null;
    if (openAutomaticLiberoProposal(rallyEndedLiveMatch ?? pointAwardedLiveMatch)) {
      return;
    }

    showTransientCourtMessage(`${t('rallyEnded')} · ${t('pointTo', {
      team: pointWinner === 'home' ? homeTeamName : awayTeamName,
    })}`);
  };

  const handleManualPoint = (pointWinner: TeamSide) => {
    const eventCountBefore = useScoutingStore.getState().liveMatch?.eventLog.length ?? 0;
    if (!awardManualPoint(pointWinner)) {
      return;
    }
    playConfirmFeedback('point', useAppStore.getState().feedbackSound);

    pushUndoEntry({ eventCountBefore, label: 'manual_point', actionType: 'manual_point' });
    syncCourtStateFromLiveMatch();
    if (openAutomaticLiberoProposal(useScoutingStore.getState().liveMatch)) {
      return;
    }

    showTransientCourtMessage(t('pointAwardedTo', {
      team: pointWinner === 'home' ? homeTeamName : awayTeamName,
    }));
  };

  const handleUndoLastPoint = (teamSide?: TeamSide) => {
    if (teamSide) {
      const latestPointTeamSide = getLatestPointTeamSide(useScoutingStore.getState().liveMatch?.eventLog);

      if (latestPointTeamSide !== teamSide) {
        return;
      }
    }

    if (!undoLastPoint()) {
      return;
    }

    syncCourtStateFromLiveMatch();
    showTransientCourtMessage(
      teamSide
        ? t('undoForTeam', { team: teamSide === 'home' ? homeTeamName : awayTeamName })
        : t('undoLastPoint'),
    );
  };

  const handleGroupedUndo = () => {
    const touchBeingUndone = useScoutingStore.getState().liveMatch?.currentRallyTouches.at(-1);
    const result = performGroupedUndo();
    if (!result.ok) {
      return;
    }

    if (typeof touchBeingUndone?.videoTimeSeconds === 'number') {
      liveVideoPanelRef.current?.seekTo(touchBeingUndone.videoTimeSeconds);
    }
    syncCourtStateFromLiveMatch();
    showTransientCourtMessage(t('undoAction'));
  };

  const handleRemoveLastTouch = () => {
    const touchBeingRemoved = useScoutingStore.getState().liveMatch?.currentRallyTouches.at(-1);
    const result = removeLastTouchFromCurrentRally();
    if (!result.ok) {
      return;
    }
    if (typeof touchBeingRemoved?.videoTimeSeconds === 'number') {
      liveVideoPanelRef.current?.seekTo(touchBeingRemoved.videoTimeSeconds);
    }
    syncCourtStateFromLiveMatch();
    showTransientCourtMessage(t('undoLastTouchOnly'));
  };

  const handleSetStarted = ({
    homeStartingLineup,
    awayStartingLineup,
    servingTeam,
  }: {
    homeStartingLineup: Parameters<typeof startSet>[0]['homeStartingLineup'];
    awayStartingLineup: Parameters<typeof startSet>[0]['awayStartingLineup'];
    servingTeam: Parameters<typeof startSet>[0]['servingTeam'];
  }) => {
    if (!activeProject) {
      return;
    }

    const setStartInput = {
      activeProjectId: activeProject.metadata.id,
      setNumber: currentSetNumber,
      homeStartingLineup,
      awayStartingLineup,
      servingTeam,
      existingEvents: latestEventLog,
      completedSets,
    };

    startSet(setStartInput);
    const startedLiveMatch = useScoutingStore.getState().liveMatch;
    setTeamTacticalPhases(getInitialTeamTacticalPhases(servingTeam));
    setCourtPhase('waiting_to_serve');
    setIsAceVictimSelection(false);
    setSelectedZone(null);
    touchOriginZoneRef.current = null;
    setStageOverride(null);

    const initialLiberoMessages = getInitialLiberoEntryMessages(startedLiveMatch);
    if (initialLiberoMessages.length > 0) {
      showTransientCourtMessage(initialLiberoMessages.join(' · '));
    }
  };

  const correctableSetStart = liveMatch && !liveMatch.isRallyActive
    ? getCorrectableSetStart(liveMatch.eventLog)
    : null;

  // Replaces the starting lineups of the set under way (only before its first rally).
  const handleSetStartCorrected = ({
    homeStartingLineup,
    awayStartingLineup,
    servingTeam,
  }: {
    homeStartingLineup: Parameters<typeof startSet>[0]['homeStartingLineup'];
    awayStartingLineup: Parameters<typeof startSet>[0]['awayStartingLineup'];
    servingTeam: Parameters<typeof startSet>[0]['servingTeam'];
  }) => {
    const currentLiveMatch = useScoutingStore.getState().liveMatch;
    const nextEventLog = currentLiveMatch
      ? replaceCurrentSetStart(currentLiveMatch.eventLog, { homeStartingLineup, awayStartingLineup, servingTeam })
      : null;
    setIsCorrectingSetStart(false);
    if (!nextEventLog || !replaceLiveMatchEvents(nextEventLog)) {
      return;
    }
    useScoutingStore.getState().clearUndoStack();
    setTeamTacticalPhases(getInitialTeamTacticalPhases(servingTeam));
    syncCourtStateFromLiveMatch();
    showTransientCourtMessage(t('startingLineupCorrected'));
  };

  const handleSaveConfig = async (config: typeof scoutingConfig) => {
    await persistProject(updateScoutingConfig(activeProject, config));
    setStageOverride('set_setup');
  };

  const handleStartNextSet = () => {
    setSelectedZone(null);
    setCourtPhase('waiting_to_serve');
    setTeamTacticalPhases(getInitialTeamTacticalPhases(null));
    setIsAceVictimSelection(false);
    touchOriginZoneRef.current = null;
    setStageOverride('set_setup');
  };

  const handleSelectedZoneChange = (zone: ScoutingZone | null) => {
    if (!zone) {
      setSelectedZone(null);
      touchOriginZoneRef.current = null;
      return;
    }

    const nextCourtPhase = getNextLiveCourtPhase(courtPhase, zone);

    touchOriginZoneRef.current = selectedZone;
    setCourtPhase(nextCourtPhase);
    setSelectedZone(zone);
    if (zone.kind === 'in_court') {
      setCourtStatusMessage(null);
    }
  };

  const handleBallPointerDown = () => {
    if (!pendingSetterReleaseTeamSide || !liveMatch) {
      return;
    }

    const latestTouch = liveMatch.currentRallyTouches.at(-1);
    if (!latestTouch || latestTouch.teamSide !== pendingSetterReleaseTeamSide) {
      setPendingSetterReleaseTeamSide(null);
      return;
    }

    setTeamTacticalPhases((currentPhases) => getNextTeamTacticalPhasesAfterTouch({
      phases: currentPhases,
      touch: latestTouch,
      previousTouch: liveMatch.currentRallyTouches.at(-2) ?? null,
      servingTeam: liveMatch.servingTeam,
    }));
    setPendingSetterReleaseTeamSide(null);
  };

  const handleTouchesCommitted = (touches: PendingTouch[]) => {
    playConfirmFeedback('touch', useAppStore.getState().feedbackSound);
    const eventCountBefore = useScoutingStore.getState().liveMatch?.eventLog.length ?? 0;
    confirmActionTouches(touches);

    const skills = touches.map((t) => t.skill).join('+');
    pushUndoEntry({
      eventCountBefore,
      label: skills,
      actionType: touches.length > 1 ? 'touch_group' : 'touch',
    });
  };

  const persistPointNotes = (nextNotes: PointNote[]) => {
    const latestProject = useAppStore.getState().activeProject;
    if (!latestProject) return;
    const currentVideoAnalysis = latestProject.videoAnalysis ?? createDefaultMatchVideoAnalysis();
    const updatedProject = {
      ...latestProject,
      videoAnalysis: {
        ...currentVideoAnalysis,
        notes: nextNotes,
        updatedAt: Date.now(),
      },
      updatedAt: Date.now(),
    };
    setActiveProject(updatedProject);
    void matchRepository.update(updatedProject).then(setActiveProject).catch(() => {});
  };

  const openCreatePointNote = () => {
    const rawTime = liveVideoPanelRef.current?.getCurrentTime();
    const videoTimeSeconds = typeof rawTime === 'number' && Number.isFinite(rawTime) ? rawTime : undefined;
    setPointNoteModal({ mode: 'create', videoTimeSeconds });
  };

  const handleSavePointNote = ({ tags, customKeywords, text }: { tags: PointNoteTag[]; customKeywords: string[]; text: string }) => {
    const latestProject = useAppStore.getState().activeProject;
    const existingNotes = latestProject?.videoAnalysis?.notes ?? [];
    if (pointNoteModal?.mode === 'edit') {
      persistPointNotes(updatePointNote(existingNotes, pointNoteModal.note.id, { tags, customKeywords, text }));
      setPointNoteModal(null);
      return;
    }
    const latestLive = useScoutingStore.getState().liveMatch;
    const lastTouchId = latestLive?.currentRallyTouches.at(-1)?.id;
    const newNote = createPointNote({
      touchId: lastTouchId,
      setNumber: latestLive?.currentSetNumber ?? 1,
      rallyNumber: latestLive?.currentRallyNumber ?? 1,
      homeScore: latestLive?.homeScore ?? 0,
      awayScore: latestLive?.awayScore ?? 0,
      videoTimeSeconds: pointNoteModal?.mode === 'create' ? pointNoteModal.videoTimeSeconds : undefined,
      tags,
      customKeywords,
      text,
    });
    persistPointNotes(addPointNote(existingNotes, newNote));
    setPointNoteModal(null);
  };

  const handleDeletePointNote = (noteId: string) => {
    const latestProject = useAppStore.getState().activeProject;
    const existingNotes = latestProject?.videoAnalysis?.notes ?? [];
    persistPointNotes(deletePointNote(existingNotes, noteId));
    setPointNoteModal(null);
  };

  const replaceLiveMatchEventsAndClearUndo = (events: MatchEvent[]) => {
    const ok = replaceLiveMatchEvents(events);
    if (ok) useScoutingStore.getState().clearUndoStack();
    return ok;
  };

  const handleReplaceRallyTouches = (touches: PendingTouch[]) => {
    const eventCountBefore = useScoutingStore.getState().liveMatch?.eventLog.length ?? 0;
    clearCurrentRallyTouches();
    confirmActionTouches(touches);
    const skills = touches.map((t) => t.skill).join('+');
    pushUndoEntry({
      eventCountBefore,
      label: skills,
      actionType: touches.length > 1 ? 'touch_group' : 'touch',
    });
  };

  const handleFinalizeRallyFromForm = (teamSide: TeamSide, pendingTouches?: PendingTouch[]) => {
    if (pendingTouches && pendingTouches.length > 0) {
      clearCurrentRallyTouches();
      pendingTouches.forEach((touch) => handleTouchConfirm(touch));
    }
    finalizeRally(teamSide);
  };

  const handleManageActionTypeChange = (eventType: DeadBallEventType) => {
    setManageActionDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      return createManageActionDraft(eventType, currentDraft.teamSide);
    });
  };

  const handleManageActionTeamChange = (teamSide: TeamSide) => {
    setManageActionDraft((currentDraft) => (
      currentDraft
        ? createManageActionDraft(currentDraft.eventType, teamSide)
        : currentDraft
    ));
  };

  const handleVideoCheckTeamChange = (teamSide: TeamSide) => {
    setManageActionDraft((currentDraft) => {
      if (!currentDraft?.videoCheckTouch) {
        return currentDraft;
      }

      const nextPlayers = getPlayersForTeamSide(teamSide);
      const nextPlayer = nextPlayers.find((player) => player.id === currentDraft.videoCheckTouch?.playerId) ?? nextPlayers[0];

      return {
        ...currentDraft,
        videoCheckTouch: {
          ...currentDraft.videoCheckTouch,
          teamSide,
          playerId: nextPlayer?.id,
        },
      };
    });
  };

  const handleVideoCheckPlayerChange = (playerId: string) => {
    setManageActionDraft((currentDraft) => (
      currentDraft?.videoCheckTouch
        ? {
            ...currentDraft,
            videoCheckTouch: {
              ...currentDraft.videoCheckTouch,
              playerId,
            },
          }
        : currentDraft
    ));
  };

  const handleVideoCheckEvaluationChange = (evaluation: SkillEvaluation) => {
    setManageActionDraft((currentDraft) => (
      currentDraft?.videoCheckTouch
        ? {
            ...currentDraft,
            videoCheckTouch: {
              ...currentDraft.videoCheckTouch,
              evaluation,
            },
          }
        : currentDraft
    ));
  };

  const handleSubstitutionPlayerOutChange = (playerOutId: string) => {
    setManageActionDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      const lineup = getLineupForTeamSide(currentDraft.teamSide);
      const rosterPlayers = getTeamRosterForTeamSide(currentDraft.teamSide);
      const playerInId = lineup
        ? getEligiblePlayersInForSubstitution({
            lineup,
            playerOutId,
            rosterPlayers,
          })[0]?.id ?? ''
        : '';

      return {
        ...currentDraft,
        substitutionPlayerOutId: playerOutId,
        substitutionPlayerInId: playerInId,
      };
    });
  };

  const handleSubstitutionPlayerInChange = (playerInId: string) => {
    setManageActionDraft((currentDraft) => (
      currentDraft
        ? {
            ...currentDraft,
            substitutionPlayerInId: playerInId,
          }
        : currentDraft
    ));
  };

  const handleLiberoProposalChange = (proposalIndex: number) => {
    setManageActionDraft((currentDraft) => {
      if (!currentDraft || !liveMatch) {
        return currentDraft;
      }

      return {
        ...currentDraft,
        liberoProposal: getManualLiberoReplacementProposals(liveMatch, currentDraft.teamSide)[proposalIndex] ?? null,
      };
    });
  };

  const applyLiberoProposal = (proposal: LiberoReplacementProposal) => {
    if (!liveMatch) {
      return;
    }

    const nextEventLog = [
      ...liveMatch.eventLog,
      buildLiberoReplacementMadeEvent(liveMatch, proposal),
    ];

    if (!replaceLiveMatchEvents(nextEventLog)) {
      return;
    }

    const updatedLiveMatch = useScoutingStore.getState().liveMatch;
    syncCourtStateFromLiveMatch();

    if (openAutomaticLiberoProposal(updatedLiveMatch)) {
      return;
    }

    showTransientCourtMessage(getAutomaticLiberoProposalMessage(proposal));
    closeManageAction();
  };

  const applyManageAction = () => {
    if (!liveMatch || !manageActionDraft) {
      return;
    }

    let nextEventLog: MatchEvent[] | null = null;

    switch (manageActionDraft.eventType) {
      case 'replay':
        nextEventLog = buildReplayCorrectionEventLog(liveMatch);
        if (nextEventLog) {
          nextEventLog = [...nextEventLog, buildReplayActionEvent(liveMatch, manageActionDraft.teamSide)];
        }
        break;
      case 'video_check':
        if (!activeConfig || !manageActionDraft.videoCheckContext || !manageActionDraft.videoCheckTouch) {
          return;
        }
        nextEventLog = buildVideoCheckCorrectionEventLog({
          liveMatch,
          config: activeConfig,
          updatedTouch: manageActionDraft.videoCheckTouch,
          touchIndex: manageActionDraft.videoCheckContext.touchIndex,
        });
        if (nextEventLog) {
          nextEventLog = [
            ...nextEventLog,
            buildVideoCheckCorrectionEvent(
              liveMatch,
              manageActionDraft.videoCheckTouch.id,
              manageActionDraft.videoCheckTouch.teamSide,
            ),
          ];
        }
        break;
      case 'rotation_fault':
        if (!activeConfig) {
          return;
        }
        nextEventLog = buildRotationFaultCorrectionEventLog({
          liveMatch,
          config: activeConfig,
          penalizedTeam: manageActionDraft.teamSide,
        });
        break;
      case 'red_card':
        if (!activeConfig) {
          return;
        }
        nextEventLog = buildRedCardCorrectionEventLog({
          liveMatch,
          config: activeConfig,
          penalizedTeam: manageActionDraft.teamSide,
        });
        break;
      case 'timeout':
        nextEventLog = [...liveMatch.eventLog, buildTimeoutCalledEvent(liveMatch, manageActionDraft.teamSide)];
        break;
      case 'substitution': {
        const lineup = getLineupForTeamSide(manageActionDraft.teamSide);
        const rosterPlayers = getTeamRosterForTeamSide(manageActionDraft.teamSide);
        if (!lineup || !manageActionDraft.substitutionPlayerOutId || !manageActionDraft.substitutionPlayerInId) {
          return;
        }

        const eligibility = getNormalSubstitutionEligibility({
          lineup,
          playerOutId: manageActionDraft.substitutionPlayerOutId,
          playerInId: manageActionDraft.substitutionPlayerInId,
          rosterPlayers,
        });
        if (!eligibility.isEligible) {
          return;
        }

        const reentryPair = lineup.personnelState.substitutionPairs.find((pair) => (
          pair.playerOutId === manageActionDraft.substitutionPlayerInId
          && pair.playerInId === manageActionDraft.substitutionPlayerOutId
          && !pair.hasReentered
        ));

        nextEventLog = [
          ...liveMatch.eventLog,
          buildSubstitutionMadeEvent({
            liveMatch,
            teamSide: manageActionDraft.teamSide,
            playerOutId: manageActionDraft.substitutionPlayerOutId,
            playerInId: manageActionDraft.substitutionPlayerInId,
            canReenterOnlyForPlayerId: reentryPair
              ? manageActionDraft.substitutionPlayerOutId
              : manageActionDraft.substitutionPlayerInId,
            hasReentered: Boolean(reentryPair),
          }),
        ];

        // If the setter goes out, mark that we need to ask for a new setter. The same when the setter
        // is a stand-in who came in during this break (setter-opposite double change) and the roster
        // does not say they are a setter: this change may be the one that brings the real setter.
        const setterGoingOut = lineup.setterPlayerId === manageActionDraft.substitutionPlayerOutId;
        const standInPending = !setterGoingOut
          && isStandInSetterThisBreak(liveMatch.eventLog, manageActionDraft.teamSide, lineup.setterPlayerId)
          && rosterPlayers.find((player) => player.id === lineup.setterPlayerId)?.role !== 'setter';
        if (setterGoingOut || standInPending) {
          if (!replaceLiveMatchEvents(nextEventLog)) return;
          const updatedMatch = useScoutingStore.getState().liveMatch;
          const updatedLineup = updatedMatch
            ? (manageActionDraft.teamSide === 'home' ? updatedMatch.homeActiveLineup : updatedMatch.awayActiveLineup)
            : null;
          const newCandidates = (updatedLineup?.slots ?? [])
            .filter((s) => !s.isLibero)
            .map((s) => s.playerId);
          syncCourtStateFromLiveMatch();
          closeManageAction();
          setPendingSetterAssignment({ teamSide: manageActionDraft.teamSide, candidateIds: newCandidates });
          // The replay already worked out the likeliest setter (the incoming setter, or the one on
          // court); suggest that one rather than whoever is in the first slot.
          const suggestedSetterId = standInPending
            ? manageActionDraft.substitutionPlayerInId
            : updatedLineup?.setterPlayerId;
          setSelectedNewSetterId(
            suggestedSetterId && newCandidates.includes(suggestedSetterId) ? suggestedSetterId : (newCandidates[0] ?? ''),
          );
          return;
        }
        break;
      }
      case 'libero_replacement':
        if (!manageActionDraft.liberoProposal) {
          return;
        }

        nextEventLog = [
          ...liveMatch.eventLog,
          buildLiberoReplacementMadeEvent(liveMatch, manageActionDraft.liberoProposal),
        ];
        break;
      case 'sanction':
        nextEventLog = [...liveMatch.eventLog, buildSanctionRecordedEvent(liveMatch, manageActionDraft.teamSide)];
        break;
      case 'other':
        nextEventLog = [...liveMatch.eventLog, buildOtherDeadBallEvent(liveMatch, manageActionDraft.teamSide)];
        break;
      case 'point_added':
      case 'point_removed':
      case 'rotation_forward':
      case 'rotation_backward':
      case 'serve_assigned':
        if (!activeConfig) {
          return;
        }
        nextEventLog = buildManualCorrectionEventLog({
          liveMatch,
          config: activeConfig,
          teamSide: manageActionDraft.teamSide,
          correction: manageActionDraft.eventType,
        });
        break;
      default:
        nextEventLog = null;
    }

    const eventCountBefore = liveMatch.eventLog.length;
    if (!nextEventLog || !replaceLiveMatchEvents(nextEventLog)) {
      if (isManualCorrectionType(manageActionDraft.eventType)) {
        showTransientCourtMessage(t('manualCorrectionNotApplicable'));
      }
      return;
    }

    if (isManualCorrectionType(manageActionDraft.eventType)) {
      // Ctrl+Z / the undo button reverts the correction as one step.
      pushUndoEntry({
        eventCountBefore,
        label: manageActionDraft.eventType,
        actionType: 'manual_correction',
      });
    }

    const updatedLiveMatch = useScoutingStore.getState().liveMatch;
    syncCourtStateFromLiveMatch();

    if (openAutomaticLiberoProposal(updatedLiveMatch)) {
      return;
    }

    showTransientCourtMessage(
      manageActionDraft.eventType === 'libero_replacement' && manageActionDraft.liberoProposal
        ? getAutomaticLiberoProposalMessage(manageActionDraft.liberoProposal)
        : t('manageAction'),
    );
    closeManageAction();
  };

  const confirmSetterAssignment = () => {
    if (!pendingSetterAssignment || !selectedNewSetterId || !liveMatch) return;
    const nextEventLog = [
      ...liveMatch.eventLog,
      buildSetterAssignedEvent(liveMatch, pendingSetterAssignment.teamSide, selectedNewSetterId),
    ];
    if (replaceLiveMatchEvents(nextEventLog)) {
      syncCourtStateFromLiveMatch();
    }
    setPendingSetterAssignment(null);
    setSelectedNewSetterId('');
  };

  const handleFinishMatch = async () => {
    await persistProject(createClosedMatchProject(activeProject));
  };

  const handleOpenAnalysis = async () => {
    await persistProject(createAnalysisReadyProject(activeProject));
    navigate('/analysis');
  };

  const latestCompletedSetDisplay = useMemo(
    () => (stageSummary.latestCompletedSet ? getCompletedSetDisplaySummary(stageSummary.latestCompletedSet) : null),
    [stageSummary.latestCompletedSet],
  );

  const completedSetSummaries = useMemo(
    () => getCompletedSetsDisplaySummary(completedSets),
    [completedSets],
  );

  const nextSetPrefillConfig = useMemo(
    () => getNextSetPrefillConfig({
      eventLog: latestEventLog,
      nextSetNumber: stageSummary.nextSetNumber,
    }),
    [latestEventLog, stageSummary.nextSetNumber],
  );

  // Match and set statistics are only shown at set end and match end: skip
  // rebuilding them from the whole event log on every scouted touch.
  const showsSetEndStats = activeStage === 'set_end';
  const showsMatchStats = activeStage === 'set_end' || activeStage === 'match_end';

  const latestCompletedSetStats = useMemo(
    () => (showsSetEndStats && stageSummary.latestCompletedSet
      ? buildSetMatchStats({
          homeTeam,
          awayTeam,
          eventLog: latestEventLog,
          completedSets,
        }, stageSummary.latestCompletedSet.setNumber)
      : null),
    [awayTeam, completedSets, homeTeam, latestEventLog, showsSetEndStats, stageSummary.latestCompletedSet],
  );

  const matchStats = useMemo(
    () => (showsMatchStats
      ? buildMatchStats({
          homeTeam,
          awayTeam,
          eventLog: latestEventLog,
          completedSets,
        })
      : null),
    [awayTeam, completedSets, homeTeam, latestEventLog, showsMatchStats],
  );

  const matchResult = useMemo(
    () => formatMatchResult({
      completedSets,
      config: scoutingConfig,
      goldenSetScore: activeProject.scoutingSession?.goldenSetScore,
      isComplete: stageSummary.isMatchComplete
        || activeProject.phase === 'closed'
        || activeProject.phase === 'analysis'
        || activeProject.scoutingSession?.matchStatus === 'completed',
      goldenSetLabel: t('goldenSet').toLowerCase(),
    }),
    [activeProject.phase, activeProject.scoutingSession?.goldenSetScore, activeProject.scoutingSession?.matchStatus, completedSets, scoutingConfig, stageSummary.isMatchComplete, t],
  );

  const matchWinnerName = useMemo(() => {
    if (matchResult.winnerSide === 'home') {
      return homeTeamName;
    }

    if (matchResult.winnerSide === 'away') {
      return awayTeamName;
    }

    if (stageSummary.setsWon.home === stageSummary.setsWon.away) {
      return t('notSpecified');
    }

    return stageSummary.setsWon.home > stageSummary.setsWon.away ? homeTeamName : awayTeamName;
  }, [awayTeamName, homeTeamName, matchResult.winnerSide, stageSummary.setsWon, t]);

  const correctionPlayerOptions = manageActionDraft?.videoCheckTouch
    ? getPlayersForTeamSide(manageActionDraft.videoCheckTouch.teamSide)
    : [];

  const correctionEvaluationOptions = manageActionDraft?.videoCheckTouch
    ? getEvaluationsForSkill(manageActionDraft.videoCheckTouch.skill)
    : [];
  const selectedManageActionLineup = manageActionDraft ? getLineupForTeamSide(manageActionDraft.teamSide) : null;
  const selectedManageActionRoster = manageActionDraft ? getTeamRosterForTeamSide(manageActionDraft.teamSide) : [];
  const substitutionPlayerOutOptions = selectedManageActionLineup?.slots.filter((slot) => (
    !slot.isLibero && !selectedManageActionRoster.find((player) => player.id === slot.playerId)?.isLibero
  )) ?? [];
  const substitutionPlayerInOptions = manageActionDraft && selectedManageActionLineup && manageActionDraft.substitutionPlayerOutId
    ? getEligiblePlayersInForSubstitution({
        lineup: selectedManageActionLineup,
        playerOutId: manageActionDraft.substitutionPlayerOutId,
        rosterPlayers: selectedManageActionRoster,
      })
    : [];
  const manualLiberoProposals = manageActionDraft?.eventType === 'libero_replacement' && liveMatch
    ? getManualLiberoReplacementProposals(liveMatch, manageActionDraft.teamSide)
    : [];
  const selectedLiberoProposalIndex = manageActionDraft?.liberoProposal
    ? manualLiberoProposals.findIndex((proposal) => (
        proposal.action === manageActionDraft.liberoProposal?.action
        && proposal.playerOutId === manageActionDraft.liberoProposal.playerOutId
        && proposal.playerInId === manageActionDraft.liberoProposal.playerInId
      ))
    : -1;
  const selectedTeamName = manageActionDraft?.teamSide === 'home' ? homeTeamName : awayTeamName;
  const opponentTeamName = manageActionDraft?.teamSide === 'home' ? awayTeamName : homeTeamName;
  const selectedActiveLiberoState = selectedManageActionLineup?.personnelState.activeLiberoState ?? null;
  const selectedSecondLiberoId = selectedManageActionLineup?.personnelState.secondLiberoPlayerId;
  const selectedSubstitutionEligibility = manageActionDraft && selectedManageActionLineup
    && manageActionDraft.substitutionPlayerOutId
    && manageActionDraft.substitutionPlayerInId
    ? getNormalSubstitutionEligibility({
        lineup: selectedManageActionLineup,
        playerOutId: manageActionDraft.substitutionPlayerOutId,
        playerInId: manageActionDraft.substitutionPlayerInId,
        rosterPlayers: selectedManageActionRoster,
      })
    : null;
  const canConfirmManageAction = manageActionDraft ? (() => {
    if (manageActionDraft.eventType === 'substitution') {
      return Boolean(selectedSubstitutionEligibility?.isEligible);
    }

    if (manageActionDraft.eventType === 'libero_replacement') {
      return Boolean(manageActionDraft.liberoProposal);
    }

    if (manageActionDraft.eventType === 'video_check') {
      return Boolean(manageActionDraft.videoCheckContext && manageActionDraft.videoCheckTouch);
    }

    if (isManualCorrectionType(manageActionDraft.eventType)) {
      return Boolean(liveMatch && !liveMatch.isRallyActive);
    }

    return true;
  })() : false;
  const renderDeadBallEventsPanel = shouldRenderDeadBallEventsPanel({
    activeStage,
    hasManageActionPanel: Boolean(manageActionDraft),
  });
  const renderCourtFirstLiveRally = shouldRenderCourtFirstLiveRally({
    activeStage,
    hasManageActionPanel: Boolean(manageActionDraft),
  });
  const undoLastPointAvailability = getUndoLastPointAvailability(liveMatch);
  const groupedUndoAvailability = getGroupedUndoAvailability(liveMatch, undoStack);
  const rallyCorrectionAvailability = getCurrentRallyCorrectionAvailability(liveMatch);
  const canRemoveLastTouch = rallyCorrectionAvailability.removeLastTouch.canApply;
  const latestUndoablePointTeamSide = undoLastPointAvailability.canApply
    ? getLatestPointTeamSide(liveMatch?.eventLog)
    : null;
  const canUndoAwayPoint = latestUndoablePointTeamSide === 'away';
  const canUndoHomePoint = latestUndoablePointTeamSide === 'home';
  const scoreFeedbackSideClassName = scoreFeedback ? `is-scoring-${scoreFeedback.teamSide}` : '';
  const scoreFeedbackPositionClassName = scoreFeedback
    ? `is-scoring-${scoreFeedback.teamSide === leftTeamSide ? 'left' : 'right'}`
    : '';
  const scoreFeedbackTeamName = scoreFeedback?.teamSide === 'home' ? homeTeamName : awayTeamName;
  const canEditLiveScore = activeStage === 'live_rally' && Boolean(liveMatch?.isSetStarted) && !isAceVictimSelection;

  const leftTeamCurrentSetStats = leftTeamSide === 'home' ? homeTeamCurrentSetStats : awayTeamCurrentSetStats;
  const rightTeamCurrentSetStats = rightTeamSide === 'home' ? homeTeamCurrentSetStats : awayTeamCurrentSetStats;
  const leftTeamLineup = leftTeamSide === 'home' ? liveMatch?.homeActiveLineup : liveMatch?.awayActiveLineup;
  const rightTeamLineup = rightTeamSide === 'home' ? liveMatch?.homeActiveLineup : liveMatch?.awayActiveLineup;
  const canUndoLeftPoint = leftTeamSide === 'home' ? canUndoHomePoint : canUndoAwayPoint;
  const canUndoRightPoint = rightTeamSide === 'home' ? canUndoHomePoint : canUndoAwayPoint;

  // Phone header (from courtendvb's SyncScout Live fork): score first, then
  // the per-team buttons, then set/rally and the input level. Upright it
  // stacks in rows; in landscape it is a single row.
  const renderPhoneTeamControls = (side: 'left' | 'right') => {
    const teamSide = side === 'left' ? leftTeamSide : rightTeamSide;
    const teamName = side === 'left' ? leftTeamName : rightTeamName;
    const stats = side === 'left' ? leftTeamCurrentSetStats : rightTeamCurrentSetStats;
    const controls = [
      <button
        key="point"
        type="button"
        className="phone-live-header__button phone-live-header__button--point"
        onClick={() => handleManualPoint(teamSide)}
        disabled={!canEditLiveScore}
        aria-label={t('addPointToTeam', { team: teamName })}
      >
        +1
      </button>,
      isOperationalStage ? (
        <button
          key="timeout"
          type="button"
          className="phone-live-header__button"
          onClick={() => openManageActionFor('timeout', teamSide)}
          disabled={!canEditLiveScore}
          aria-label={t('recordTimeoutFor', { team: teamName })}
        >
          {t('timeoutShort')} {stats.timeouts}
        </button>
      ) : null,
      isOperationalStage ? (
        <button
          key="substitution"
          type="button"
          className="phone-live-header__button"
          onClick={() => openManageActionFor('substitution', teamSide)}
          disabled={!canEditLiveScore}
          aria-label={t('recordSubstitutionFor', { team: teamName })}
        >
          {t('substitutionShort')} {stats.substitutions}
        </button>
      ) : null,
    ];
    return (
      <div className={`phone-live-header__team-controls phone-live-header__team-controls--${side}`}>
        {side === 'left' ? controls : [...controls].reverse()}
      </div>
    );
  };

  const renderPhoneHeader = () => {
    const servingSide = liveMatch?.servingTeam === leftTeamSide ? 'left' : liveMatch?.servingTeam === rightTeamSide ? 'right' : null;
    return (
      <section className="scouting-screen__header scouting-screen__phone-header phone-live-header">
        <div
          className="phone-live-header__score"
          aria-label={`${homeTeamName} ${stageSummary.setsWon.home} ${t('sets')} / ${currentHomeScore} ${t('points')}; ${awayTeamName} ${stageSummary.setsWon.away} ${t('sets')} / ${currentAwayScore} ${t('points')}`}
        >
          <strong className="phone-live-header__team-name phone-live-header__team-name--left">
            {servingSide === 'left' ? <span className="phone-live-header__serve" title={t('servingTeam')} /> : null}
            {leftTeamName}
          </strong>
          <span className={`phone-live-header__points scouting-screen__score-number--${leftTeamSide}`} key={`left-${leftPointsScore}`}>{leftPointsScore}</span>
          <span className="phone-live-header__sets">
            <small>{t('sets')}</small>
            {leftSetsWon}-{rightSetsWon}
          </span>
          <span className={`phone-live-header__points scouting-screen__score-number--${rightTeamSide}`} key={`right-${rightPointsScore}`}>{rightPointsScore}</span>
          <strong className="phone-live-header__team-name phone-live-header__team-name--right">
            {rightTeamName}
            {servingSide === 'right' ? <span className="phone-live-header__serve" title={t('servingTeam')} /> : null}
          </strong>
        </div>
        {renderPhoneTeamControls('left')}
        <div className="phone-live-header__center">
          <button
            type="button"
            className="phone-live-header__button"
            onClick={openManageAction}
            disabled={!canEditLiveScore}
            aria-label={t('manageAction')}
            title={t('manageAction')}
          >
            {t('manageActionShort')}
          </button>
          {isTabletPortrait && activeStage === 'live_rally' && inputMode !== 'tag' && (
            <div className="tablet-live-panels" role="group" aria-label={t('analysis')}>
              <button type="button" className="phone-live-header__button" aria-expanded={!codeListCollapsed}
                onClick={() => {
                  setCodeListCollapsed((value) => !value);
                  setOpponentAttackCollapsed(true);
                  setCodeInputCollapsed(true);
                }}>
                {t('codeList')}
              </button>
              {attackData && (
                <button type="button" className="phone-live-header__button" aria-expanded={!opponentAttackCollapsed}
                  onClick={() => {
                    setOpponentAttackCollapsed((value) => !value);
                    setCodeListCollapsed(true);
                    setCodeInputCollapsed(true);
                  }}>
                  {t('attackDirectionsPanelShort')}
                </button>
              )}
              {inputLevel === 'detailed' && (
                <button type="button" className="phone-live-header__button" aria-expanded={!codeInputCollapsed}
                  onClick={() => {
                    setCodeInputCollapsed((value) => !value);
                    setCodeListCollapsed(true);
                    setOpponentAttackCollapsed(true);
                  }}>
                  {t('expertModeCodeInput')}
                </button>
              )}
            </div>
          )}
        </div>
        {renderPhoneTeamControls('right')}
        <div className="phone-live-header__status">
          <span className="phone-live-header__meta">
            {t('phoneSetRally', { set: currentSetLabel, rally: currentRallyLabel })}
          </span>
          {activeStage === 'live_rally' ? (
            <div className="scouting-screen__input-mode" role="group" aria-label={t('inputModeToggle')}>
              {([
                ['tag', 'inputModeTag', 'inputModeTagHint'],
                ['court', 'inputModeCourt', 'inputModeCourtHint'],
                ['detailed', 'inputModeDetailed', 'inputModeDetailedHint'],
              ] as const).filter(([level]) => !(isPhone && level === 'detailed')).map(([level, labelKey, hintKey]) => (
                <button
                  key={level}
                  type="button"
                  className={`scouting-screen__input-mode-button${inputLevel === level ? ' is-active' : ''}`}
                  aria-pressed={inputLevel === level}
                  title={t(hintKey)}
                  onClick={() => selectInputLevel(level)}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
          ) : null}
          {activeStage === 'live_rally' ? (
            <>
              {showSwapSides ? (
                <button
                  type="button"
                  className="phone-live-header__button"
                  onClick={() => {
                    if (liveMatch) {
                      toggleDisplaySideSwapped(liveMatch.activeProjectId, liveMatch.currentSetNumber);
                    }
                  }}
                  aria-label={t('swapLiveCourtSides')}
                  title={t('swapLiveCourtSides')}
                >
                  <span aria-hidden="true">⇄</span>
                </button>
              ) : null}
              <button
                type="button"
                className="phone-live-header__button live-exit-button"
                onClick={() => setShowExitDialog(true)}
                title={t('liveExitTitle')}
              >
                ⏏ {t('liveExit')}
              </button>
            </>
          ) : null}
        </div>
      </section>
    );
  };

  const scoutingScreenClassName = [
    'scouting-screen',
    usesFixedShell ? 'scouting-screen--fixed' : 'scouting-screen--flow',
    isOperationalStage ? 'scouting-screen--operational' : '',
    simpleInput ? 'scouting-screen--simple-input' : '',
    isPhone ? 'scouting-screen--phone' : '',
    isTabletPortrait ? 'scouting-screen--tablet-portrait' : '',
    isSmartphonePortrait ? 'scouting-screen--phone-portrait' : '',
  ].filter(Boolean).join(' ');

  const isVerticalCourtLiveRally = courtOrientation === 'vertical' && activeStage === 'live_rally';
  // Tags button pad takes the place of the court.
  const isTagInputLiveRally = inputMode === 'tag' && activeStage === 'live_rally';
  const useVerticalSidebar = isVerticalCourtLiveRally && !isTagInputLiveRally && hasVideoSidebarSpace;
  const isVideoDocked = useVerticalSidebar || (isTagInputLiveRally && !videoPanelCollapsed && hasVideoSidebarSpace);
  const videoHiddenReason: VideoHiddenReason | null = resolveVideoHiddenReason({
    isLiveRally: activeStage === 'live_rally',
    isSmartphoneLandscape,
    isSmartphonePortrait,
    isTagInputLiveRally,
    hasVideoSidebarSpace,
  });
  const showVideoHiddenNotice = videoHiddenReason !== null && !videoNotices.isDismissed(videoHiddenReason);
  const dismissVideoHiddenNotice = () => {
    if (videoHiddenReason) videoNotices.dismiss(videoHiddenReason);
  };
  // The left-column header trades width for extra court height. It only pays
  // off on mid-size screens: a desktop wide enough for the video sidebar uses
  // that width for the video, and a phone in landscape has no width to trade.
  // Phones and upright tablets keep their compact header on top.
  const isVerticalCourtHeaderColumn = isVerticalCourtLiveRally && !hasVideoSidebarSpace && !isPhone && !isTabletPortrait;

  const scoutingContainerClassName = [
    'scouting-screen__container',
    usesFixedShell ? 'scouting-screen__container--fixed' : 'scouting-screen__container--flow',
    isVerticalCourtHeaderColumn ? 'scouting-screen__container--vertical-court' : '',
  ].filter(Boolean).join(' ');

  const scoutingHeaderClassName = [
    'scouting-screen__header',
    usesFixedShell ? 'scouting-screen__header--compact' : '',
    isOperationalStage ? 'scouting-screen__header--operational' : '',
    isVerticalCourtHeaderColumn ? 'scouting-screen__header--vertical-court' : '',
  ].filter(Boolean).join(' ');

  const scoutingMatchbarClassName = [
    'scouting-screen__header-main',
    'scouting-screen__matchbar',
    isVerticalCourtLiveRally ? 'scouting-screen__matchbar--vertical' : '',
    scoreFeedbackSideClassName,
    scoreFeedbackPositionClassName,
  ].filter(Boolean).join(' ');

  const stageShellClassName = [
    'scouting-screen__stage-shell',
    activeStageLayoutPolicy.shellMode === 'flow' ? 'scouting-screen__stage-shell--flow' : '',
    isOperationalStage ? 'scouting-screen__stage-shell--operational' : '',
  ].filter(Boolean).join(' ');

  const manageActionPanel = manageActionDraft ? (
    <div className="scouting-screen__manage-action-stage">
      <div className="scouting-screen__correction-dialog scouting-screen__manage-action-dialog" role="dialog" aria-label={t('endOfActionEvents')}>
        <div className="scouting-screen__correction-header">
          <strong>{t('endOfActionEvents')}</strong>
          <span className="scouting-screen__correction-action">{t('manageAction')}</span>
        </div>

        {primaryAutomaticLiberoProposal ? (
          <section className="scouting-screen__manage-action-proposal" aria-label={t('proposedAutomaticAction')}>
            <span>{t('proposedAutomaticAction')}</span>
            <strong>
              {primaryAutomaticLiberoProposal.reason === 'front_row_exit'
                ? getLiberoFrontRowMessage(primaryAutomaticLiberoProposal)
                : primaryAutomaticLiberoProposal.reason === 'service_exit'
                  ? t('liberoIllegalServe')
                  : getLiberoEntryProposalMessage(primaryAutomaticLiberoProposal)}
            </strong>
            <p>{getLiberoProposalLabel(primaryAutomaticLiberoProposal)}</p>
            <button
              type="button"
              className="btn-primary btn-small"
              onClick={() => applyLiberoProposal(primaryAutomaticLiberoProposal)}
            >
              {getLiberoConfirmLabel(primaryAutomaticLiberoProposal)}
            </button>
          </section>
        ) : null}

        {correctableSetStart ? (
          <section className="scouting-screen__manage-action-proposal" aria-label={t('correctStartingLineup')}>
            <span>{t('correctStartingLineupHint')}</span>
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => {
                setManageActionDraft(null);
                setIsCorrectingSetStart(true);
              }}
            >
              {t('correctStartingLineup')}
            </button>
          </section>
        ) : null}

        <div className="scouting-screen__correction-grid scouting-screen__manage-action-top-grid">
          <label className="scouting-screen__correction-field">
            <span>{t('selectTeam')}</span>
            <select
              value={manageActionDraft.teamSide}
              onChange={(event) => handleManageActionTeamChange(event.target.value as TeamSide)}
            >
              <option value="away">{awayTeamName}</option>
              <option value="home">{homeTeamName}</option>
            </select>
          </label>

          <label className="scouting-screen__correction-field">
            <span>{t('teamEvent')}</span>
            <select
              value={manageActionDraft.eventType}
              onChange={(event) => handleManageActionTypeChange(event.target.value as DeadBallEventType)}
            >
              <optgroup label={t('pointCorrection')}>
                <option value="replay">{t('replayAction')}</option>
                <option value="video_check">{t('videoCheck')}</option>
                <option value="rotation_fault">{t('correctionRotationFault')}</option>
                <option value="red_card">{t('redCard')}</option>
              </optgroup>
              <optgroup label={t('manualCorrections')}>
                {MANUAL_CORRECTION_TYPES.map((eventType) => (
                  <option key={eventType} value={eventType}>{getManageActionEventLabel(eventType)}</option>
                ))}
              </optgroup>
              <optgroup label={t('teamEvent')}>
                <option value="timeout">{t('timeout')}</option>
                <option value="substitution">{t('substitution')}</option>
                <option value="libero_replacement">{t('liberoReplacement')}</option>
                <option value="sanction">{t('reminderWarningSanction')}</option>
                <option value="other">{t('other')}</option>
              </optgroup>
            </select>
          </label>
        </div>

        <div className="scouting-screen__manage-action-options" aria-label={t('pointCorrection')}>
          {(['replay', 'video_check', 'rotation_fault', 'red_card'] as DeadBallEventType[]).map((eventType) => (
            <button
              key={eventType}
              type="button"
              className={`scouting-screen__manage-action-option ${manageActionDraft.eventType === eventType ? 'is-active' : ''}`}
              onClick={() => handleManageActionTypeChange(eventType)}
            >
              {getManageActionEventLabel(eventType)}
            </button>
          ))}
        </div>

        <div className="scouting-screen__manage-action-options" aria-label={t('manualCorrections')}>
          {MANUAL_CORRECTION_TYPES.map((eventType) => (
            <button
              key={eventType}
              type="button"
              className={`scouting-screen__manage-action-option ${manageActionDraft.eventType === eventType ? 'is-active' : ''}`}
              onClick={() => handleManageActionTypeChange(eventType)}
              disabled={Boolean(liveMatch?.isRallyActive)}
              title={liveMatch?.isRallyActive ? t('manualCorrectionBetweenRallies') : undefined}
            >
              {getManageActionEventLabel(eventType)}
            </button>
          ))}
        </div>

        <div className="scouting-screen__manage-action-options" aria-label={t('teamEvent')}>
          {(['timeout', 'substitution', 'libero_replacement', 'sanction', 'other'] as DeadBallEventType[]).map((eventType) => (
            <button
              key={eventType}
              type="button"
              className={`scouting-screen__manage-action-option ${manageActionDraft.eventType === eventType ? 'is-active' : ''}`}
              onClick={() => handleManageActionTypeChange(eventType)}
            >
              {getManageActionEventLabel(eventType)}
            </button>
          ))}
        </div>

        {manageActionDraft.eventType === 'video_check' && manageActionDraft.videoCheckTouch ? (
          <div className="scouting-screen__correction-grid">
            <label className="scouting-screen__correction-field">
              <span>{t('team')}</span>
              <select
                value={manageActionDraft.videoCheckTouch.teamSide}
                onChange={(event) => handleVideoCheckTeamChange(event.target.value as TeamSide)}
              >
                <option value="away">{awayTeamName}</option>
                <option value="home">{homeTeamName}</option>
              </select>
            </label>

            <label className="scouting-screen__correction-field">
              <span>{t('jerseyNumber')}</span>
              <select
                value={manageActionDraft.videoCheckTouch.playerId}
                onChange={(event) => handleVideoCheckPlayerChange(event.target.value)}
              >
                {correctionPlayerOptions.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.jerseyNumber}
                  </option>
                ))}
              </select>
            </label>

            <label className="scouting-screen__correction-field">
              <span>{t('evaluation')}</span>
              <select
                value={manageActionDraft.videoCheckTouch.evaluation}
                onChange={(event) => handleVideoCheckEvaluationChange(event.target.value as SkillEvaluation)}
              >
                {correctionEvaluationOptions.map((evaluation) => (
                  <option key={evaluation} value={evaluation}>
                    {evaluation}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {manageActionDraft.eventType === 'substitution' ? (
          <div className="scouting-screen__correction-grid">
            <label className="scouting-screen__correction-field">
              <span>{t('playerOut')}</span>
              <select
                value={manageActionDraft.substitutionPlayerOutId}
                onChange={(event) => handleSubstitutionPlayerOutChange(event.target.value)}
              >
                {substitutionPlayerOutOptions.map((slot) => (
                  <option key={slot.playerId} value={slot.playerId}>
                    {getPlayerLabel(manageActionDraft.teamSide, slot.playerId)}
                  </option>
                ))}
              </select>
            </label>

            <label className="scouting-screen__correction-field">
              <span>{t('playerIn')}</span>
              <select
                value={manageActionDraft.substitutionPlayerInId}
                onChange={(event) => handleSubstitutionPlayerInChange(event.target.value)}
              >
                {substitutionPlayerInOptions.length > 0 ? substitutionPlayerInOptions.map((player) => (
                  <option key={player.id} value={player.id}>
                    {getPlayerLabel(manageActionDraft.teamSide, player.id)}
                    {selectedManageActionLineup && getNormalSubstitutionEligibility({
                      lineup: selectedManageActionLineup,
                      playerOutId: manageActionDraft.substitutionPlayerOutId,
                      playerInId: player.id,
                      rosterPlayers: selectedManageActionRoster,
                    }).warning ? ' ⚠' : ''}
                  </option>
                )) : (
                  <option value="">{t('noEligibleSubstitutions')}</option>
                )}
              </select>
            </label>

            <QuickJerseyEntry compact onAdd={handleQuickAddSubstitute} />
            {selectedSubstitutionEligibility?.warning === 'reentry_rule' ? (
              <p className="scouting-screen__manage-action-warning" role="status">
                ⚠ {t('substitutionReentryRuleWarning')}
              </p>
            ) : null}
          </div>
        ) : null}

        {manageActionDraft.eventType === 'libero_replacement' ? (
          <div className="scouting-screen__manage-action-libero">
            <div className="scouting-screen__manage-action-status">
              <span>{t('liberoOnCourt')}: {selectedActiveLiberoState ? getPlayerLabel(manageActionDraft.teamSide, selectedActiveLiberoState.liberoPlayerId) : t('notSpecified')}</span>
              <span>{t('replacedPlayer')}: {selectedActiveLiberoState ? getPlayerLabel(manageActionDraft.teamSide, selectedActiveLiberoState.replacedPlayerId) : t('notSpecified')}</span>
              <span>{t('secondLibero')}: {selectedSecondLiberoId ? getPlayerLabel(manageActionDraft.teamSide, selectedSecondLiberoId) : t('notSpecified')}</span>
            </div>

            <label className="scouting-screen__correction-field">
              <span>{t('liberoReplacement')}</span>
              <select
                value={selectedLiberoProposalIndex >= 0 ? selectedLiberoProposalIndex : ''}
                onChange={(event) => handleLiberoProposalChange(Number(event.target.value))}
              >
                {manualLiberoProposals.length > 0 ? manualLiberoProposals.map((proposal, index) => (
                  <option key={`${proposal.action}-${proposal.playerOutId}-${proposal.playerInId}`} value={index}>
                    {getLiberoProposalLabel(proposal)}
                  </option>
                )) : (
                  <option value="">{t('noLiberoReplacementAvailable')}</option>
                )}
              </select>
            </label>
          </div>
        ) : null}

        <div className="scouting-screen__manage-action-confirmation">
          <span>{t('proposedAutomaticAction')}</span>
          <strong>
            {manageActionDraft.eventType === 'substitution'
              ? `${getPlayerLabel(manageActionDraft.teamSide, manageActionDraft.substitutionPlayerOutId)} ${t('playerOut').toLowerCase()}, ${getPlayerLabel(manageActionDraft.teamSide, manageActionDraft.substitutionPlayerInId)} ${t('playerIn').toLowerCase()}`
              : manageActionDraft.eventType === 'libero_replacement'
                ? getLiberoProposalLabel(manageActionDraft.liberoProposal)
                : manageActionDraft.eventType === 'red_card'
                  ? `${t('redCard')}: ${selectedTeamName}; ${t('pointTo', { team: opponentTeamName })}`
                  : manageActionDraft.eventType === 'timeout'
                    ? `${t('timeout')}: ${selectedTeamName}`
                    : isManualCorrectionType(manageActionDraft.eventType)
                      ? `${getManageActionEventLabel(manageActionDraft.eventType)}: ${selectedTeamName}`
                      : getManageActionEventLabel(manageActionDraft.eventType)}
          </strong>
        </div>

        <div className="scouting-screen__correction-actions">
          <button type="button" className="btn-secondary btn-small" onClick={closeManageAction}>
            {t('cancelEvent')}
          </button>
          <button type="button" className="btn-primary btn-small" onClick={applyManageAction} disabled={!canConfirmManageAction}>
            {manageActionDraft.eventType === 'substitution'
              ? t('confirmSubstitution')
              : manageActionDraft.eventType === 'libero_replacement'
                ? getLiberoConfirmLabel(manageActionDraft.liberoProposal)
                : t('confirmEvent')}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // Vertical court: the manual code-entry panel moves from below the court
  // (competing for its height) to a right-side collapsible rail alongside
  // the opponent-attack panel (competing for width instead, which the court
  // can spare far more of than height at a 9:18 aspect ratio) - see
  // renderCourtFirstLiveRally below for where it's actually mounted.
  const codeInputPanel = (
    <div className="live-action-area" onPointerDownCapture={markActionStart} onKeyDownCapture={markActionStart}>
    <CodeInputPanel
      homeLineup={liveMatch?.homeActiveLineup ?? null}
      awayLineup={liveMatch?.awayActiveLineup ?? null}
      homePlayers={homeTeam.players}
      awayPlayers={awayTeam.players}
      currentRallyTouches={liveMatch?.currentRallyTouches ?? []}
      lastTouch={liveMatch?.currentRallyTouches.at(-1) ?? null}
      servingTeam={liveMatch?.servingTeam ?? null}
      onTouchesCommitted={handleTouchesCommitted}
      onReplaceRallyTouches={handleReplaceRallyTouches}
      onFinalizeRally={handleFinalizeRallyFromForm}
      onRequestCourtMessage={handleRequestCourtMessage}
      onPendingPointChange={handleCodeInputPendingChange}
      externalResetKey={codeInputResetKey}
      onUndo={handleGroupedUndo}
      onRemoveLastTouch={handleRemoveLastTouch}
      onOpenNote={openCreatePointNote}
      initialCode={expertInitialCode}
      onCodeLoaded={() => setExpertInitialCode(null)}
      matchId={activeProject.metadata.id}
      autoCode={courtAutoCode}
      leftTeamSide={leftTeamSide}
      rightTeamSide={rightTeamSide}
      leftTeamName={leftTeamName}
      rightTeamName={rightTeamName}
      isCollapsed={codeInputCollapsed}
      onToggleCollapsed={() => setCodeInputCollapsed((v) => !v)}
    />
    </div>
  );

  // Tags: where the latest serve or attack went, one optional tap after it
  // (pad of 9 zones on phones, court with subzones elsewhere). Written as
  // DataVolley zone codes on the touch, so exports and heatmaps use them.
  const tagTrackDirections = useAppStore((state) => state.tagTrackDirections);
  const [zoneSkippedTouchIds, setZoneSkippedTouchIds] = useState<ReadonlySet<string>>(() => new Set());
  // Phones (short side under 600 px) get the 9-zone pad, the rest the court with subzones.
  const zonePickerVariant: 'pad' | 'court' = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 600
    ? 'pad'
    : 'court';
  const latestZoneEvent = (() => {
    if (!liveMatch?.isSetStarted || inputMode !== 'tag' || !tagTrackDirections) return null;
    const log = latestEventLog;
    for (let index = log.length - 1; index >= 0; index -= 1) {
      const event = log[index];
      if (event.type === 'set_started') return null;
      const trackableSkill = event.type === 'touch_recorded' && (
        event.touch.skill === 'serve'
        || event.touch.skill === 'attack'
        || (tagRecordTeams !== 'both' && event.touch.skill === 'receive')
      );
      if (trackableSkill && event.touch.source !== 'inferred') {
        const touch = event.touch;
        if (touch.rallyNumber < liveMatch.currentRallyNumber - 1 || zoneSkippedTouchIds.has(touch.id)) return null;
        // One-team Tags: the other team's plays are placeholders, no zones asked.
        if (tagRecordTeams !== 'both' && touch.teamSide !== tagRecordTeams) return null;
        return { index, touch, skill: touch.skill as 'serve' | 'attack' | 'receive' };
      }
    }
    return null;
  })();
  const setLatestTouchZone = (field: 'startZoneCode' | 'endZoneCode', code: string) => {
    if (!latestZoneEvent) return;
    const log = [...latestEventLog];
    const event = log[latestZoneEvent.index];
    if (event.type !== 'touch_recorded') return;
    log[latestZoneEvent.index] = { ...event, touch: { ...event.touch, [field]: code, zonesPicked: true } };
    // In single-team mode, mirror receive zones onto the preceding inferred opponent serve.
    if (latestZoneEvent.skill === 'receive' && latestZoneEvent.index > 0) {
      const prev = log[latestZoneEvent.index - 1];
      if (
        prev.type === 'touch_recorded'
        && prev.touch.skill === 'serve'
        && prev.touch.rallyNumber === event.touch.rallyNumber
        && prev.touch.setNumber === event.touch.setNumber
      ) {
        log[latestZoneEvent.index - 1] = { ...prev, touch: { ...prev.touch, [field]: code, zonesPicked: true } };
      }
    }
    replaceLiveMatchEvents(log);
    // Start and arrival both given: the picker closes (Done or Skip close it too).
    const other = field === 'endZoneCode' ? event.touch.startZoneCode : event.touch.endZoneCode;
    if (other) {
      setZoneSkippedTouchIds((current) => new Set(current).add(event.touch.id));
    }
  };

  // Attack subtype (hard / placed / tip) for the latest attack, one tap
  // after it is recorded: the touch in the log gets the DataVolley subtype.
  // The attack type (hard / placed / tip) is chosen on the toolbar when Attack is pressed,
  // before the attack is drawn; no floating banner over the court afterwards.

  // Lineup rebuilt from the serves: when a scouted team is about to serve and
  // nobody is in its position 1, ask the server's number once per rally. The
  // starting lineup is completed, so after a full turn of serves it is whole.
  // Tags ask on their own when the serve is tagged.
  const askedServerKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (inputMode === 'tag' || !liveMatch?.isSetStarted || liveMatch.isRallyActive || pendingEmptyPosition) return;
    if (activeStage !== 'live_rally' || courtPhase !== 'waiting_to_serve') return;
    const side = liveMatch.servingTeam;
    if (!side || isUnscoutedTeam(side === 'home' ? homeTeam : awayTeam)) return;
    const lineup = side === 'home' ? liveMatch.homeActiveLineup : liveMatch.awayActiveLineup;
    if (!lineup || lineup.slots.find((slot) => slot.courtPosition === 1)?.playerId) return;
    const key = `${liveMatch.currentSetNumber}:${liveMatch.eventLog.length}`;
    if (askedServerKeyRef.current === key) return;
    askedServerKeyRef.current = key;
    setPendingEmptyPosition({ teamSide: side, courtPosition: 1, forServe: true });
    setEmptyPositionJersey('');
    setEmptyPositionError(null);
    setEmptyPositionMove(null);
  });

  // Live header: buttons that matter for the input in use only. Swapping the
  // sides means nothing with one team on the Tags pad; the vertical court only
  // where the ball is drawn on it (Court, Expert).
  const showSwapSides = !(inputMode === 'tag' && tagRecordTeams !== 'both');
  const [showExitDialog, setShowExitDialog] = useState(false);
  const deleteAndRestart = async () => {
    if (!activeProject || !(await confirmAction(t('liveExitRestartConfirm')))) return;
    const id = activeProject.metadata.id;
    setShowExitDialog(false);
    await matchRepository.delete(id);
    closeProject();
    navigate('/match');
  };

  // Quick start (one page from "New match"): default rules, then set 1 starts
  // with the lineup given there and the chosen input mode, no further steps.
  const quickStartRef = useRef<QuickStartRequest | null>(
    (location.state as { quickStart?: QuickStartRequest } | null)?.quickStart ?? null,
  );
  const quickStartSavingRef = useRef(false);
  useEffect(() => {
    const request = quickStartRef.current;
    if (!request || !activeProject) return;
    if (activeStage === 'pre_match_config') {
      if (quickStartSavingRef.current) return;
      quickStartSavingRef.current = true;
      void handleSaveConfig(scoutingConfig);
      return;
    }
    if (activeStage !== 'set_setup' || liveMatch?.isSetStarted || currentSetNumber !== 1) {
      quickStartRef.current = null;
      return;
    }
    quickStartRef.current = null;
    const lineups = buildQuickStartLineups(homeTeam, awayTeam, request, teamRoleSequences.home);
    selectInputLevel(request.level);
    setTagRecordTeams(request.ownTeamOnly ? 'home' : 'both');
    handleSetStarted({
      homeStartingLineup: lineups.home,
      awayStartingLineup: lineups.away,
      servingTeam: request.servingTeam,
    });
    navigate(location.pathname, { replace: true, state: null });
  });

  const liveExtras = (
    <>
            {latestZoneEvent ? (
              <TagZonePicker
                variant={zonePickerVariant}
                skill={latestZoneEvent.skill}
                startZone={latestZoneEvent.touch.startZoneCode}
                endZone={latestZoneEvent.touch.endZoneCode}
                onStart={(zone) => setLatestTouchZone('startZoneCode', zone)}
                onEnd={(zone) => setLatestTouchZone('endZoneCode', zone)}
                onClose={() => setZoneSkippedTouchIds((current) => new Set(current).add(latestZoneEvent.touch.id))}
              />
            ) : null}
    </>
  );

  const stageContent = (
    <section className={stageShellClassName}>
      {activeStage === 'pre_match_config' && (
        <PreMatchConfigStage
          initialConfig={scoutingConfig}
          onSave={handleSaveConfig}
        />
      )}

      {activeStage === 'set_setup' && (
        <SetSetupStage
          matchSummary={matchSummaryParts.join(' | ')}
          setNumber={currentSetNumber}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          initialSetup={isCorrectingSetStart
            ? correctableSetStart
            : stageSummary.latestCompletedSet ? nextSetPrefillConfig : null}
          previousSetup={isCorrectingSetStart
            ? (currentSetNumber > 1 ? getLastConfirmedLineups(latestEventLog, currentSetNumber) : null)
            : undefined}
          isCorrection={isCorrectingSetStart}
          onBack={isCorrectingSetStart
            ? () => setIsCorrectingSetStart(false)
            : () => setStageOverride(stageSummary.currentStage === 'set_end' ? null : 'pre_match_config')}
          onSetStarted={isCorrectingSetStart ? handleSetStartCorrected : handleSetStarted}
          onAddPlayers={handleAddPlayersToMatch}
          roleSequences={teamRoleSequences}
          // A correction always starts from the set as recorded: no draft to restore.
          draftKey={activeProject && !isCorrectingSetStart ? `${activeProject.metadata.id}:${currentSetNumber}` : undefined}
        />
      )}

      {renderDeadBallEventsPanel ? (
        <ScoutingStageFrame
          stage="live_rally"
          eyebrow=""
          title=""
          description=""
          bodyClassName="scouting-stage__body--live-rally scouting-stage__body--events-panel"
        >
          <div className="live-rally-stage live-rally-stage--events-panel">
            {manageActionPanel}
          </div>
        </ScoutingStageFrame>
      ) : null}

      {/* Stays mounted while the events panel is open, with only the video
          left on screen (floating above the panel) so the event can be
          checked on it: unmounting closed a local video and sent a YouTube
          one back to the start of the match. */}
      {activeStage === 'live_rally' && (
        <div
          className={[
            'scouting-screen__live-layout',
            isVideoDocked ? 'scouting-screen__live-layout--compact' : '',
            renderCourtFirstLiveRally ? '' : 'scouting-screen__live-layout--behind-events',
          ].filter(Boolean).join(' ')}
        >
          {(inputLevel === 'detailed' || (isVerticalCourtLiveRally && !isTagInputLiveRally)) && (
            <MatchCodeListPanel
              eventLog={latestEventLog}
              homePlayers={homeTeam.players}
              awayPlayers={awayTeam.players}
              notes={activeProject?.videoAnalysis?.notes ?? []}
              onEditNote={(note) => setPointNoteModal({ mode: 'edit', note })}
              onDeleteNote={handleDeletePointNote}
              onJumpToVideo={
                activeProject?.videoAnalysis?.source?.kind === 'file'
                || activeProject?.videoAnalysis?.source?.kind === 'youtube'
                || activeProject?.videoAnalysis?.source?.kind === 'url'
                  ? (seconds) => liveVideoPanelRef.current?.seekTo(seconds, true)
                  : undefined
              }
              isCollapsed={codeListCollapsed}
              onToggleCollapsed={() => setCodeListCollapsed((v) => !v)}
              onReplaceEvents={replaceLiveMatchEventsAndClearUndo}
            />
          )}
          <div className="scouting-screen__main-area">
            {inputMode !== 'tag' ? liveExtras : null}
            <div className={`scouting-screen__court-area${isVideoDocked && isTagInputLiveRally ? ' scouting-screen__court-area--video-docked' : ''}${isTagInputLiveRally ? ' scouting-screen__court-area--tag' : ''}`}>
              {isTagInputLiveRally ? (
                <TagInputPanel
                  extra={latestZoneEvent ? liveExtras : undefined}
                  codeList={(
                    <MatchCodeListPanel
                      eventLog={latestEventLog}
                      homePlayers={homeTeam.players}
                      awayPlayers={awayTeam.players}
                      notes={activeProject?.videoAnalysis?.notes ?? []}
                      onEditNote={(note) => setPointNoteModal({ mode: 'edit', note })}
                      onDeleteNote={handleDeletePointNote}
                      isCollapsed={false}
                      onToggleCollapsed={() => undefined}
                      onReplaceEvents={replaceLiveMatchEventsAndClearUndo}
                    />
                  )}
                  homeTeam={homeTeam}
                  awayTeam={awayTeam}
                  homeLineup={liveMatch?.homeActiveLineup ?? null}
                  awayLineup={liveMatch?.awayActiveLineup ?? null}
                  servingTeam={liveMatch?.servingTeam ?? null}
                  currentRallyTouches={liveMatch?.currentRallyTouches ?? []}
                  leftTeamSide={leftTeamSide}
                  rightTeamSide={rightTeamSide}
                  confirmPoint={confirmPointAssignment}
                  onCommitTouches={handleTouchesCommitted}
                  onFinalizeRally={finalizeRally}
                  onUndo={handleGroupedUndo}
                  onOpenNote={openCreatePointNote}
                  canUndo={canEditLiveScore && groupedUndoAvailability.canApply}
                  onSubstitute={recordSubstitutionBeforeRally}
                  recordTeams={tagRecordTeams}
                  onRecordTeamsChange={setTagRecordTeams}
                  onAssignJersey={assignJerseyFromTagInput}
                />
              ) : (
                (() => {
                  return (
                    <div className="live-action-area" onPointerDownCapture={markActionStart} onKeyDownCapture={markActionStart}>
                    <LiveRallyStage
                      keyboardShortcutsEnabled={renderCourtFirstLiveRally}
                      useSidebar={useVerticalSidebar || (isVerticalCourtLiveRally && isSmartphoneLandscape)}
                      instructionInSidebar={isVerticalCourtLiveRally && isSmartphoneLandscape}
                      videoPanel={videoHiddenReason ? undefined : (
                        <LiveScoutingVideoPanel
                          ref={liveVideoPanelRef}
                          project={activeProject}
                          isCollapsed={videoPanelCollapsed}
                          onCollapsedChange={setVideoPanelCollapsed}
                          docked={useVerticalSidebar && renderCourtFirstLiveRally}
                          canCollapse={!useVerticalSidebar}
                          isOnScreen={renderCourtFirstLiveRally}
                        />
                      )}
                      awayTeam={awayTeam}
                      homeTeam={homeTeam}
                      awayLineup={liveMatch?.awayActiveLineup ?? null}
                      homeLineup={liveMatch?.homeActiveLineup ?? null}
                      awayDisplaySide={awayDisplaySide}
                      homeDisplaySide={homeDisplaySide}
                      defenseSystemBlock={activeDefenseSystemBlock}
                      receptionSystemBlock={activeReceptionSystemBlock}
                      teamSystemBlocks={teamSystemBlocks}
                      codeTables={activeProject ? getMatchCodeTables(activeProject) : undefined}
                      teamTacticalPhases={teamTacticalPhases}
                      servingTeam={liveMatch?.servingTeam ?? null}
                      courtPhase={courtPhase}
                      isRallyActive={liveMatch?.isRallyActive ?? false}
                      currentRallyTouches={liveMatch?.currentRallyTouches ?? []}
                      selectedZone={selectedZone}
                      onSelectedZoneChange={handleSelectedZoneChange}
                      onTouchesCommitted={handleTouchesCommitted}
                      onRallyEnd={finalizeRally}
                      onAceVictimSelectionChange={setIsAceVictimSelection}
                      onBallPointerDown={handleBallPointerDown}
                      canUndo={canEditLiveScore && groupedUndoAvailability.canApply}
                      canRemoveLastTouch={canRemoveLastTouch}
                      canOpenEvents={canEditLiveScore}
                      onUndo={handleGroupedUndo}
                      onRemoveLastTouch={handleRemoveLastTouch}
                      onOpenNote={openCreatePointNote}
                      onOpenEvents={openManageAction}
                      statusMessage={pendingCodeInputSide ? null : courtStatusMessage}
                      sidelinePlayers={liveMatch
                        ? (['home', 'away'] as TeamSide[]).flatMap((teamSide) => getSidelinePlayers(liveMatch, teamSide)
                          .map((player) => ({
                            ...player,
                            jerseyNumber: getTeamRosterForTeamSide(teamSide)
                              .find((rosterPlayer) => rosterPlayer.id === player.playerId)?.jerseyNumber ?? '?',
                            label: player.kind === 'libero' ? t('liberoSidelineHint') : t('liberoReplacedSidelineHint'),
                          })))
                        : []}
                      onSidelinePlayerTap={handleSidelinePlayerTap}
                      onEmptyPositionTap={openEmptyPosition}
                    />
                    </div>
                  );
                })()
              )}
              {pendingCodeInputSide && (
                <div className="scouting-screen__point-confirm-overlay">
                  <div className="scouting-screen__point-confirm-card" role="dialog" aria-modal="true" aria-labelledby="scouting-point-confirm-question">
                    <p id="scouting-point-confirm-question" className="scouting-screen__point-confirm-question">
                      {t('confirmPoint')}
                    </p>
                    <p className="scouting-screen__point-confirm-team">
                      {pendingCodeInputSide === 'left' ? leftTeamName : rightTeamName}
                    </p>
                    <div className="scouting-screen__point-confirm-direction">
                      <span className="scouting-screen__point-confirm-arrow">
                        {pendingCodeInputSide === 'left' ? '◀' : ''}
                      </span>
                      <span className="scouting-screen__point-confirm-net" aria-hidden="true" />
                      <span className="scouting-screen__point-confirm-arrow">
                        {pendingCodeInputSide === 'right' ? '▶' : ''}
                      </span>
                    </div>
                    <div className="scouting-screen__point-confirm-actions">
                      <button
                        type="button"
                        className="scouting-screen__point-confirm-btn scouting-screen__point-confirm-btn--yes"
                        onClick={handleConfirmPendingPoint}
                      >
                        {t('yes')}
                      </button>
                      <button
                        type="button"
                        className="scouting-screen__point-confirm-btn scouting-screen__point-confirm-btn--no"
                        onClick={handleCancelPendingPoint}
                      >
                        {t('no')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {isTagInputLiveRally && !videoHiddenReason && (
                <LiveScoutingVideoPanel
                  ref={liveVideoPanelRef}
                  project={activeProject}
                  isCollapsed={videoPanelCollapsed}
                  onCollapsedChange={setVideoPanelCollapsed}
                  docked={isVideoDocked && renderCourtFirstLiveRally}
                  isOnScreen={renderCourtFirstLiveRally}
                />
              )}
            </div>
            {!isVerticalCourtLiveRally && inputLevel === 'detailed' && codeInputPanel}
          </div>
          {attackData && !isTagInputLiveRally && (
            <OpponentAttackPanel
              home={attackData.home}
              away={attackData.away}
              servePhase={servePhase}
              isCollapsed={opponentAttackCollapsed}
              onToggleCollapsed={() => setOpponentAttackCollapsed((v) => !v)}
            />
          )}
          {isVerticalCourtLiveRally && inputLevel === 'detailed' && codeInputPanel}
        </div>
      )}

      {activeStage === 'set_end' && latestCompletedSetDisplay && latestCompletedSetStats && matchStats && (
        <SetEndStage
          setSummary={latestCompletedSetDisplay}
          awayTeam={awayTeam}
          homeTeam={homeTeam}
          setsWon={stageSummary.setsWon}
          setStats={latestCompletedSetStats}
          matchStats={matchStats}
          metadata={activeProject.metadata}
          scoutingConfig={scoutingConfig}
          eventLog={latestEventLog}
          completedSets={completedSets}
          lineupSnapshots={liveMatch?.lineupSnapshots ?? activeProject.scoutingSession?.lineupSnapshots}
          canStartNextSet={!stageSummary.isMatchComplete}
          onStartNextSet={handleStartNextSet}
          onFinishMatch={() => void handleFinishMatch()}
        />
      )}

      {activeStage === 'match_end' && matchStats && (
        <MatchEndStage
          awayTeam={awayTeam}
          homeTeam={homeTeam}
          awayTeamName={awayTeamName}
          homeTeamName={homeTeamName}
          winnerTeamName={matchWinnerName}
          setsWon={stageSummary.setsWon}
          completedSets={completedSetSummaries}
          matchStats={matchStats}
          matchResult={matchResult}
          metadata={activeProject.metadata}
          scoutingConfig={scoutingConfig}
          eventLog={latestEventLog}
          rawCompletedSets={completedSets}
          lineupSnapshots={liveMatch?.lineupSnapshots ?? activeProject.scoutingSession?.lineupSnapshots}
          onOpenAnalysis={handleOpenAnalysis}
          onBackToMatchSetup={() => navigate('/match')}
        />
      )}
    </section>
  );

  return (
    <>
      <main className={scoutingScreenClassName}>
        <div className={scoutingContainerClassName}>
        {isPreMatchStage ? (
          <section className="scouting-screen__pre-match-header">
            <p className="scouting-screen__pre-match-summary">
              <span className="scouting-screen__pre-match-summary-label">{t('match')}:</span>{' '}
              {matchSummaryParts.join(' | ')}
            </p>
            <div className="scouting-screen__pre-match-copy">
              <h1 className="scouting-screen__pre-match-title">{t('preMatchConfigTitle')}</h1>
              <p className="scouting-screen__pre-match-description">{t('preMatchConfigMatchLevelDescription')}</p>
            </div>
          </section>
        ) : activeStage === 'set_setup' ? null : isPhone || (isTabletPortrait && activeStage === 'live_rally') ? (
          renderPhoneHeader()
        ) : (
          <ScoutingTopBar
            headerClassName={scoutingHeaderClassName}
            matchbarClassName={scoutingMatchbarClassName}
            leftTeam={{
              side: leftTeamSide,
              name: leftTeamName,
              lineup: leftTeamLineup,
              setsWon: leftSetsWon,
              pointsScore: leftPointsScore,
              timeouts: leftTeamCurrentSetStats.timeouts,
              substitutions: leftTeamCurrentSetStats.substitutions,
              canUndoPoint: canUndoLeftPoint,
            }}
            rightTeam={{
              side: rightTeamSide,
              name: rightTeamName,
              lineup: rightTeamLineup,
              setsWon: rightSetsWon,
              pointsScore: rightPointsScore,
              timeouts: rightTeamCurrentSetStats.timeouts,
              substitutions: rightTeamCurrentSetStats.substitutions,
              canUndoPoint: canUndoRightPoint,
            }}
            meta={{
              currentSetLabel: String(currentSetLabel),
              currentRallyLabel: String(currentRallyLabel),
              servingTeamLabel,
              currentEventLabel,
              homeTeamName,
              awayTeamName,
              homeSetsWon: stageSummary.setsWon.home,
              awaySetsWon: stageSummary.setsWon.away,
              currentHomeScore,
              currentAwayScore,
            }}
            activeStage={activeStage}
            isOperationalStage={isOperationalStage}
            canEditLiveScore={canEditLiveScore}
            showSwapSides={showSwapSides}
            inputLevel={inputLevel}
            hideDetailedInput={isPhone}
            simpleInput={simpleInput}
            dataVolleyRallyCode={dataVolleyRallyCode}
            onManualPoint={handleManualPoint}
            onUndoLastPoint={handleUndoLastPoint}
            onOpenManageAction={openManageAction}
            onOpenManageActionFor={openManageActionFor}
            onOpenExitDialog={() => setShowExitDialog(true)}
            onSwapSides={() => {
              if (liveMatch) {
                toggleDisplaySideSwapped(liveMatch.activeProjectId, liveMatch.currentSetNumber);
              }
            }}
            onOpenLiveHelp={openLiveHelp}
            onSelectInputLevel={selectInputLevel}
          />
        )}
        {scoreFeedback ? (
          <div
            key={scoreFeedback.id}
            className={`scouting-screen__rally-won-overlay scouting-screen__rally-won-overlay--${scoreFeedback.teamSide}`}
            role="status"
            aria-live="polite"
          >
            <span className="scouting-screen__rally-won-label">{t('rallyWon')}</span>
            <strong className="scouting-screen__rally-won-team">{scoreFeedbackTeamName}</strong>
          </div>
        ) : null}
        {showVideoHiddenNotice ? (
          <div className="scouting-screen__video-hidden-notice" role="status" aria-live="polite">
            <p>{t(videoHiddenReason === 'small-screen' ? 'liveVideoHiddenSmallScreen' : 'liveVideoHiddenTagNarrowScreen')}</p>
            <button type="button" className="btn-secondary btn-small" onClick={dismissVideoHiddenNotice}>
              {t('gotIt')}
            </button>
          </div>
        ) : null}
        <LiveExitDialog
          open={showExitDialog}
          onGoToAnalysis={() => { setShowExitDialog(false); navigate('/analysis'); }}
          onSuspend={() => { setShowExitDialog(false); navigate('/'); }}
          onDeleteAndRestart={() => { void deleteAndRestart(); }}
          onOpenMenu={() => { setShowExitDialog(false); setLiveMenuOpen(true); }}
          onClose={() => setShowExitDialog(false)}
        />
        {pendingEmptyPosition && (
          <div className="scouting-screen__setter-assignment-overlay" role="dialog" aria-modal="true">
            <form
              className="scouting-screen__setter-assignment-dialog"
              onSubmit={(event) => { event.preventDefault(); void confirmEmptyPosition(); }}
            >
              <strong>
                {t(pendingEmptyPosition.forServe ? 'emptyPositionServerTitle' : 'emptyPositionTitle', {
                  position: pendingEmptyPosition.courtPosition,
                  team: pendingEmptyPosition.teamSide === 'home' ? homeTeamName : awayTeamName,
                })}
              </strong>
              <label className="scouting-screen__correction-field">
                <span>{t('emptyPositionJersey')}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  autoFocus
                  value={emptyPositionJersey}
                  onChange={(event) => { setEmptyPositionJersey(event.target.value.replace(/\D/g, '')); setEmptyPositionError(null); setEmptyPositionMove(null); }}
                />
              </label>
              {pendingEmptyPosition.forServe ? <p className="scouting-screen__correction-hint">{t('emptyPositionServerHint')}</p> : null}
              {emptyPositionError ? <p className="scouting-screen__correction-error">{emptyPositionError}</p> : null}
              {emptyPositionMove ? (
                <div className="scouting-screen__correction-move">
                  <p>{t('emptyPositionAlreadyIn', { jersey: emptyPositionMove.jerseyNumber, position: emptyPositionMove.from })}</p>
                  <button type="button" className="btn-primary btn-small" onClick={confirmEmptyPositionMove}>
                    {t('emptyPositionMoveHere', { jersey: emptyPositionMove.jerseyNumber, position: pendingEmptyPosition.courtPosition })}
                  </button>
                </div>
              ) : null}
              <div className="scouting-screen__correction-actions">
                <button type="button" className="btn-secondary btn-small" onClick={() => setPendingEmptyPosition(null)}>
                  {t(pendingEmptyPosition.forServe ? 'emptyPositionServerSkip' : 'cancel')}
                </button>
                <button type="submit" className="btn-primary btn-small" disabled={emptyPositionJersey === ''}>
                  {t('emptyPositionAssign')}
                </button>
              </div>
            </form>
          </div>
        )}
        <SetterAssignmentDialog
          open={Boolean(pendingSetterAssignment)}
          candidates={pendingSetterAssignment
            ? pendingSetterAssignment.candidateIds.map((playerId) => ({
              id: playerId,
              label: getPlayerLabel(pendingSetterAssignment.teamSide, playerId),
            }))
            : []}
          selectedSetterId={selectedNewSetterId}
          onSelectSetter={setSelectedNewSetterId}
          onConfirm={confirmSetterAssignment}
        />
        {activeStage === 'live_rally' && !inputLevelChosen && !showOnboarding ? (
          <InputLevelChooser
            recommended={isTouchOnlyDevice() || isPhone ? 'court' : 'detailed'}
            hideDetailed={isPhone}
            onChoose={selectInputLevel}
          />
        ) : null}
        <ScoutingOnboardingCard
          open={showOnboarding}
          onClose={markLiveOnboardingAsSeen}
          onOpenManual={openLiveHelp}
        />
        {/* "?" opens the tutorial of the input mode in use, over the match. */}
        <ImageTutorialSlideShow
          tutorial={showHelpModal ? getInputModeTutorial(inputMode, simpleInput) : null}
          onClose={closeLiveHelp}
        />
        {pointNoteModal ? (
          <PointNoteModal
            note={pointNoteModal.mode === 'edit' ? pointNoteModal.note : undefined}
            setNumber={pointNoteModal.mode === 'edit' ? pointNoteModal.note.setNumber : (liveMatch?.currentSetNumber ?? 1)}
            homeScore={pointNoteModal.mode === 'edit' ? pointNoteModal.note.homeScore : (liveMatch?.homeScore ?? 0)}
            awayScore={pointNoteModal.mode === 'edit' ? pointNoteModal.note.awayScore : (liveMatch?.awayScore ?? 0)}
            onSave={handleSavePointNote}
            onDelete={pointNoteModal.mode === 'edit' ? () => handleDeletePointNote(pointNoteModal.note.id) : undefined}
            onClose={() => setPointNoteModal(null)}
          />
        ) : null}
        <OrientationGuard
          enabled={requiresLandscape}
          mediaQuery={liveScoutingOrientationGuardMediaQuery}
          messageKey="rotateForLiveScouting"
          hintKey={null}
          onDismiss={() => setCourtOrientation('vertical')}
        >
          <PortraitGuard
            stage={activeStage}
            viewport={{ width: window.innerWidth, height: window.innerHeight }}
            bypass={worksInPortrait}
            onContinueInPortrait={() => setCourtOrientation('vertical')}
          >
            {stageContent}
          </PortraitGuard>
        </OrientationGuard>
      </div>
      </main>
    </>
  );
}
