import type { MatchEvent } from '@src/domain/events/types';
import type { LiveMatchState } from './index';
import { getLiveMatchReplayStatus } from './replay';

export type ScoutingCorrectionReason =
  | 'replay_unavailable'
  | 'no_supported_action'
  | 'latest_action_not_supported'
  | 'rally_not_active'
  | 'no_touches'
  | 'remove_touch_not_latest'
  | 'point_not_awarded'
  | 'clear_point_requires_open_rally'
  | 'clear_point_not_latest'
  | 'rally_not_closed'
  | 'reopen_not_latest';

export interface ScoutingActionAvailability {
  canApply: boolean;
  reason?: ScoutingCorrectionReason;
  eventType?: MatchEvent['type'];
}

export interface CurrentRallyCorrectionAvailability {
  removeLastTouch: ScoutingActionAvailability;
  clearAwardedPoint: ScoutingActionAvailability;
  reopenRally: ScoutingActionAvailability;
}

const UNDOABLE_EVENT_TYPES: MatchEvent['type'][] = [
  'rally_started',
  'touch_recorded',
  'point_awarded',
  'rally_ended',
];

function createUnavailable(reason: ScoutingCorrectionReason): ScoutingActionAvailability {
  return {
    canApply: false,
    reason,
  };
}

function getLastEvent(liveMatch: LiveMatchState | null): MatchEvent | undefined {
  return liveMatch?.eventLog.at(-1);
}

export function getUndoLastActionAvailability(liveMatch: LiveMatchState | null): ScoutingActionAvailability {
  if (!liveMatch) {
    return createUnavailable('no_supported_action');
  }

  const replayStatus = getLiveMatchReplayStatus(liveMatch.activeProjectId, liveMatch.eventLog);
  if (!replayStatus.canReplay) {
    return createUnavailable('replay_unavailable');
  }

  const lastEvent = getLastEvent(liveMatch);
  if (!lastEvent) {
    return createUnavailable('no_supported_action');
  }

  if (!UNDOABLE_EVENT_TYPES.includes(lastEvent.type)) {
    return createUnavailable('latest_action_not_supported');
  }

  return {
    canApply: true,
    eventType: lastEvent.type,
  };
}

export function getCurrentRallyCorrectionAvailability(
  liveMatch: LiveMatchState | null,
): CurrentRallyCorrectionAvailability {
  if (!liveMatch) {
    const unavailable = createUnavailable('replay_unavailable');

    return {
      removeLastTouch: unavailable,
      clearAwardedPoint: unavailable,
      reopenRally: unavailable,
    };
  }

  const replayStatus = getLiveMatchReplayStatus(liveMatch.activeProjectId, liveMatch.eventLog);
  if (!replayStatus.canReplay) {
    const unavailable = createUnavailable('replay_unavailable');

    return {
      removeLastTouch: unavailable,
      clearAwardedPoint: unavailable,
      reopenRally: unavailable,
    };
  }

  const lastEvent = getLastEvent(liveMatch);

  const removeLastTouch = (() => {
    if (!liveMatch.isRallyActive) {
      return createUnavailable('rally_not_active');
    }

    if (liveMatch.currentRallyTouches.length === 0) {
      return createUnavailable('no_touches');
    }

    if (lastEvent?.type !== 'touch_recorded') {
      return createUnavailable('remove_touch_not_latest');
    }

    return {
      canApply: true,
      eventType: lastEvent.type,
    };
  })();

  const clearAwardedPoint = (() => {
    if (!liveMatch.isRallyActive) {
      return createUnavailable('clear_point_requires_open_rally');
    }

    if (!liveMatch.currentRallyPointWinner) {
      return createUnavailable('point_not_awarded');
    }

    if (lastEvent?.type !== 'point_awarded') {
      return createUnavailable('clear_point_not_latest');
    }

    return {
      canApply: true,
      eventType: lastEvent.type,
    };
  })();

  const reopenRally = (() => {
    if (liveMatch.isRallyActive) {
      return createUnavailable('rally_not_closed');
    }

    if (lastEvent?.type !== 'rally_ended') {
      return createUnavailable('reopen_not_latest');
    }

    return {
      canApply: true,
      eventType: lastEvent.type,
    };
  })();

  return {
    removeLastTouch,
    clearAwardedPoint,
    reopenRally,
  };
}
