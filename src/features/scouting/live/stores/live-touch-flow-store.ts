import { useCallback, useEffect, useState } from 'react';
import { create } from 'zustand';
import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { ScoutingZone } from '@src/domain/spatial';
import type { BallTouch } from '@src/domain/touch/types';
import {
  buildNextPendingTouch,
  isAce,
  resolveAceFlow,
  resolvePointTeam,
  shouldAssignPoint,
  type PendingTouch,
} from '../../model/datavolley-flow';
import { getDefaultEvaluationForSkill } from '../../model/touch-popup';
import {
  buildPendingTouchForZone,
  resolveAceVictimFlow,
  resolveEvaluationFlow,
  updatePendingTouchEvaluation,
  updatePendingTouchSelection,
  updatePendingTouchSkill,
  type AceVictimSelection,
  type CourtCoordinate,
  type RallyEndPreview,
  type TeamTacticalPlayers,
} from '../rally/rally-flow';

export type LiveTouchFlowPhase =
  | 'idle'
  | 'player_selected'
  | 'touch_pending'
  | 'evaluation_selected'
  | 'awaiting_ace_target'
  | 'rally_ended';

type TransitionTarget = LiveTouchFlowPhase;

type FlowContext = {
  previousTouch: Pick<BallTouch, 'playerId' | 'teamSide' | 'skill' | 'evaluation'> | null;
  servingTeam: TeamSide | null;
  servingPlayerId: string | null;
  playerTeamById: Record<string, TeamSide>;
};

type RallyEndRequest = {
  pointTeam: TeamSide;
  reason: string;
};

type LiveTouchFlowState = {
  currentPhase: LiveTouchFlowPhase;
  selectedPlayerId: string | null;
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
  playerTeamById: {},
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
        awaitingAceTarget: false,
        rallyEndRequest: null,
        flowContext: {
          ...state.flowContext,
          playerTeamById: {
            ...state.flowContext.playerTeamById,
            [playerId]: teamSide,
          },
        },
      };
    });
  },

  openTouch: (zone) => {
    set((state) => {
      const selectedTeamSide = state.selectedPlayerId
        ? (state.flowContext.playerTeamById[state.selectedPlayerId] ?? null)
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
        selectedPlayerId: nextPendingTouch.playerId,
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
  onSelectedZoneChange,
  onTouchesCommitted,
  onRallyEnd,
  onAceVictimSelectionChange,
}: LiveTouchFlowControllerInput) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedTeamSide, setSelectedTeamSide] = useState<TeamSide | null>(null);
  const [pendingTouch, setPendingTouch] = useState<PendingTouch | null>(null);
  const [popupAnchor, setPopupAnchor] = useState<CourtCoordinate | null>(null);
  const [rallyEndPreview, setRallyEndPreview] = useState<RallyEndPreview | null>(null);
  const [aceVictimSelection, setAceVictimSelection] = useState<AceVictimSelection | null>(null);
  const previousTouch = currentRallyTouches.at(-1);
  const forceSkill = currentRallyTouches.length === 0 && pendingTouch?.skill === 'serve';

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
      setPopupAnchor(null);
      setRallyEndPreview(null);
      setAceVictimSelection(null);
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
    setPopupAnchor(null);
  }, [onTouchesCommitted]);

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

  const handleZoneSnap = useCallback((zone: ScoutingZone) => {
    if (aceVictimSelection) {
      return;
    }

    onSelectedZoneChange(zone);

    if (zone.kind !== 'in_court') {
      setPopupAnchor(null);
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
    });

    if (!nextPendingTouch) {
      setPopupAnchor(null);
      return;
    }

    setPendingTouch(nextPendingTouch);
    setSelectedPlayerId(nextPendingTouch.playerId);
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
  ]);

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
      commitTouches(resolvedAce.touches);
      onRallyEnd(resolvedAce.pointTeam, resolvedAce.reason);
      return;
    }

    if (pendingTouch) {
      commitPendingTouch({ nextPlayerId: playerId, nextTeamSide: teamSide });
      return;
    }

    setSelectedPlayerId(playerId);
    setSelectedTeamSide(teamSide);
    setRallyEndPreview(null);
  }, [aceVictimSelection, commitPendingTouch, commitTouches, onRallyEnd, pendingTouch]);

  const handleEvaluationChange = useCallback((evaluation: SkillEvaluation) => {
    if (!pendingTouch) {
      return;
    }

    const nextPendingTouch = updatePendingTouchEvaluation(pendingTouch, evaluation);
    const result = resolveEvaluationFlow(nextPendingTouch);

    if (result.kind === 'awaiting_ace_target') {
      setPendingTouch(null);
      setPopupAnchor(null);
      setSelectedPlayerId(null);
      setSelectedTeamSide(result.selection.receivingTeam);
      setAceVictimSelection(result.selection);
      setRallyEndPreview(null);
      return;
    }

    if (result.kind === 'rally_ended') {
      commitTouches([result.touch]);
      showRallyEndPreview(result.preview.pointTeam, result.preview.reason);
      return;
    }

    setPendingTouch(result.touch);
    setRallyEndPreview(null);
  }, [commitTouches, pendingTouch, showRallyEndPreview]);

  const handleSkillChange = useCallback((skill: SkillType) => {
    if (forceSkill) {
      return;
    }

    setPendingTouch((currentPendingTouch) => (
      currentPendingTouch ? updatePendingTouchSkill(currentPendingTouch, skill) : currentPendingTouch
    ));
    setRallyEndPreview(null);
  }, [forceSkill]);

  const syncPendingTouchSelection = useCallback((nextPlayerId: string, nextTeamSide: TeamSide) => {
    setSelectedPlayerId(nextPlayerId);
    setSelectedTeamSide(nextTeamSide);
    setPendingTouch((currentPendingTouch) => (
      currentPendingTouch
        ? updatePendingTouchSelection(currentPendingTouch, nextPlayerId, nextTeamSide)
        : currentPendingTouch
    ));
    setRallyEndPreview(null);
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

  return {
    selectedPlayerId,
    selectedTeamSide,
    pendingTouch,
    popupAnchor,
    rallyEndPreview,
    aceVictimSelection,
    forceSkill,
    handleZoneSnap,
    handlePlayerSelection,
    handleEvaluationChange,
    handleSkillChange,
    handlePopupTeamChange,
    handlePopupPlayerChange,
    handleRallyEndConfirm,
  };
}
