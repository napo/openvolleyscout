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
  buildRallyEndedEvent,
  buildRallyStartedEvent,
  buildTouchRecordedEvent,
} from './rally';
import {
  getCurrentRallyCorrectionAvailability,
  getUndoLastActionAvailability,
} from './corrections';
import { buildSetEndedEvent, createPointProgressionEvents, isCurrentSetComplete } from './progression';
import { replayLiveMatchFromEvents } from './replay';
import {
  buildManualPointEventLog,
  buildUndoLastPointEventLog,
  getUndoLastPointAvailability,
} from './score-corrections';

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
  activeConfig: null,

  syncWithProject: (project) => {
    set({
      liveMatch: createLiveMatchStateFromProject(project),
      activeConfig: project?.scoutingConfig ?? null,
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
    const state = get();
    const liveMatch = state.liveMatch;
    const config = state.activeConfig;

    if (!liveMatch || !config || !isCurrentSetComplete(liveMatch, config)) {
      return;
    }

    const winningTeam = liveMatch.homeScore > liveMatch.awayScore ? 'home' : 'away';
    const event = buildSetEndedEvent(
      liveMatch,
      winningTeam,
      {
        homeScore: liveMatch.homeScore,
        awayScore: liveMatch.awayScore,
      },
    );
    const nextLiveMatch = rebuildLiveMatch([...liveMatch.eventLog, event], liveMatch.activeProjectId);
    if (!nextLiveMatch) return;

    set({ liveMatch: nextLiveMatch });
  },

  startRally: () => {
    const state = get().liveMatch;
    if (!state || !state.isSetStarted || state.isRallyActive) return;
    const event = buildRallyStartedEvent();
    const liveMatch = rebuildLiveMatch([...state.eventLog, event], state.activeProjectId);
    if (!liveMatch) return;

    set({ liveMatch });
  },

  recordTouch: (touch: BallTouch) => {
    const state = get().liveMatch;
    if (!state || !state.isSetStarted || !state.isRallyActive) return;
    const event = buildTouchRecordedEvent(touch);
    const liveMatch = rebuildLiveMatch([...state.eventLog, event], state.activeProjectId);
    if (!liveMatch) return;

    set({ liveMatch });
  },

  awardPoint: (teamSide: TeamSide, reason?: string) => {
    const { liveMatch: state, activeConfig } = get();
    if (!state || !activeConfig || !state.isSetStarted || !state.isRallyActive || state.currentRallyPointWinner) return;
    const events = createPointProgressionEvents(state, activeConfig, teamSide, reason);
    const liveMatch = rebuildLiveMatch([...state.eventLog, ...events], state.activeProjectId);
    if (!liveMatch) return;

    set({ liveMatch });
  },

  awardManualPoint: (teamSide: TeamSide) => {
    const { liveMatch, activeConfig } = get();
    if (!liveMatch || !activeConfig || !liveMatch.isSetStarted) {
      return false;
    }

    const nextEventLog = buildManualPointEventLog({
      liveMatch,
      config: activeConfig,
      pointTeam: teamSide,
    });
    const nextLiveMatch = rebuildLiveMatch(nextEventLog, liveMatch.activeProjectId);
    if (!nextLiveMatch) {
      return false;
    }

    set({ liveMatch: nextLiveMatch });
    return true;
  },

  endRally: () => {
    const state = get().liveMatch;
    if (!state || !state.isSetStarted || !state.isRallyActive || !state.currentRallyPointWinner) return;
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

  undoLastPoint: () => {
    const liveMatch = get().liveMatch;
    const availability = getUndoLastPointAvailability(liveMatch);
    if (!liveMatch || !availability.canApply) {
      return false;
    }

    const nextEventLog = buildUndoLastPointEventLog(liveMatch);
    if (!nextEventLog) {
      return false;
    }

    const nextLiveMatch = rebuildLiveMatch(nextEventLog, liveMatch.activeProjectId);
    if (!nextLiveMatch) {
      return false;
    }

    set({ liveMatch: nextLiveMatch });
    return true;
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

  replaceLiveMatchEvents: (eventLog) => {
    const liveMatch = get().liveMatch;
    if (!liveMatch) {
      return false;
    }

    const nextLiveMatch = rebuildLiveMatch(eventLog, liveMatch.activeProjectId);
    if (!nextLiveMatch) {
      return false;
    }

    set({ liveMatch: nextLiveMatch });
    return true;
  },

  resetLiveMatch: () => {
    set({ liveMatch: null, activeConfig: null });
  },
}));
