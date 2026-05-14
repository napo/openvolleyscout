import { create } from 'zustand';
import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { ScoutingZone } from '@src/domain/spatial';
import type { BallTouch } from '@src/domain/touch/types';
import {
  buildNextPendingTouch,
  resolveAceFlow,
  resolvePointTeam,
  shouldAssignPoint,
  type PendingTouch,
} from './datavolley-flow';
import { getDefaultEvaluationForSkill } from './touch-popup';

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
