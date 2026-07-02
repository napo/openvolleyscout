import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { ScoutingMode } from '@src/domain/scouting/types';
import type { ScoutingZone } from '@src/domain/spatial';
import type { BallTouch, NumBlockers } from '@src/domain/touch/types';
import {
  createBallDirection,
  createBallTrajectory,
  updateBallTrajectoryMetadata,
  type BallDirection,
  type BallTrajectory,
} from '@src/domain/trajectory';
import {
  buildNextPendingTouch,
  isAce,
  RECEIVE_TO_SERVE_EVALUATION,
  resolveAceFlow,
  resolvePointTeam,
  shouldAssignPoint,
  type PendingTouch,
} from '../../model/datavolley-flow';
import { getDefaultEvaluationForSkill } from '../../model/touch-popup';
import {
  buildReceptionDrivenServeReceiveTouch,
  buildReceptionTouchForSelectedPlayer,
  buildManualServeReceiveTouchFromServeError,
  buildServeErrorConfirmationTouch,
  canSelectReceptionDrivenServeReceiver,
  createAttackBlockerSelection,
  buildPendingTouchForZone,
  getValidAttackBlockers,
  isReceivingPlayerCloseEnoughForAutoSelection,
  isReceptionDrivenServePendingTouch,
  isServeErrorConfirmationPendingTouch,
  isServeReleaseInReceivingCourt,
  MAX_AUTO_RECEIVER_STAGE_DISTANCE,
  resolveAttackBlockerSelection,
  resolveAceVictimFlow,
  resolveEvaluationFlow,
  resolveReceptionDrivenServeEvaluationFlow,
  updatePendingTouchBallTypeCode,
  updatePendingTouchEvaluation,
  updatePendingTouchNumBlockers,
  updatePendingTouchSelection,
  updatePendingTouchSkill,
  type AceVictimSelection,
  type AttackBlockerSelection,
  type CourtCoordinate,
  type RallyEndPreview,
  type TeamTacticalPlayers,
} from '../rally/rally-flow';
import { getOppositeTeamSide } from '../../model/scoring-rules';
import { isBallReleaseOnNet } from '../rally/rally-flow';
import { getTeamScopedPlayerKey } from '../tactical/player-identity';
import { DEFAULT_SCOUTING_MODE, normalizeScoutingMode } from '../../model/scouting-mode';
import { getZoneCode } from '../../model/datavolley-code';
import type { DataVolleyBallTypeCode } from '../../model/datavolley-ball-types';
import {
  canCommitPendingTouchWithDefaults,
  getScoutingModeConfig,
  type ScoutingModeInputRequirements,
} from '../../model/scouting-mode-config';
import { getReceptionBallTarget } from '@src/config/scouting/reception-ball-placement';
import { useAppStore } from '@src/app/store/app-store';

export type LiveTouchFlowPhase =
  | 'idle'
  | 'player_selected'
  | 'touch_pending'
  | 'evaluation_selected'
  | 'awaiting_ace_target'
  | 'rally_ended';

export type LiveInputPhase =
  | 'select_player'
  | 'move_ball'
  | 'choose_skill'
  | 'choose_evaluation'
  | 'ace_victim_selection'
  | 'blocker_selection'
  | 'completed_touch';

export type LiveInputState = {
  selectedPlayerId: string | null;
  selectedTeamSide: TeamSide | null;
  pendingBallPosition: CourtCoordinate | null;
  selectedSkill: SkillType | null;
  selectedEvaluation: SkillEvaluation | null;
  pendingTouch: PendingTouch | null;
  scoutingMode: ScoutingMode;
  requiredExplicitInput: ScoutingModeInputRequirements;
  inferredCandidate: boolean;
  pendingInference: boolean;
  currentInputPhase: LiveInputPhase;
};

export type LiveInputStateInput = {
  selectedPlayerId: string | null;
  selectedTeamSide: TeamSide | null;
  pendingBallPosition: CourtCoordinate | null;
  pendingTouch: PendingTouch | null;
  aceVictimSelection?: AceVictimSelection | null;
  blockerSelection?: AttackBlockerSelection | null;
  skillWasSelected?: boolean;
  evaluationWasSelected?: boolean;
  forceSkill?: boolean;
  scoutingMode?: ScoutingMode;
};

export type AwaitingReceiverContext = {
  zone: ScoutingZone;
  destinationPoint: CourtCoordinate;
  servingTeam: TeamSide;
  servingPlayerId: string;
  serveDirection?: BallDirection | null;
  serveTrajectory?: BallTrajectory | null;
  receivingTeam: TeamSide;
};

export type LiveEvaluationAction =
  | {
      kind: 'awaiting_ace_target';
      selection: AceVictimSelection;
    }
  | {
      kind: 'touch_committed';
      touches: PendingTouch[];
    }
  | {
      kind: 'rally_ended';
      touches: PendingTouch[];
      preview: RallyEndPreview;
    };

type TransitionTarget = LiveTouchFlowPhase;

type FlowContext = {
  previousTouch: Pick<BallTouch, 'playerId' | 'teamSide' | 'skill' | 'evaluation'> | null;
  servingTeam: TeamSide | null;
  servingPlayerId: string | null;
  playerTeamByScopedKey: Record<string, TeamSide>;
};

type RallyEndRequest = {
  pointTeam: TeamSide;
  reason: string;
};

type LiveTouchFlowState = {
  currentPhase: LiveTouchFlowPhase;
  selectedPlayerId: string | null;
  selectedTeamSide: TeamSide | null;
  pendingTouch: PendingTouch | null;
  awaitingAceTarget: boolean;
  lastTouchedPlayerId: string | null;
  flowContext: FlowContext;
  committedTouches: PendingTouch[];
  rallyEndRequest: RallyEndRequest | null;
  updateContext: (context: Partial<FlowContext>) => void;
  selectPlayer: (playerId: string, teamSide: TeamSide) => void;
  openTouch: (zone: ScoutingZone) => void;
  selectEvaluation: (evaluation: SkillEvaluation) => void;
  updatePendingSkill: (skill: SkillType) => void;
  commitPendingTouch: () => void;
  handleAceTarget: (playerId: string, teamSide: TeamSide) => void;
  endRally: (pointTeam: TeamSide, reason?: string) => void;
  consumeCommittedTouches: () => PendingTouch[];
  clearRallyEndRequest: () => void;
  resetFlow: () => void;
};

const ALLOWED_TRANSITIONS: Record<LiveTouchFlowPhase, TransitionTarget[]> = {
  idle: ['player_selected'],
  player_selected: ['touch_pending'],
  touch_pending: ['evaluation_selected'],
  evaluation_selected: ['awaiting_ace_target', 'rally_ended', 'player_selected'],
  awaiting_ace_target: ['rally_ended'],
  rally_ended: ['idle'],
};

const INITIAL_CONTEXT: FlowContext = {
  previousTouch: null,
  servingTeam: null,
  servingPlayerId: null,
  playerTeamByScopedKey: {},
};

function canTransition(from: LiveTouchFlowPhase, to: LiveTouchFlowPhase) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

function transitionPhase(currentPhase: LiveTouchFlowPhase, targetPhase: LiveTouchFlowPhase) {
  if (currentPhase === targetPhase) {
    return currentPhase;
  }

  return canTransition(currentPhase, targetPhase) ? targetPhase : currentPhase;
}

