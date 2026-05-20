import { useCallback, useEffect, useState } from 'react';
import { create } from 'zustand';
import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { ScoutingMode } from '@src/domain/scouting/types';
import type { ScoutingZone } from '@src/domain/spatial';
import type { BallTouch } from '@src/domain/touch/types';
import {
  createBallTrajectory,
  updateBallTrajectoryMetadata,
  type BallTrajectory,
  type BallTrajectoryPoint,
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
  buildServeErrorConfirmationTouch,
  canSelectReceptionDrivenServeReceiver,
  buildPendingTouchForZone,
  isReceptionDrivenServePendingTouch,
  isServeReleaseInReceivingCourt,
  resolveAceVictimFlow,
  resolveEvaluationFlow,
  resolveReceptionDrivenServeEvaluationFlow,
  updatePendingTouchEvaluation,
  updatePendingTouchSelection,
  updatePendingTouchSkill,
  type AceVictimSelection,
  type CourtCoordinate,
  type RallyEndPreview,
  type TeamTacticalPlayers,
} from '../rally/rally-flow';
import { getTeamScopedPlayerKey } from '../tactical/player-identity';
import { DEFAULT_SCOUTING_MODE, normalizeScoutingMode } from '../../model/scouting-mode';
import {
  canCommitPendingTouchWithDefaults,
  getScoutingModeConfig,
  type ScoutingModeInputRequirements,
} from '../../model/scouting-mode-config';

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
  skillWasSelected?: boolean;
  evaluationWasSelected?: boolean;
  forceSkill?: boolean;
  scoutingMode?: ScoutingMode;
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
  onSelectedZoneChange: (zone: ScoutingZone | null) => void;
  onTouchesCommitted: (touches: PendingTouch[]) => void;
  onRallyEnd: (pointTeam: TeamSide, reason?: string) => void;
  onAceVictimSelectionChange?: (isSelecting: boolean) => void;
};

