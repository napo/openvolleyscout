import { createActiveLineup } from '@src/domain/lineup';
import type { MatchEvent } from '@src/domain/events/types';
import type { BallTouch } from '@src/domain/touch/types';
import type { LiveMatchState } from './index';

export type ReplayFailureReason = 'unsupported_event' | 'invalid_sequence';

export interface ReplayStatus {
  canReplay: boolean;
  reason?: ReplayFailureReason;
  eventType?: MatchEvent['type'];
}

function normalizeTouchSequence(touch: BallTouch, sequenceNumber: number): BallTouch {
  return {
    ...touch,
    sequenceNumber,
  };
}

function createBaseLiveMatchState(
  activeProjectId: string,
  setStartedEvent: Extract<MatchEvent, { type: 'set_started' }>,
  previousEvents: MatchEvent[],
): LiveMatchState {
  return {
    activeProjectId,
    currentSetNumber: setStartedEvent.setNumber,
    currentRallyNumber: 1,
    homeScore: 0,
    awayScore: 0,
    servingTeam: setStartedEvent.servingTeam,
    homeActiveLineup: createActiveLineup(setStartedEvent.homeLineup),
    awayActiveLineup: createActiveLineup(setStartedEvent.awayLineup),
    isSetStarted: true,
    isRallyActive: false,
    currentRallyTouches: [],
    currentRallyPointWinner: null,
    completedSets: [],
    startedAt: setStartedEvent.createdAt,
    updatedAt: setStartedEvent.createdAt,
    eventLog: [...previousEvents, setStartedEvent],
  };
}

function isReplayableEvent(event: MatchEvent): boolean {
  return (
    event.type === 'set_started'
    || event.type === 'rally_started'
    || event.type === 'touch_recorded'
    || event.type === 'point_awarded'
    || event.type === 'set_ended'
    || event.type === 'rally_ended'
  );
}

function getActiveSetEvents(events: MatchEvent[]) {
  const lastSetStartedIndex = events.findLastIndex((event) => event.type === 'set_started');
  if (lastSetStartedIndex === -1) {
    return null;
  }

  return {
    index: lastSetStartedIndex,
    events: events.slice(lastSetStartedIndex),
  };
}

export function getLiveMatchReplayStatus(activeProjectId: string, events: MatchEvent[]): ReplayStatus {
  const activeSet = getActiveSetEvents(events);
  if (!activeSet) {
    return {
      canReplay: false,
      reason: 'invalid_sequence',
    };
  }

  const [setStartedEvent, ...remainingEvents] = activeSet.events;
  if (setStartedEvent.type !== 'set_started') {
    return {
      canReplay: false,
      reason: 'invalid_sequence',
    };
  }

  if (!activeProjectId) {
    return {
      canReplay: false,
      reason: 'invalid_sequence',
    };
  }

  for (const event of remainingEvents) {
    if (!isReplayableEvent(event)) {
      return {
        canReplay: false,
        reason: 'unsupported_event',
        eventType: event.type,
      };
    }
  }

  let liveMatch = createBaseLiveMatchState(activeProjectId, setStartedEvent, events.slice(0, activeSet.index));

  for (const event of remainingEvents) {
    const nextLiveMatch = applyReplayEvent(liveMatch, event);
    if (!nextLiveMatch) {
      return {
        canReplay: false,
        reason: 'invalid_sequence',
        eventType: event.type,
      };
    }

    liveMatch = nextLiveMatch;
  }

  return {
    canReplay: true,
  };
}

export function replayLiveMatchFromEvents(
  activeProjectId: string,
  events: MatchEvent[],
): LiveMatchState | null {
  const activeSet = getActiveSetEvents(events);
  if (!activeSet) {
    return null;
  }

  const status = getLiveMatchReplayStatus(activeProjectId, events);
  if (!status.canReplay) {
    return null;
  }

  const [setStartedEvent, ...remainingEvents] = activeSet.events;
  if (setStartedEvent.type !== 'set_started') {
    return null;
  }

  let liveMatch = createBaseLiveMatchState(activeProjectId, setStartedEvent, events.slice(0, activeSet.index));

  for (const event of remainingEvents) {
    const nextLiveMatch = applyReplayEvent(liveMatch, event);
    if (!nextLiveMatch) {
      return null;
    }

    liveMatch = nextLiveMatch;
  }

  return liveMatch;
}

function applyReplayEvent(liveMatch: LiveMatchState, event: MatchEvent): LiveMatchState | null {
  switch (event.type) {
    case 'rally_started':
      if (liveMatch.isRallyActive) {
        return null;
      }

      return {
        ...liveMatch,
        updatedAt: event.createdAt,
        isRallyActive: true,
        currentRallyTouches: [],
        currentRallyPointWinner: null,
        eventLog: [...liveMatch.eventLog, event],
      };
    case 'touch_recorded':
      if (!liveMatch.isRallyActive || liveMatch.currentRallyPointWinner) {
        return null;
      }

      return {
        ...liveMatch,
        updatedAt: event.createdAt,
        currentRallyTouches: [
          ...liveMatch.currentRallyTouches,
          normalizeTouchSequence(event.touch, liveMatch.currentRallyTouches.length + 1),
        ],
        eventLog: [...liveMatch.eventLog, event],
      };
    case 'point_awarded':
      if (!liveMatch.isRallyActive || liveMatch.currentRallyPointWinner) {
        return null;
      }

      return {
        ...liveMatch,
        homeScore: event.teamSide === 'home' ? liveMatch.homeScore + 1 : liveMatch.homeScore,
        awayScore: event.teamSide === 'away' ? liveMatch.awayScore + 1 : liveMatch.awayScore,
        servingTeam: event.teamSide,
        currentRallyPointWinner: event.teamSide,
        updatedAt: event.createdAt,
        eventLog: [...liveMatch.eventLog, event],
      };
    case 'set_ended':
      if (!liveMatch.isSetStarted) {
        return null;
      }

      if (liveMatch.homeScore !== event.homeScore || liveMatch.awayScore !== event.awayScore) {
        return null;
      }

      if (
        (event.winningTeam === 'home' && event.homeScore <= event.awayScore)
        || (event.winningTeam === 'away' && event.awayScore <= event.homeScore)
      ) {
        return null;
      }

      return {
        ...liveMatch,
        completedSets: [
          ...liveMatch.completedSets,
          {
            setNumber: event.setNumber,
            homeScore: event.homeScore,
            awayScore: event.awayScore,
            completedAt: event.createdAt,
          },
        ],
        isSetStarted: false,
        isRallyActive: false,
        currentRallyTouches: [],
        currentRallyPointWinner: null,
        updatedAt: event.createdAt,
        eventLog: [...liveMatch.eventLog, event],
      };
    case 'rally_ended':
      if (!liveMatch.isRallyActive || !liveMatch.currentRallyPointWinner) {
        return null;
      }

      return {
        ...liveMatch,
        isRallyActive: false,
        currentRallyNumber: liveMatch.currentRallyNumber + 1,
        currentRallyTouches: [],
        currentRallyPointWinner: null,
        updatedAt: event.createdAt,
        eventLog: [...liveMatch.eventLog, event],
      };
    default:
      return null;
  }
}