function transitionSequence(currentPhase: LiveTouchFlowPhase, targets: LiveTouchFlowPhase[]) {
  return targets.reduce((phase, target) => transitionPhase(phase, target), currentPhase);
}

export function createLiveInputState({
  selectedPlayerId,
  selectedTeamSide,
  pendingBallPosition,
  pendingTouch,
  aceVictimSelection = null,
  blockerSelection = null,
  skillWasSelected = false,
  evaluationWasSelected = false,
  forceSkill = false,
  scoutingMode = DEFAULT_SCOUTING_MODE,
}: LiveInputStateInput): LiveInputState {
  const normalizedMode = normalizeScoutingMode(scoutingMode);
  const modeConfig = getScoutingModeConfig(normalizedMode);
  let currentInputPhase: LiveInputPhase = 'select_player';

  if (aceVictimSelection) {
    currentInputPhase = 'ace_victim_selection';
  } else if (blockerSelection) {
    currentInputPhase = 'blocker_selection';
  } else if (evaluationWasSelected) {
    currentInputPhase = 'completed_touch';
  } else if (pendingTouch) {
    currentInputPhase = skillWasSelected || forceSkill ? 'choose_evaluation' : 'choose_skill';
  } else if (selectedPlayerId || pendingBallPosition) {
    currentInputPhase = 'move_ball';
  }

  return {
    selectedPlayerId,
    selectedTeamSide,
    pendingBallPosition,
    selectedSkill: pendingTouch?.skill ?? null,
    selectedEvaluation: pendingTouch?.evaluation ?? null,
    pendingTouch,
    scoutingMode: normalizedMode,
    requiredExplicitInput: modeConfig.requiredExplicitInput,
    inferredCandidate: pendingTouch?.inferredCandidate ?? false,
    pendingInference: pendingTouch?.pendingInference ?? false,
    currentInputPhase,
  };
}

export function resolveLiveEvaluationAction(touch: PendingTouch): LiveEvaluationAction {
  const result = resolveEvaluationFlow(touch);

  if (result.kind === 'awaiting_ace_target') {
    return {
      kind: 'awaiting_ace_target',
      selection: result.selection,
    };
  }

  if (result.kind === 'rally_ended') {
    return {
      kind: 'rally_ended',
      touches: [result.touch],
      preview: result.preview,
    };
  }

  return {
    kind: 'touch_committed',
    touches: [result.touch],
  };
}

function createRallyEndedState(
  state: LiveTouchFlowState,
  pointTeam: TeamSide,
  reason = 'rally_end',
): Partial<LiveTouchFlowState> {
  return {
    currentPhase: transitionPhase(state.currentPhase, 'rally_ended'),
    pendingTouch: null,
    awaitingAceTarget: false,
    rallyEndRequest: {
      pointTeam,
      reason,
    },
  };
}

function createTouchDirectionForZone(direction: BallDirection | null | undefined, zone: ScoutingZone): BallDirection | undefined {
  return direction
    ? createBallDirection({
        ...direction,
        courtZoneEnd: zone.id,
      })
    : undefined;
}

export const useLiveTouchFlowStore = create<LiveTouchFlowState>((set, get) => ({
  currentPhase: 'idle',
  selectedPlayerId: null,
  selectedTeamSide: null,
  pendingTouch: null,
  awaitingAceTarget: false,
  lastTouchedPlayerId: null,
  flowContext: INITIAL_CONTEXT,
  committedTouches: [],
  rallyEndRequest: null,

  updateContext: (context) => {
    set((state) => ({
      flowContext: {
        ...state.flowContext,
        ...context,
      },
    }));
  },

  selectPlayer: (playerId, teamSide) => {
    set((state) => {
      if (state.currentPhase === 'awaiting_ace_target') {
        return state;
      }

      if (state.currentPhase === 'evaluation_selected' && state.pendingTouch) {
        return {
          currentPhase: transitionPhase(state.currentPhase, 'player_selected'),
          selectedPlayerId: playerId,
          selectedTeamSide: teamSide,
          pendingTouch: null,
          awaitingAceTarget: false,
          lastTouchedPlayerId: state.pendingTouch.playerId,
          committedTouches: [...state.committedTouches, state.pendingTouch],
          rallyEndRequest: null,
        };
      }

      if (state.currentPhase === 'touch_pending') {
        return state;
      }

      const nextPhase = state.currentPhase === 'idle'
        ? transitionPhase(state.currentPhase, 'player_selected')
        : state.currentPhase;

      return {
        currentPhase: nextPhase,
        selectedPlayerId: playerId,
        selectedTeamSide: teamSide,
        awaitingAceTarget: false,
        rallyEndRequest: null,
        flowContext: {
          ...state.flowContext,
          playerTeamByScopedKey: {
            ...state.flowContext.playerTeamByScopedKey,
            [getTeamScopedPlayerKey(teamSide, playerId)]: teamSide,
          },
        },
      };
    });
  },

  openTouch: (zone) => {
    set((state) => {
      const selectedTeamSide = state.selectedPlayerId
        ? state.selectedTeamSide
        : null;

      const nextPendingTouch = buildNextPendingTouch({
        zone,
        previousTouch: state.flowContext.previousTouch,
        servingTeam: state.flowContext.servingTeam,
        servingPlayerId: state.flowContext.servingPlayerId,
        selectedPlayerId: state.selectedPlayerId,
        selectedTeamSide,
      });

      if (!nextPendingTouch) {
        return state;
      }

      const nextPhase = state.currentPhase === 'idle'
        ? transitionSequence(state.currentPhase, ['player_selected', 'touch_pending'])
        : transitionPhase(state.currentPhase, 'touch_pending');

      if (nextPhase !== 'touch_pending') {
        return state;
      }

      return {
        currentPhase: nextPhase,
        selectedPlayerId: nextPendingTouch.playerId ?? null,
        selectedTeamSide: nextPendingTouch.teamSide,
        pendingTouch: nextPendingTouch,
        awaitingAceTarget: false,
        rallyEndRequest: null,
      };
    });
  },

  selectEvaluation: (evaluation) => {
    set((state) => {
      if (state.currentPhase !== 'touch_pending' || !state.pendingTouch) {
        return state;
      }

      const nextPendingTouch: PendingTouch = {
        ...state.pendingTouch,
        evaluation,
      };

      const evaluationSelectedPhase = transitionPhase(state.currentPhase, 'evaluation_selected');
      if (evaluationSelectedPhase !== 'evaluation_selected') {
        return state;
      }

      if (isAce(nextPendingTouch)) {
        return {
          currentPhase: transitionPhase(evaluationSelectedPhase, 'awaiting_ace_target'),
          pendingTouch: nextPendingTouch,
          awaitingAceTarget: true,
          rallyEndRequest: null,
        };
      }

      if (shouldAssignPoint(nextPendingTouch)) {
        const pointTeam = resolvePointTeam(nextPendingTouch);
        if (!pointTeam) {
          return {
            currentPhase: evaluationSelectedPhase,
            pendingTouch: nextPendingTouch,
            awaitingAceTarget: false,
          };
        }

        return {
          currentPhase: transitionPhase(evaluationSelectedPhase, 'rally_ended'),
          pendingTouch: null,
          awaitingAceTarget: false,
          lastTouchedPlayerId: nextPendingTouch.playerId,
          committedTouches: [...state.committedTouches, nextPendingTouch],
          rallyEndRequest: {
            pointTeam,
            reason: `${nextPendingTouch.skill}_${evaluation}`,
          },
        };
      }

      return {
        currentPhase: evaluationSelectedPhase,
        pendingTouch: nextPendingTouch,
        awaitingAceTarget: false,
        rallyEndRequest: null,
      };
    });
  },

  updatePendingSkill: (skill) => {
    set((state) => (
      state.pendingTouch
        ? {
            pendingTouch: {
              ...state.pendingTouch,
              skill,
              evaluation: getDefaultEvaluationForSkill(skill),
            },
          }
        : state
    ));
  },

  commitPendingTouch: () => {
    set((state) => {
      if (state.currentPhase !== 'evaluation_selected' || !state.pendingTouch) {
        return state;
      }

      return {
        currentPhase: transitionPhase(state.currentPhase, 'player_selected'),
        pendingTouch: null,
        awaitingAceTarget: false,
        lastTouchedPlayerId: state.pendingTouch.playerId,
        committedTouches: [...state.committedTouches, state.pendingTouch],
      };
    });
  },

  handleAceTarget: (playerId, teamSide) => {
    set((state) => {
      if (state.currentPhase !== 'awaiting_ace_target' || !state.pendingTouch) {
        return state;
      }

      const resolvedAce = resolveAceFlow({
        serveTouch: state.pendingTouch,
        playerId,
        teamSide,
      });

      if (!resolvedAce) {
        return state;
      }

      return {
        currentPhase: transitionPhase(state.currentPhase, 'rally_ended'),
        selectedPlayerId: playerId,
        selectedTeamSide: teamSide,
        pendingTouch: null,
        awaitingAceTarget: false,
        lastTouchedPlayerId: playerId,
        committedTouches: [...state.committedTouches, ...resolvedAce.touches],
        rallyEndRequest: {
          pointTeam: resolvedAce.pointTeam,
          reason: 'ace',
        },
      };
    });
  },

  endRally: (pointTeam, reason = 'rally_end') => {
    set((state) => createRallyEndedState(state, pointTeam, reason));
  },

  consumeCommittedTouches: () => {
    const committedTouches = get().committedTouches;
    set({ committedTouches: [] });
    return committedTouches;
  },

  clearRallyEndRequest: () => {
    set({ rallyEndRequest: null });
  },

  resetFlow: () => {
    set((state) => ({
      currentPhase: state.currentPhase === 'rally_ended'
        ? transitionPhase(state.currentPhase, 'idle')
        : 'idle',
      selectedPlayerId: null,
      selectedTeamSide: null,
      pendingTouch: null,
      awaitingAceTarget: false,
      committedTouches: [],
      rallyEndRequest: null,
    }));
  },
}));