export function useLiveTouchFlowController({
  currentRallyTouches,
  teamPlayersBySide,
  servingTeam,
  servingPlayerId,
  isRallyActive,
  scoutingMode = DEFAULT_SCOUTING_MODE,
  onSelectedZoneChange,
  onTouchesCommitted,
  onRallyEnd,
  onAceVictimSelectionChange,
}: LiveTouchFlowControllerInput) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedTeamSide, setSelectedTeamSide] = useState<TeamSide | null>(null);
  const [pendingTouch, setPendingTouch] = useState<PendingTouch | null>(null);
  const [pendingBallPosition, setPendingBallPosition] = useState<CourtCoordinate | null>(null);
  const [pendingTrajectory, setPendingTrajectory] = useState<BallTrajectory | null>(null);
  const [popupAnchor, setPopupAnchor] = useState<CourtCoordinate | null>(null);
  const [rallyEndPreview, setRallyEndPreview] = useState<RallyEndPreview | null>(null);
  const [aceVictimSelection, setAceVictimSelection] = useState<AceVictimSelection | null>(null);
  const [skillWasSelected, setSkillWasSelected] = useState(false);
  const [evaluationWasSelected, setEvaluationWasSelected] = useState(false);
  const previousTouch = currentRallyTouches.at(-1);
  const forceSkill = currentRallyTouches.length === 0 && (
    pendingTouch?.skill === 'serve'
    || isReceptionDrivenServePendingTouch(pendingTouch)
  );
  const normalizedMode = normalizeScoutingMode(scoutingMode);
  const canCommitWithDefaults = canCommitPendingTouchWithDefaults(normalizedMode);

  useEffect(() => {
    if (!servingPlayerId || !servingTeam || selectedPlayerId || pendingTouch) {
      return;
    }

    if (currentRallyTouches.length > 0) {
      return;
    }

    setSelectedPlayerId(servingPlayerId);
    setSelectedTeamSide(servingTeam);
  }, [currentRallyTouches.length, pendingTouch, selectedPlayerId, servingPlayerId, servingTeam]);

  useEffect(() => {
    if (!isRallyActive) {
      setSelectedPlayerId(servingPlayerId ?? null);
      setSelectedTeamSide(servingTeam ?? null);
      setPendingTouch(null);
      setPendingBallPosition(null);
      setPendingTrajectory(null);
      setPopupAnchor(null);
      setRallyEndPreview(null);
      setAceVictimSelection(null);
      setSkillWasSelected(false);
      setEvaluationWasSelected(false);
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
  }, [onTouchesCommitted]);

  const queueImplicitPendingTouch = useCallback((committedTouches: PendingTouch[]) => {
    const committedTouch = committedTouches.at(-1);
    if (!committedTouch || committedTouch.source === 'inferred') {
      return;
    }

    const inferredPendingTouch = buildNextPendingTouch({
      zone: committedTouch.zone,
      previousTouch: committedTouch,
      scoutingMode: normalizedMode,
      teamPlayersBySide,
    });

    if (!inferredPendingTouch || inferredPendingTouch.source !== 'inferred') {
      return;
    }

    setPendingTouch(inferredPendingTouch);
    setPendingBallPosition(committedTouch.destinationPoint ?? committedTouch.zone.center);
    setPendingTrajectory(null);
    setPopupAnchor(null);
    setSelectedPlayerId(inferredPendingTouch.playerId ?? null);
    setSelectedTeamSide(inferredPendingTouch.teamSide);
    setSkillWasSelected(false);
    setEvaluationWasSelected(false);
  }, [normalizedMode, teamPlayersBySide]);

  const showRallyEndPreview = useCallback((pointTeam: TeamSide, reason: string) => {
    setRallyEndPreview({ pointTeam, reason });
  }, []);

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
    trajectoryPoints?: BallTrajectoryPoint[],
  ) => {
    if (aceVictimSelection) {
      return;
    }

    onSelectedZoneChange(zone);
    setPendingBallPosition(destinationPoint ?? zone.center);
    setSkillWasSelected(false);
    setEvaluationWasSelected(false);

    if (zone.kind !== 'in_court') {
      const releaseDestinationPoint = trajectoryPoints?.at(-1) ?? destinationPoint ?? zone.center;
      const isOpeningServeRelease = (
        currentRallyTouches.length === 0
        && Boolean(servingTeam)
        && Boolean(servingPlayerId)
      );

      if (isOpeningServeRelease && servingTeam && servingPlayerId && trajectoryPoints) {
        const serveTrajectory = trajectoryPoints
          ? createBallTrajectory({
              teamSide: servingTeam,
              skill: 'serve',
              evaluation: '=',
              points: trajectoryPoints,
            })
          : null;
        const serveErrorTouch = buildServeErrorConfirmationTouch({
          zone,
          destinationPoint: releaseDestinationPoint,
          servingTeam,
          servingPlayerId,
          serveTrajectory,
        });

        setPendingTouch(serveErrorTouch);
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

    const releaseDestinationPoint = trajectoryPoints?.at(-1) ?? destinationPoint ?? zone.center;
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
      const serveTrajectory = trajectoryPoints
        ? createBallTrajectory({
            teamSide: servingTeam,
            skill: 'serve',
            evaluation: RECEIVE_TO_SERVE_EVALUATION[receiveEvaluation],
            points: trajectoryPoints,
          })
        : null;

      if (!isServeReleaseInReceivingCourt({ destinationPoint: releaseDestinationPoint, servingTeam })) {
        const serveErrorTouch = buildServeErrorConfirmationTouch({
          zone,
          destinationPoint: releaseDestinationPoint,
          servingTeam,
          servingPlayerId,
          serveTrajectory,
        });

        setPendingTouch(serveErrorTouch);
        setPendingBallPosition(releaseDestinationPoint);
        setPendingTrajectory(serveErrorTouch.trajectory ?? serveTrajectory);
        setSelectedPlayerId(servingPlayerId);
        setSelectedTeamSide(servingTeam);
        setPopupAnchor(releaseDestinationPoint);
        setRallyEndPreview(null);
        return;
      }

      const receptionDrivenTouch = buildReceptionDrivenServeReceiveTouch({
        zone,
        destinationPoint: releaseDestinationPoint,
        servingTeam,
        servingPlayerId,
        teamPlayersBySide,
        evaluation: receiveEvaluation,
        serveTrajectory,
      });

      if (!receptionDrivenTouch) {
        setPendingTrajectory(null);
        setPopupAnchor(null);
        return;
      }

      setPendingTouch(receptionDrivenTouch);
      setPendingBallPosition(releaseDestinationPoint);
      setPendingTrajectory(serveTrajectory);
      setSelectedPlayerId(receptionDrivenTouch.playerId ?? null);
      setSelectedTeamSide(receptionDrivenTouch.teamSide);
      setPopupAnchor(zone.center);
      setRallyEndPreview(null);
      return;
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

    const touchTrajectory = trajectoryPoints
      ? createBallTrajectory({
          teamSide: nextPendingTouch.teamSide,
          skill: nextPendingTouch.skill,
          evaluation: nextPendingTouch.evaluation,
          points: trajectoryPoints,
        })
      : null;

    setPendingTouch({
      ...nextPendingTouch,
      destinationPoint: touchDestinationPoint,
      trajectory: touchTrajectory ?? undefined,
    });
    setPendingTrajectory(touchTrajectory);
    setSelectedPlayerId(nextPendingTouch.playerId ?? null);
    setSelectedTeamSide(nextPendingTouch.teamSide);
    setPopupAnchor(zone.center);
    setRallyEndPreview(null);
  }, [
    aceVictimSelection,
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
      onRallyEnd(resolvedAce.pointTeam, resolvedAce.reason);
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

      if (pendingTouch.source === 'inferred' && pendingTouch.teamSide === teamSide && !pendingTouch.playerId) {
        syncPendingTouchSelection(playerId, teamSide);
        return;
      }

      if (canCommitWithDefaults) {
        commitPendingTouch({ nextPlayerId: playerId, nextTeamSide: teamSide });
      }
      return;
    }

    setSelectedPlayerId(playerId);
    setSelectedTeamSide(teamSide);
    setSkillWasSelected(false);
    setEvaluationWasSelected(false);
    setRallyEndPreview(null);
  }, [
    aceVictimSelection,
    canCommitWithDefaults,
    commitPendingTouch,
    commitTouches,
    onRallyEnd,
    pendingTouch,
    syncPendingTouchSelection,
  ]);

  const handleEvaluationChange = useCallback((evaluation: SkillEvaluation) => {
    if (!pendingTouch) {
      return;
    }

    const nextPendingTouch = updatePendingTouchEvaluation(pendingTouch, evaluation);

    if (isReceptionDrivenServePendingTouch(nextPendingTouch)) {
      const result = resolveReceptionDrivenServeEvaluationFlow(nextPendingTouch);
      if (!result) {
        return;
      }

      commitTouches(result.touches);
      if (result.kind === 'rally_ended') {
        onRallyEnd(result.preview.pointTeam, result.preview.reason);
        return;
      }

      queueImplicitPendingTouch(result.touches);
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
    queueImplicitPendingTouch(result.touches);
    setRallyEndPreview(null);
  }, [commitTouches, onRallyEnd, pendingTouch, queueImplicitPendingTouch, showRallyEndPreview]);

  const handleSkillChange = useCallback((skill: SkillType) => {
    if (forceSkill) {
      return;
    }

    setPendingTouch((currentPendingTouch) => (
      currentPendingTouch ? updatePendingTouchSkill(currentPendingTouch, skill) : currentPendingTouch
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
  }, [forceSkill]);

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
  }, [onRallyEnd, rallyEndPreview]);

  const liveInputState = createLiveInputState({
    selectedPlayerId,
    selectedTeamSide,
    pendingBallPosition,
    pendingTouch,
    aceVictimSelection,
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
    forceSkill,
    liveInputState,
    handleZoneSnap,
    handlePlayerSelection,
    handleBallPositionChange,
    handleEvaluationChange,
    handleSkillChange,
    handlePopupTeamChange,
    handlePopupPlayerChange,
    handleRallyEndConfirm,
  };
}
