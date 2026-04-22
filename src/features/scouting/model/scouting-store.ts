import { create } from 'zustand';
import type { ScoutingState, ScoutingStoreActionResult } from './index';
import type { TeamSide } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { ScoutingCorrectionReason } from './corrections';
import {
  buildSetStartedEvent,
  createLiveMatchStateFromProject,
  createLiveMatchStateFromSetStart,
} from './session';
import {
  buildPointAwardedEvent,
  buildRallyEndedEvent,
  buildRallyStartedEvent,
  buildTouchRecordedEvent,
} from './rally';
import {
  getCurrentRallyCorrectionAvailability,
  getUndoLastActionAvailability,
} from './corrections';
import { replayLiveMatchFromEvents } from './replay';

function rebuildLiveMatch(eventLog: MatchEvent[], activeProjectId: string) {
  return replayLiveMatchFromEvents(activeProjectId, eventLog);
}

function createActionResult(
  ok: boolean,
  reason?: ScoutingCorrectionReason,
  eventType?: MatchEvent['type'],
): ScoutingStoreActionResult {
  return {
    ok,
    reason,
    eventType,
  };
}

export const useScoutingStore = create<ScoutingState>((set, get) => ({
  liveMatch: null,

  syncWithProject: (project) => {
    set({
      liveMatch: createLiveMatchStateFromProject(project),
    });
  },

  startSet: (input) => {
    const event = buildSetStartedEvent(input);

    set({
      liveMatch: createLiveMatchStateFromSetStart(input, event),
    });

    return event;
  },

  endSet: () => {
    set((state) => ({
      liveMatch: state.liveMatch ? {
        ...state.liveMatch,
        completedSets: [
          ...state.liveMatch.completedSets,
          {
            setNumber: state.liveMatch.currentSetNumber,
            homeScore: state.liveMatch.homeScore,
            awayScore: state.liveMatch.awayScore,
            completedAt: Date.now(),
          },
        ],
        isSetStarted: false,
        isRallyActive: false,
        currentRallyTouches: [],
        currentRallyPointWinner: null,
        updatedAt: Date.now(),
      } : null,
    }));
  },

  startRally: () => {
    const state = get().liveMatch;
    if (!state || state.isRallyActive) return;
    const event = buildRallyStartedEvent();
    const liveMatch = rebuildLiveMatch([...state.eventLog, event], state.activeProjectId);
    if (!liveMatch) return;

    set({ liveMatch });
  },

  recordTouch: (touch: BallTouch) => {
    const state = get().liveMatch;
    if (!state || !state.isRallyActive) return;
    const event = buildTouchRecordedEvent(touch);
    const liveMatch = rebuildLiveMatch([...state.eventLog, event], state.activeProjectId);
    if (!liveMatch) return;

    set({ liveMatch });
  },

  awardPoint: (teamSide: TeamSide, reason?: string) => {
    const state = get().liveMatch;
    if (!state || !state.isRallyActive || state.currentRallyPointWinner) return;
    const event = buildPointAwardedEvent(state, teamSide, reason);
    const liveMatch = rebuildLiveMatch([...state.eventLog, event], state.activeProjectId);
    if (!liveMatch) return;

    set({ liveMatch });
  },

  endRally: () => {
    const state = get().liveMatch;
    if (!state || !state.isRallyActive || !state.currentRallyPointWinner) return;
    const event = buildRallyEndedEvent(state);
    const liveMatch = rebuildLiveMatch([...state.eventLog, event], state.activeProjectId);
    if (!liveMatch) return;

    set({ liveMatch });
  },

  undoLastAction: () => {
    const liveMatch = get().liveMatch;
    const availability = getUndoLastActionAvailability(liveMatch);
    if (!liveMatch || !availability.canApply) {
      return createActionResult(false, availability.reason, availability.eventType);
    }

    const nextEventLog = liveMatch.eventLog.slice(0, -1);
    const nextLiveMatch = rebuildLiveMatch(nextEventLog, liveMatch.activeProjectId);
    if (!nextLiveMatch) {
      return createActionResult(false, 'replay_unavailable', availability.eventType);
    }

    set({ liveMatch: nextLiveMatch });

    return createActionResult(true, undefined, availability.eventType);
  },

  removeLastTouchFromCurrentRally: () => {
    const liveMatch = get().liveMatch;
    const availability = getCurrentRallyCorrectionAvailability(liveMatch).removeLastTouch;
    if (!liveMatch || !availability.canApply) {
      return createActionResult(false, availability.reason, availability.eventType);
    }

    const nextLiveMatch = rebuildLiveMatch(liveMatch.eventLog.slice(0, -1), liveMatch.activeProjectId);
    if (!nextLiveMatch) {
      return createActionResult(false, 'replay_unavailable', availability.eventType);
    }

    set({ liveMatch: nextLiveMatch });

    return createActionResult(true, undefined, availability.eventType);
  },

  clearCurrentRallyPoint: () => {
    const liveMatch = get().liveMatch;
    const availability = getCurrentRallyCorrectionAvailability(liveMatch).clearAwardedPoint;
    if (!liveMatch || !availability.canApply) {
      return createActionResult(false, availability.reason, availability.eventType);
    }

    const nextLiveMatch = rebuildLiveMatch(liveMatch.eventLog.slice(0, -1), liveMatch.activeProjectId);
    if (!nextLiveMatch) {
      return createActionResult(false, 'replay_unavailable', availability.eventType);
    }

    set({ liveMatch: nextLiveMatch });

    return createActionResult(true, undefined, availability.eventType);
  },

  reopenCurrentRally: () => {
    const liveMatch = get().liveMatch;
    const availability = getCurrentRallyCorrectionAvailability(liveMatch).reopenRally;
    if (!liveMatch || !availability.canApply) {
      return createActionResult(false, availability.reason, availability.eventType);
    }

    const nextLiveMatch = rebuildLiveMatch(liveMatch.eventLog.slice(0, -1), liveMatch.activeProjectId);
    if (!nextLiveMatch) {
      return createActionResult(false, 'replay_unavailable', availability.eventType);
    }

    set({ liveMatch: nextLiveMatch });

    return createActionResult(true, undefined, availability.eventType);
  },

  resetLiveMatch: () => {
    set({ liveMatch: null });
  },
}));