export type LiveTouchFlowControllerInput = {
  currentRallyTouches: readonly BallTouch[];
  teamPlayersBySide: TeamTacticalPlayers;
  servingTeam: TeamSide | null;
  servingPlayerId: string | null;
  isRallyActive: boolean;
  scoutingMode?: ScoutingMode;
  courtZones?: ScoutingZone[];
  onSelectedZoneChange: (zone: ScoutingZone | null) => void;
  onTouchesCommitted: (touches: PendingTouch[]) => void;
  onRallyEnd: (pointTeam: TeamSide, reason?: string) => void;
  onAceVictimSelectionChange?: (isSelecting: boolean) => void;
  /** Grouped undo of the last committed action, used when a point confirmation is declined. */
  onUndoLastAction?: () => void;
  selectedBallTypeCode?: DataVolleyBallTypeCode | null;
  selectedNumBlockers?: NumBlockers | null;
};

/**
 * Snapshot of the local flow state taken right before a terminal action is
 * committed, so a declined point confirmation ("No") can reopen the exact
 * same decision ("Cambia valutazione").
 */
type LiveTouchStateSnapshot = {
  selectedPlayerId: string | null;
  selectedTeamSide: TeamSide | null;
  pendingTouch: PendingTouch | null;
  pendingBallPosition: CourtCoordinate | null;
  pendingTrajectory: BallTrajectory | null;
  popupAnchor: CourtCoordinate | null;
  aceVictimSelection: AceVictimSelection | null;
  blockerSelection: AttackBlockerSelection | null;
  skillWasSelected: boolean;
  evaluationWasSelected: boolean;
  awaitingReceiverSelection: boolean;
  awaitingReceiverContext: AwaitingReceiverContext | null;
  awaitingAttackerContext: {
    zone: ScoutingZone;
    destinationPoint: CourtCoordinate;
    attackingTeam: TeamSide;
    ballDirection?: BallDirection | null;
    trajectory?: BallTrajectory | null;
  } | null;
};

