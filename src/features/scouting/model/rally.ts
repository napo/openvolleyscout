import type { MatchEvent } from '@src/domain/events/types';
import type { LiveMatchState } from './index';
import type { BallTouch } from '@src/domain/touch/types';
import type { TeamSide } from '@src/domain/common/enums';
import { normalizeBallTouchDirection } from '@src/domain/trajectory';

function createEventId() {
  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function buildRallyStartedEvent(createdAt = Date.now()): MatchEvent {
  return {
    id: createEventId(),
    type: 'rally_started',
    createdAt,
  };
}

export function buildTouchRecordedEvent(touch: BallTouch): MatchEvent {
  const normalizedTouch = normalizeBallTouchDirection(touch);

  return {
    id: createEventId(),
    type: 'touch_recorded',
    createdAt: normalizedTouch.createdAt,
    touch: {
      source: 'explicit',
      ...normalizedTouch,
    },
    location: {
      teamSide: normalizedTouch.zone?.teamSide ?? normalizedTouch.teamSide,
      zoneId: normalizedTouch.zone?.zoneId,
      gridCoordinate: normalizedTouch.zone?.gridCoordinate,
      point: normalizedTouch.zone?.point,
    },
  };
}

export function buildPointAwardedEvent(
  liveMatch: LiveMatchState,
  teamSide: TeamSide,
  reason?: string,
  createdAt = Date.now(),
  options?: {
    skipRotation?: boolean;
  },
): MatchEvent {
  return {
    id: createEventId(),
    type: 'point_awarded',
    createdAt,
    setNumber: liveMatch.currentSetNumber,
    rallyNumber: liveMatch.currentRallyNumber,
    teamSide,
    reason,
    skipRotation: options?.skipRotation,
  };
}

export function buildRallyEndedEvent(liveMatch: LiveMatchState, createdAt = Date.now()): MatchEvent {
  return {
    id: createEventId(),
    type: 'rally_ended',
    createdAt,
    setNumber: liveMatch.currentSetNumber,
    rallyNumber: liveMatch.currentRallyNumber,
  };
}