export function useLiveTouchFlowController({
  currentRallyTouches,
  teamPlayersBySide,
  servingTeam,
  servingPlayerId,
  isRallyActive,
  scoutingMode = DEFAULT_SCOUTING_MODE,
  courtZones,
  onSelectedZoneChange,
  onTouchesCommitted,
  onRallyEnd,
  onAceVictimSelectionChange,
  onUndoLastAction,
  selectedBallTypeCode = null,
  selectedNumBlockers = null,
}: LiveTouchFlowControllerInput) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedTeamSide, setSelectedTeamSide] = useState<TeamSide | null>(null);
  const [pendingTouch, setPendingTouch] = useState<PendingTouch | null>(null);
  const [pendingBallPosition, setPendingBallPosition] = useState<CourtCoordinate | null>(null);
  const [pendingTrajectory, setPendingTrajectory] = useState<BallTrajectory | null>(null);
  const [popupAnchor, setPopupAnchor] = useState<CourtCoordinate | null>(null);
  const [rallyEndPreview, setRallyEndPreview] = useState<RallyEndPreview | null>(null);
  const [pendingDecisionSnapshot, setPendingDecisionSnapshot] = useState<LiveTouchStateSnapshot | null>(null);
  const [aceVictimSelection, setAceVictimSelection] = useState<AceVictimSelection | null>(null);
  const [blockerSelection, setBlockerSelection] = useState<AttackBlockerSelection | null>(null);
  const [skillWasSelected, setSkillWasSelected] = useState(false);
  const [evaluationWasSelected, setEvaluationWasSelected] = useState(false);
  const [awaitingReceiverSelection, setAwaitingReceiverSelection] = useState(false);
  const [awaitingReceiverContext, setAwaitingReceiverContext] = useState<AwaitingReceiverContext | null>(null);
  const [awaitingAttackerContext, setAwaitingAttackerContext] = useState<{
    zone: ScoutingZone;
    destinationPoint: CourtCoordinate;
    attackingTeam: TeamSide;
    ballDirection?: BallDirection | null;
    trajectory?: BallTrajectory | null;
  } | null>(null);
  const previousTouch = currentRallyTouches.at(-1);

  // ── Pre-terminal state snapshot (for declined point confirmations) ─────────
  // Mirrors the local state after every completed render so `showRallyEndPreview`
  // can capture "the state right before this terminal action" synchronously,
  // regardless of which branch is calling it.
  const stateSnapshotRef = useRef<LiveTouchStateSnapshot>({
    selectedPlayerId, selectedTeamSide, pendingTouch, pendingBallPosition, pendingTrajectory, popupAnchor,
    aceVictimSelection, blockerSelection, skillWasSelected, evaluationWasSelected,
    awaitingReceiverSelection, awaitingReceiverContext, awaitingAttackerContext,
  });
  useEffect(() => {
    stateSnapshotRef.current = {
      selectedPlayerId, selectedTeamSide, pendingTouch, pendingBallPosition, pendingTrajectory, popupAnchor,
      aceVictimSelection, blockerSelection, skillWasSelected, evaluationWasSelected,
      awaitingReceiverSelection, awaitingReceiverContext, awaitingAttackerContext,
    };
  });
  const forceSkill = currentRallyTouches.length === 0 && (
    pendingTouch?.skill === 'serve'
    || isReceptionDrivenServePendingTouch(pendingTouch)
  );
  const normalizedMode = normalizeScoutingMode(scoutingMode);
  const canCommitWithDefaults = canCommitPendingTouchWithDefaults(normalizedMode);

  const applySelectedBallTypeCode = useCallback((touch: PendingTouch): PendingTouch => (
    updatePendingTouchBallTypeCode(touch, selectedBallTypeCode)
  ), [selectedBallTypeCode]);

  const applySelectedNumBlockers = useCallback((touch: PendingTouch): PendingTouch => (
    updatePendingTouchNumBlockers(touch, selectedNumBlockers)
  ), [selectedNumBlockers]);

  const applyPendingTouchModifiers = useCallback((touch: PendingTouch): PendingTouch => (
    applySelectedNumBlockers(applySelectedBallTypeCode(touch))
  ), [applySelectedBallTypeCode, applySelectedNumBlockers]);

  useEffect(() => {
    if (!servingPlayerId || !servingTeam || selectedPlayerId || pendingTouch || blockerSelection || awaitingReceiverSelection) {
      return;
    }

    if (currentRallyTouches.length > 0) {
      return;
    }

    setSelectedPlayerId(servingPlayerId);
    setSelectedTeamSide(servingTeam);
  }, [awaitingReceiverSelection, blockerSelection, currentRallyTouches.length, pendingTouch, selectedPlayerId, servingPlayerId, servingTeam]);

  useEffect(() => {
    if (!isRallyActive) {
      setSelectedPlayerId(servingPlayerId ?? null);
      setSelectedTeamSide(servingTeam ?? null);
      setPendingTouch(null);
      setPendingBallPosition(null);
      setPendingTrajectory(null);
      setPopupAnchor(null);
      setRallyEndPreview(null);
      setPendingDecisionSnapshot(null);
      setAceVictimSelection(null);
      setBlockerSelection(null);
      setSkillWasSelected(false);
      setEvaluationWasSelected(false);
      setAwaitingReceiverSelection(false);
      setAwaitingReceiverContext(null);
      setAwaitingAttackerContext(null);
    }
  }, [isRallyActive, servingPlayerId, servingTeam]);

  useEffect(() => {
    onAceVictimSelectionChange?.(Boolean(aceVictimSelection));
  }, [aceVictimSelection, onAceVictimSelectionChange]);

  const commitTouches = useCallback((touches: PendingTouch[]) => {
    if (touches.length === 0) {
      return;
    }

    onTouchesCommitted(touches);
    setPendingTouch(null);
    setPendingBallPosition(null);
    setPendingTrajectory(null);
    setPopupAnchor(null);
    setSkillWasSelected(false);
    setEvaluationWasSelected(false);
    setBlockerSelection(null);
  }, [onTouchesCommitted]);

  const confirmPointAssignment = useAppStore((state) => state.confirmPointAssignment);

  const showRallyEndPreview = useCallback((pointTeam: TeamSide, reason: string) => {
    if (confirmPointAssignment) {
      setRallyEndPreview({ pointTeam, reason });
      // Snapshot the state as it was right before this terminal action (the
      // setters in the calling branch haven't applied yet in this tick).
      setPendingDecisionSnapshot({ ...stateSnapshotRef.current });
    } else {
      onRallyEnd(pointTeam, reason);
    }
  }, [confirmPointAssignment, onRallyEnd]);

  const commitPendingTouch = useCallback((input: { nextPlayerId?: string; nextTeamSide?: TeamSide } = {}) => {
    if (!pendingTouch) {
      return;
    }

    commitTouches([pendingTouch]);

    if (input.nextPlayerId && input.nextTeamSide) {
      setSelectedPlayerId(input.nextPlayerId);
      setSelectedTeamSide(input.nextTeamSide);
    }

    const result = resolveEvaluationFlow(pendingTouch);
    if (result.kind === 'rally_ended') {
      showRallyEndPreview(result.preview.pointTeam, result.preview.reason);
      return;
    }

    setRallyEndPreview(null);
  }, [commitTouches, pendingTouch, showRallyEndPreview]);

  const handleZoneSnap = useCallback((
    zone: ScoutingZone,
    destinationPoint?: CourtCoordinate,
    ballDirection?: BallDirection,
  ) => {
    if (aceVictimSelection || blockerSelection || awaitingReceiverSelection || awaitingAttackerContext) {
      return;
    }

    onSelectedZoneChange(zone);

    if (zone.kind === 'serve_start') {
      return;
    }

    setPendingBallPosition(destinationPoint ?? zone.center);
    setSkillWasSelected(false);
    setEvaluationWasSelected(false);
    const touchDirection = createTouchDirectionForZone(ballDirection, zone);

    if (zone.kind !== 'in_court') {
      const releaseDestinationPoint = touchDirection?.end ?? destinationPoint ?? zone.center;
      const isOpeningServeRelease = (
        currentRallyTouches.length === 0
        && Boolean(servingTeam)
        && Boolean(servingPlayerId)
      );

      if (isOpeningServeRelease && servingTeam && servingPlayerId && touchDirection) {
        const serveTrajectory = createBallTrajectory({
          teamSide: servingTeam,
          skill: 'serve',
          evaluation: '=',
          direction: touchDirection,
        });
        const serveErrorTouch = buildServeErrorConfirmationTouch({
          zone,
          destinationPoint: releaseDestinationPoint,
          servingTeam,
          servingPlayerId,
          serveDirection: touchDirection,
          serveTrajectory,
        });

        setPendingTouch(applyPendingTouchModifiers(serveErrorTouch));
        setPendingBallPosition(releaseDestinationPoint);
        setPendingTrajectory(serveErrorTouch.trajectory ?? serveTrajectory);
        setSelectedPlayerId(servingPlayerId);
        setSelectedTeamSide(servingTeam);
        setPopupAnchor(releaseDestinationPoint);
        setRallyEndPreview(null);
        return;
      }

      setPendingTrajectory(null);
      setPopupAnchor(null);
      return;
    }

    const releaseDestinationPoint = touchDirection?.end ?? destinationPoint ?? zone.center;
    const touchDestinationPoint = destinationPoint ?? zone.center;
    const isOpeningServeRelease = (
      currentRallyTouches.length === 0
      && Boolean(servingTeam)
      && Boolean(servingPlayerId)
    );

    if (isOpeningServeRelease && servingTeam && servingPlayerId) {
      const receiveEvaluation = isReceptionDrivenServePendingTouch(pendingTouch)
        ? pendingTouch?.evaluation ?? getDefaultEvaluationForSkill('receive')
        : getDefaultEvaluationForSkill('receive');
      const serveTrajectory = touchDirection
        ? createBallTrajectory({
            teamSide: servingTeam,
            skill: 'serve',
            evaluation: RECEIVE_TO_SERVE_EVALUATION[receiveEvaluation],
            direction: touchDirection,
          })
        : null;

      if (!isServeReleaseInReceivingCourt({ destinationPoint: releaseDestinationPoint, servingTeam, receivingZone: zone })) {
        const serveErrorTouch = buildServeErrorConfirmationTouch({
          zone,
          destinationPoint: releaseDestinationPoint,
          servingTeam,
          servingPlayerId,
          serveDirection: touchDirection,
          serveTrajectory,
        });

        setPendingTouch(applyPendingTouchModifiers(serveErrorTouch));
        setPendingBallPosition(releaseDestinationPoint);
        setPendingTrajectory(serveErrorTouch.trajectory ?? serveTrajectory);
        setSelectedPlayerId(servingPlayerId);
        setSelectedTeamSide(servingTeam);
        setPopupAnchor(releaseDestinationPoint);
        setRallyEndPreview(null);
        return;
      }

      const receivingTeam = getOppositeTeamSide(servingTeam);
      setAwaitingReceiverSelection(true);
      setAwaitingReceiverContext({
        zone,
        destinationPoint: releaseDestinationPoint,
        servingTeam,
        servingPlayerId,
        serveDirection: touchDirection,
        serveTrajectory,
        receivingTeam,
      });
      setPendingTouch(null);
      setPendingBallPosition(releaseDestinationPoint);
      setPendingTrajectory(serveTrajectory);
      setSelectedPlayerId(null);
      setSelectedTeamSide(receivingTeam);
      setPopupAnchor(null);
      setRallyEndPreview(null);
      return;
    }

    // Post-reception/general: drag across net → awaiting_attacker
    if (
      currentRallyTouches.length > 0
      && touchDirection
      && zone.kind === 'in_court'
      && previousTouch
      && previousTouch.evaluation !== '='
      && previousTouch.evaluation !== '/'
    ) {
      const possessionTeam = previousTouch.teamSide;
      const isOpponentCourt = zone.teamSide !== possessionTeam;
      const isOnNet = isBallReleaseOnNet(releaseDestinationPoint);

      if (isOpponentCourt || isOnNet) {
        const attackEval = isOnNet ? '/' as const : '+' as const;
        const attackTrajectory = createBallTrajectory({
          teamSide: possessionTeam,
          skill: 'attack',
          evaluation: attackEval,
          direction: touchDirection,
        });

        if (pendingTouch && isReceptionDrivenServePendingTouch(pendingTouch)) {
          const receiveEval = pendingTouch.evaluation ?? getDefaultEvaluationForSkill('receive');
          const updatedReceive = updatePendingTouchEvaluation(pendingTouch, receiveEval);
          const result = resolveReceptionDrivenServeEvaluationFlow(updatedReceive);
          if (result && result.kind !== 'rally_ended') {
            const isGoodReception = receiveEval === '#' || receiveEval === '+';
            const setterPlayer = teamPlayersBySide[possessionTeam]?.find((p) => p.isSetter);
            const inferredSetTouches: PendingTouch[] = [];
            if (setterPlayer) {
              const inCourtZones = courtZones?.filter((z) => z.kind === 'in_court' && z.teamSide === possessionTeam) ?? [];
              const setterZone = inCourtZones.length > 0
                ? inCourtZones.reduce<ScoutingZone>((nearest, z2) => {
                    const d1 = Math.hypot(z2.center.x - setterPlayer.x, z2.center.y - setterPlayer.y);
                    const d2 = Math.hypot(nearest.center.x - setterPlayer.x, nearest.center.y - setterPlayer.y);
                    return d1 < d2 ? z2 : nearest;
                  }, inCourtZones[0])
                : null;
              if (setterZone) {
                inferredSetTouches.push({
                  playerId: setterPlayer.playerId, teamSide: possessionTeam, skill: 'set', zone: setterZone,
                  evaluation: '+', setterCallCode: isGoodReception ? 'K1' : undefined,
                  destinationPoint: { x: setterPlayer.x, y: setterPlayer.y },
                  source: 'inferred', touchOrigin: 'implicit_inference', inferenceReason: 'setter_after_receive',
                });
              }
            }
            commitTouches([...result.touches, ...inferredSetTouches]);
          }
        }

        setAwaitingAttackerContext({
          zone, destinationPoint: releaseDestinationPoint, attackingTeam: possessionTeam,
          ballDirection: touchDirection, trajectory: attackTrajectory,
        });
        setPendingTouch(null);
        setPendingBallPosition(releaseDestinationPoint);
        setPendingTrajectory(attackTrajectory);
        setSelectedPlayerId(null);
        setSelectedTeamSide(possessionTeam);
        setPopupAnchor(null);
        setRallyEndPreview(null);
        return;
      }
    }

    // Post-reception: if the ball is dragged toward the setter, auto-select setter with skill=set.
    if (
      !pendingTouch
      && !selectedPlayerId
      && previousTouch?.skill === 'receive'
      && previousTouch.evaluation !== '='
      && previousTouch.evaluation !== '/'
      && zone.kind === 'in_court'
      && zone.teamSide === previousTouch.teamSide
    ) {
      const setterPlayer = teamPlayersBySide[previousTouch.teamSide]?.find((p) => p.isSetter);
      if (setterPlayer && isReceivingPlayerCloseEnoughForAutoSelection({
        destinationPoint: releaseDestinationPoint,
        receiver: setterPlayer,
        maxDistance: MAX_AUTO_RECEIVER_STAGE_DISTANCE,
      })) {
        const setterTouch = applyPendingTouchModifiers({
          playerId: setterPlayer.playerId,
          teamSide: previousTouch.teamSide,
          skill: 'set',
          zone,
          evaluation: '+',
          destinationPoint: touchDestinationPoint,
          source: 'explicit',
          touchOrigin: 'live_scouting',
        });
        setPendingTouch(setterTouch);
        setPendingTrajectory(null);
        setSelectedPlayerId(setterPlayer.playerId);
        setSelectedTeamSide(previousTouch.teamSide);
        setPopupAnchor(zone.center);
        setRallyEndPreview(null);
        return;
      }
    }

    const nextPendingTouch = buildPendingTouchForZone({
      zone,
      pendingTouch,
      previousTouch,
      servingTeam,
      servingPlayerId,
      selectedPlayerId,
      selectedTeamSide,
      scoutingMode: normalizedMode,
      teamPlayersBySide,
    });

    if (!nextPendingTouch) {
      setPendingTrajectory(null);
      setPopupAnchor(null);
      return;
    }

    const touchTrajectory = touchDirection
      ? createBallTrajectory({
          teamSide: nextPendingTouch.teamSide,
          skill: nextPendingTouch.skill,
          evaluation: nextPendingTouch.evaluation,
          direction: touchDirection,
        })
      : null;

    const nextTypedPendingTouch = applyPendingTouchModifiers({
      ...nextPendingTouch,
      destinationPoint: touchDestinationPoint,
      ballDirection: touchDirection,
      trajectory: touchTrajectory ?? undefined,
    });
    setPendingTouch(nextTypedPendingTouch);
    setPendingTrajectory(touchTrajectory);
    setSelectedPlayerId(nextTypedPendingTouch.playerId ?? null);
    setSelectedTeamSide(nextTypedPendingTouch.teamSide);
    setPopupAnchor(zone.center);
    setRallyEndPreview(null);
  }, [
    aceVictimSelection,
    awaitingReceiverSelection,
    blockerSelection,
    onSelectedZoneChange,
    pendingTouch,
    previousTouch,
    selectedPlayerId,
    selectedTeamSide,
    servingPlayerId,
    servingTeam,
    normalizedMode,
    teamPlayersBySide,
    currentRallyTouches.length,
    applyPendingTouchModifiers,
  ]);

  const syncPendingTouchSelection = useCallback((nextPlayerId: string, nextTeamSide: TeamSide) => {
    setSelectedPlayerId(nextPlayerId);
    setSelectedTeamSide(nextTeamSide);
    setSkillWasSelected(false);
    setEvaluationWasSelected(false);
    setPendingTouch((currentPendingTouch) => (
      currentPendingTouch
        ? updatePendingTouchSelection(currentPendingTouch, nextPlayerId, nextTeamSide)
        : currentPendingTouch
    ));
    setPendingTrajectory((currentTrajectory) => (
      currentTrajectory
        ? isReceptionDrivenServePendingTouch(pendingTouch)
          ? currentTrajectory
          : updateBallTrajectoryMetadata(currentTrajectory, { teamSide: nextTeamSide })
        : currentTrajectory
    ));
    setRallyEndPreview(null);
  }, [pendingTouch]);

  const handlePlayerSelection = useCallback((playerId: string, teamSide: TeamSide) => {
    if (blockerSelection) {
      const resolvedBlock = resolveAttackBlockerSelection({
        selection: blockerSelection,
        playerId,
        teamSide,
        teamPlayersBySide,
      });

      if (!resolvedBlock) {
        return;
      }

      setSelectedPlayerId(playerId);
      setSelectedTeamSide(teamSide);
      setBlockerSelection(null);
      setAceVictimSelection(null);
      setRallyEndPreview(null);
      setPendingBallPosition(null);
      setPendingTrajectory(null);
      setSkillWasSelected(false);
      setEvaluationWasSelected(false);
      commitTouches(resolvedBlock.touches);
      showRallyEndPreview(resolvedBlock.pointTeam, resolvedBlock.reason);
      return;
    }

    if (aceVictimSelection) {
      const resolvedAce = resolveAceVictimFlow({
        selection: aceVictimSelection,
        playerId,
        teamSide,
      });

      if (!resolvedAce) {
        return;
      }

      setSelectedPlayerId(playerId);
      setSelectedTeamSide(teamSide);
      setAceVictimSelection(null);
      setRallyEndPreview(null);
      setPendingBallPosition(null);
      setSkillWasSelected(false);
      setEvaluationWasSelected(false);
      commitTouches(resolvedAce.touches);
      showRallyEndPreview(resolvedAce.pointTeam, resolvedAce.reason);
      return;
    }

    // Awaiting attacker: user taps who attacked after dragging across net
    if (awaitingAttackerContext) {
      if (teamSide !== awaitingAttackerContext.attackingTeam) return;

      const player = teamPlayersBySide[teamSide]?.find((p) => p.playerId === playerId);
      if (!player) return;

      const inCourtZones = courtZones?.filter((z) => z.kind === 'in_court' && z.teamSide === teamSide) ?? [];
      const nearestZone = inCourtZones.length > 0
        ? inCourtZones.reduce<ScoutingZone>((nearest, z2) => {
            const d1 = Math.hypot(z2.center.x - player.x, z2.center.y - player.y);
            const d2 = Math.hypot(nearest.center.x - player.x, nearest.center.y - player.y);
            return d1 < d2 ? z2 : nearest;
          }, inCourtZones[0])
        : awaitingAttackerContext.zone;

      const lastTouch = currentRallyTouches.at(-1);
      const isAfterGoodReception = lastTouch?.skill === 'receive'
        ? (lastTouch.evaluation === '#' || lastTouch.evaluation === '+')
        : (lastTouch?.skill === 'set');

      const isOnNet = isBallReleaseOnNet(awaitingAttackerContext.destinationPoint);
      const attackEval = isOnNet ? '/' as const : '+' as const;

      const attackTouch: PendingTouch = {
        playerId,
        teamSide,
        skill: 'attack',
        zone: awaitingAttackerContext.zone,
        evaluation: attackEval,
        destinationPoint: awaitingAttackerContext.destinationPoint,
        ballDirection: awaitingAttackerContext.ballDirection ?? undefined,
        trajectory: awaitingAttackerContext.trajectory ?? undefined,
        startZoneCode: getZoneCode({
          teamSide: nearestZone.teamSide, zoneId: nearestZone.id,
          gridCoordinate: nearestZone.gridCoordinate, point: nearestZone.center,
        }),
        combinationCode: isAfterGoodReception ? 'K1' : undefined,
        source: 'explicit',
        touchOrigin: 'live_scouting',
      };

      setPendingTouch(attackTouch);
      setSelectedPlayerId(playerId);
      setSelectedTeamSide(teamSide);
      setAwaitingAttackerContext(null);
      setSkillWasSelected(false);
      setEvaluationWasSelected(false);
      setPopupAnchor(awaitingAttackerContext.zone.center);
      setRallyEndPreview(null);
      return;
    }

    if (awaitingReceiverSelection && awaitingReceiverContext) {
      if (teamSide !== awaitingReceiverContext.receivingTeam) {
        return;
      }

      const receptionTouch = applyPendingTouchModifiers(buildReceptionTouchForSelectedPlayer({
        zone: awaitingReceiverContext.zone,
        destinationPoint: awaitingReceiverContext.destinationPoint,
        servingTeam: awaitingReceiverContext.servingTeam,
        servingPlayerId: awaitingReceiverContext.servingPlayerId,
        playerId,
        receivingTeam: awaitingReceiverContext.receivingTeam,
        serveDirection: awaitingReceiverContext.serveDirection,
        serveTrajectory: awaitingReceiverContext.serveTrajectory,
      }));

      setPendingTouch(receptionTouch);
      setSelectedPlayerId(playerId);
      setSelectedTeamSide(teamSide);
      setPopupAnchor(awaitingReceiverContext.zone.center);
      setAwaitingReceiverSelection(false);
      setAwaitingReceiverContext(null);
      setSkillWasSelected(false);
      setEvaluationWasSelected(false);
      setRallyEndPreview(null);
      const ballTarget = courtZones
        ? getReceptionBallTarget(getDefaultEvaluationForSkill('receive'), awaitingReceiverContext.receivingTeam, courtZones)
        : null;
      if (ballTarget) {
        setPendingBallPosition(ballTarget);
      }
      return;
    }

    if (pendingTouch) {
      if (isReceptionDrivenServePendingTouch(pendingTouch)) {
        if (!canSelectReceptionDrivenServeReceiver(pendingTouch, teamSide)) {
          return;
        }

        syncPendingTouchSelection(playerId, teamSide);
        return;
      }

      if (isServeErrorConfirmationPendingTouch(pendingTouch, servingTeam) && servingTeam && teamSide !== servingTeam) {
        const manualReceiveTouch = buildManualServeReceiveTouchFromServeError({
          serveErrorTouch: pendingTouch,
          playerId,
          teamSide,
        });

        if (!manualReceiveTouch) {
          return;
        }

        setSelectedPlayerId(playerId);
        setSelectedTeamSide(teamSide);
        setPendingTouch(manualReceiveTouch);
        setPendingTrajectory(pendingTouch.trajectory ?? null);
        setSkillWasSelected(false);
        setEvaluationWasSelected(false);
        setRallyEndPreview(null);
        return;
      }

      if (pendingTouch.source === 'inferred' && pendingTouch.teamSide === teamSide && !pendingTouch.playerId) {
        syncPendingTouchSelection(playerId, teamSide);
        return;
      }

      if (canCommitWithDefaults) {
        commitPendingTouch({ nextPlayerId: playerId, nextTeamSide: teamSide });
      }
      return;
    }

    // Post-reception or post-set: tapping a player auto-creates a touch at the player's position.
    // After receive: setter → skill=set with K1, other player → skill=attack with K1 + auto-insert inferred set.
    // After set: always skill=attack with K1.
    if (
      (previousTouch?.skill === 'receive' || previousTouch?.skill === 'set')
      && previousTouch.evaluation !== '='
      && previousTouch.evaluation !== '/'
      && teamSide === previousTouch.teamSide
      && courtZones?.length
    ) {
      const player = teamPlayersBySide[teamSide]?.find((p) => p.playerId === playerId);
      if (player) {
        const skill: SkillType = previousTouch.skill === 'set'
          ? 'attack'
          : (player.isSetter ? 'set' : 'attack');
        const inCourtZones = courtZones.filter((z) => z.kind === 'in_court' && z.teamSide === teamSide);
        const nearestZone = inCourtZones.length > 0
          ? inCourtZones.reduce<ScoutingZone>((nearest, zone) => {
              const d1 = Math.hypot(zone.center.x - player.x, zone.center.y - player.y);
              const d2 = Math.hypot(nearest.center.x - player.x, nearest.center.y - player.y);
              return d1 < d2 ? zone : nearest;
            }, inCourtZones[0])
          : null;
        if (nearestZone) {
          const startZoneCode = getZoneCode({
            teamSide: nearestZone.teamSide,
            zoneId: nearestZone.id,
            gridCoordinate: nearestZone.gridCoordinate,
            point: nearestZone.center,
          });

          const isGoodReception = previousTouch.skill === 'receive'
            && (previousTouch.evaluation === '#' || previousTouch.evaluation === '+');

          if (skill === 'attack' && previousTouch.skill === 'receive') {
            const setterPlayer = teamPlayersBySide[teamSide]?.find((p) => p.isSetter);
            if (setterPlayer) {
              const setterZone = inCourtZones.reduce<ScoutingZone>((nearest, zone) => {
                const d1 = Math.hypot(zone.center.x - setterPlayer.x, zone.center.y - setterPlayer.y);
                const d2 = Math.hypot(nearest.center.x - setterPlayer.x, nearest.center.y - setterPlayer.y);
                return d1 < d2 ? zone : nearest;
              }, inCourtZones[0]);
              const inferredSetTouch: PendingTouch = {
                playerId: setterPlayer.playerId,
                teamSide,
                skill: 'set',
                zone: setterZone,
                evaluation: '+',
                setterCallCode: isGoodReception ? 'K1' : undefined,
                destinationPoint: { x: setterPlayer.x, y: setterPlayer.y },
                source: 'inferred',
                touchOrigin: 'implicit_inference',
                inferenceReason: 'setter_after_receive',
              };
              commitTouches([inferredSetTouch]);
            }
          }

          const autoTouch = applyPendingTouchModifiers({
            playerId,
            teamSide,
            skill,
            zone: nearestZone,
            evaluation: '+',
            destinationPoint: { x: player.x, y: player.y },
            startZoneCode,
            setterCallCode: skill === 'set' ? 'K1' : undefined,
            combinationCode: skill === 'attack' && (previousTouch.skill === 'set' || isGoodReception) ? 'K1' : undefined,
            source: 'explicit',
            touchOrigin: 'live_scouting',
          });
          setPendingTouch(autoTouch);
          setPendingBallPosition({ x: player.x, y: player.y });
          setSelectedPlayerId(playerId);
          setSelectedTeamSide(teamSide);
          setSkillWasSelected(false);
          setEvaluationWasSelected(false);
          setRallyEndPreview(null);
          return;
        }
      }
    }

    setSelectedPlayerId(playerId);
    setSelectedTeamSide(teamSide);
    setSkillWasSelected(false);
    setEvaluationWasSelected(false);
    setRallyEndPreview(null);
    if (currentRallyTouches.length > 0) {
      const selectedPlayer = teamPlayersBySide[teamSide]?.find((p) => p.playerId === playerId);
      if (selectedPlayer) {
        setPendingBallPosition({ x: selectedPlayer.x, y: selectedPlayer.y });
      }
    }
  }, [
    aceVictimSelection,
    applyPendingTouchModifiers,
    awaitingReceiverContext,
    awaitingReceiverSelection,
    blockerSelection,
    canCommitWithDefaults,
    commitPendingTouch,
    commitTouches,
    courtZones,
    pendingTouch,
    previousTouch,
    servingTeam,
    showRallyEndPreview,
    syncPendingTouchSelection,
    teamPlayersBySide,
  ]);

  const handleEvaluationChange = useCallback((evaluation: SkillEvaluation) => {
    if (!pendingTouch) {
      return;
    }

    const nextPendingTouch = updatePendingTouchEvaluation(pendingTouch, evaluation);

    const nextBlockerSelection = createAttackBlockerSelection(nextPendingTouch, normalizedMode);
    if (nextBlockerSelection) {
      setPendingTouch(null);
      setPendingBallPosition(null);
      setPendingTrajectory(nextPendingTouch.trajectory ?? null);
      setPopupAnchor(null);
      setSelectedPlayerId(null);
      setSelectedTeamSide(nextBlockerSelection.blockingTeam);
      setAceVictimSelection(null);
      setBlockerSelection(nextBlockerSelection);
      setSkillWasSelected(false);
      setEvaluationWasSelected(false);
      setRallyEndPreview(null);
      return;
    }

    if (isReceptionDrivenServePendingTouch(nextPendingTouch)) {
      const ballTarget = courtZones
        ? getReceptionBallTarget(evaluation, nextPendingTouch.teamSide, courtZones)
        : null;
      if (ballTarget) {
        setPendingBallPosition(ballTarget);
      }

      const result = resolveReceptionDrivenServeEvaluationFlow(nextPendingTouch);
      if (!result) {
        return;
      }

      commitTouches(result.touches);
      if (result.kind === 'rally_ended') {
        showRallyEndPreview(result.preview.pointTeam, result.preview.reason);
        return;
      }

      setRallyEndPreview(null);
      return;
    }

    const result = resolveLiveEvaluationAction(nextPendingTouch);

    if (result.kind === 'awaiting_ace_target') {
      setPendingTouch(null);
      setPendingBallPosition(null);
      setPendingTrajectory(nextPendingTouch.trajectory ?? null);
      setPopupAnchor(null);
      setSelectedPlayerId(null);
      setSelectedTeamSide(result.selection.receivingTeam);
      setAceVictimSelection(result.selection);
      setBlockerSelection(null);
      setSkillWasSelected(false);
      setEvaluationWasSelected(false);
      setRallyEndPreview(null);
      return;
    }

    if (result.kind === 'rally_ended') {
      commitTouches(result.touches);
      showRallyEndPreview(result.preview.pointTeam, result.preview.reason);
      return;
    }

    commitTouches(result.touches);
    setRallyEndPreview(null);
  }, [commitTouches, courtZones, normalizedMode, pendingTouch, showRallyEndPreview]);

  const handleSkillChange = useCallback((skill: SkillType) => {
    if (forceSkill) {
      return;
    }

    setPendingTouch((currentPendingTouch) => (
      currentPendingTouch
        ? applyPendingTouchModifiers(updatePendingTouchSkill(currentPendingTouch, skill))
        : currentPendingTouch
    ));
    setPendingTrajectory((currentTrajectory) => (
      currentTrajectory
        ? updateBallTrajectoryMetadata(currentTrajectory, {
            skill,
            evaluation: getDefaultEvaluationForSkill(skill),
          })
        : currentTrajectory
    ));
    setSkillWasSelected(true);
    setEvaluationWasSelected(false);
    setRallyEndPreview(null);
  }, [applyPendingTouchModifiers, forceSkill]);

  const handleBallTypeCodeChange = useCallback((code: DataVolleyBallTypeCode) => {
    setPendingTouch((currentPendingTouch) => (
      currentPendingTouch
        ? updatePendingTouchBallTypeCode(currentPendingTouch, code)
        : currentPendingTouch
    ));
    setRallyEndPreview(null);
  }, []);

  const handleNumBlockersChange = useCallback((numBlockers: NumBlockers) => {
    setPendingTouch((currentPendingTouch) => (
      currentPendingTouch
        ? updatePendingTouchNumBlockers(currentPendingTouch, numBlockers)
        : currentPendingTouch
    ));
    setRallyEndPreview(null);
  }, []);

  const handleBallPositionChange = useCallback((position: CourtCoordinate) => {
    setPendingBallPosition(position);
  }, []);

  const handlePopupTeamChange = useCallback((nextTeamSide: TeamSide) => {
    const nextPlayers = teamPlayersBySide[nextTeamSide];
    if (nextPlayers.length === 0) {
      return;
    }

    const matchingPlayer = nextPlayers.find((player) => player.playerId === selectedPlayerId) ?? nextPlayers[0];
    syncPendingTouchSelection(matchingPlayer.playerId, nextTeamSide);
  }, [selectedPlayerId, syncPendingTouchSelection, teamPlayersBySide]);

  const handlePopupPlayerChange = useCallback((nextPlayerId: string) => {
    if (!selectedTeamSide) {
      return;
    }

    syncPendingTouchSelection(nextPlayerId, selectedTeamSide);
  }, [selectedTeamSide, syncPendingTouchSelection]);

  const handleRallyEndConfirm = useCallback(() => {
    if (!rallyEndPreview) {
      return;
    }

    onRallyEnd(rallyEndPreview.pointTeam, rallyEndPreview.reason);
    setRallyEndPreview(null);
    setPendingDecisionSnapshot(null);
  }, [onRallyEnd, rallyEndPreview]);

  // ── Rally end declined: reopen the same evaluation decision ────────────────
  const handleRallyEndChangeEvaluation = useCallback(() => {
    if (!rallyEndPreview) return;
    onUndoLastAction?.();
    const snapshot = pendingDecisionSnapshot;
    if (snapshot) {
      setSelectedPlayerId(snapshot.selectedPlayerId);
      setSelectedTeamSide(snapshot.selectedTeamSide);
      setPendingTouch(snapshot.pendingTouch);
      setPendingBallPosition(snapshot.pendingBallPosition);
      setPendingTrajectory(snapshot.pendingTrajectory);
      setPopupAnchor(snapshot.popupAnchor);
      setAceVictimSelection(snapshot.aceVictimSelection);
      setBlockerSelection(snapshot.blockerSelection);
      setSkillWasSelected(snapshot.skillWasSelected);
      setEvaluationWasSelected(snapshot.evaluationWasSelected);
      setAwaitingReceiverSelection(snapshot.awaitingReceiverSelection);
      setAwaitingReceiverContext(snapshot.awaitingReceiverContext);
      setAwaitingAttackerContext(snapshot.awaitingAttackerContext);
    }
    setRallyEndPreview(null);
    setPendingDecisionSnapshot(null);
  }, [onUndoLastAction, pendingDecisionSnapshot, rallyEndPreview]);

  // ── Rally end declined: cancel the action entirely ──────────────────────────
  const handleRallyEndCancel = useCallback(() => {
    if (!rallyEndPreview) return;
    onUndoLastAction?.();
    setSelectedPlayerId(null);
    setSelectedTeamSide(null);
    setPendingTouch(null);
    setPendingBallPosition(null);
    setPendingTrajectory(null);
    setPopupAnchor(null);
    setAceVictimSelection(null);
    setBlockerSelection(null);
    setSkillWasSelected(false);
    setEvaluationWasSelected(false);
    setAwaitingReceiverSelection(false);
    setAwaitingReceiverContext(null);
    setAwaitingAttackerContext(null);
    setRallyEndPreview(null);
    setPendingDecisionSnapshot(null);
  }, [onUndoLastAction, rallyEndPreview]);

  const liveInputState = createLiveInputState({
    selectedPlayerId,
    selectedTeamSide,
    pendingBallPosition,
    pendingTouch,
    aceVictimSelection,
    blockerSelection,
    skillWasSelected,
    evaluationWasSelected,
    forceSkill,
    scoutingMode: normalizedMode,
  });

  return {
    selectedPlayerId,
    selectedTeamSide,
    pendingBallPosition,
    pendingTrajectory,
    pendingTouch,
    popupAnchor,
    rallyEndPreview,
    aceVictimSelection,
    blockerSelection,
    awaitingReceiverSelection,
    awaitingReceiverContext,
    awaitingAttackerContext,
    forceSkill,
    liveInputState,
    selectableBlockerPlayerKeys: blockerSelection
      ? getValidAttackBlockers({ selection: blockerSelection, teamPlayersBySide }).map((player) => (
          getTeamScopedPlayerKey(blockerSelection.blockingTeam, player.playerId)
        ))
      : null,
    handleZoneSnap,
    handlePlayerSelection,
    handleBallPositionChange,
    handleBallTypeCodeChange,
    handleNumBlockersChange,
    handleCombinationCodeChange: (code: string) => {
      setPendingTouch((current) => {
        if (!current) return current;
        return {
          ...current,
          setterCallCode: current.skill === 'set' ? code : undefined,
          combinationCode: current.skill === 'attack' ? code : undefined,
        };
      });
    },
    handleEvaluationChange,
    handleSkillChange,
    handlePopupTeamChange,
    handlePopupPlayerChange,
    handleRallyEndConfirm,
    handleRallyEndChangeEvaluation,
    handleRallyEndCancel,
  };
}
