import type { TeamSide, SkillEvaluation } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { BallTouch } from '@src/domain/touch/types';
import type { LiveMatchState } from './index';
import { buildRallyEndedEvent, buildRallyStartedEvent, buildTouchRecordedEvent } from './rally';
import { createPointProgressionEvents } from './progression';
import { getLiveMatchReplayStatus } from './replay';
import { getPointWinnerFromTouch, resolveRallyOutcomeFromTouch } from './scoring-rules';
import type { PendingTouch } from './datavolley-flow';
import type { ScoutingMatchConfig } from '@src/domain/scouting/types';

export type ScoreCorrectionReason = 'replay' | 'video_check' | 'rotation_fault' | 'red_card';

export type ScoreCorrectionAction = {
  teamSide: TeamSide;
  delta: 1 | -1;
};

export type VideoCheckContext = {
  touchIndex: number;
  originalTouch: BallTouch;
  proposedEvaluation?: SkillEvaluation;
};

export interface UndoLastPointAvailability {
  canApply: boolean;
}

type RallyWindow = {
  startIndex: number;
  touchIndices: number[];
  pointAwardIndex: number | null;
  rallyEndedIndex: number | null;
};

function findLatestRallyWindow(events: MatchEvent[]): RallyWindow | null {
  const startIndex = events.findLastIndex((event) => event.type === 'rally_started');
  if (startIndex < 0) {
    return null;
  }

  const rallyEvents = events.slice(startIndex);
  const touchIndices = rallyEvents
    .map((event, offset) => (event.type === 'touch_recorded' ? startIndex + offset : -1))
    .filter((value) => value >= 0);
  const pointAwardIndex = rallyEvents.findIndex((event) => event.type === 'point_awarded');
  const rallyEndedIndex = rallyEvents.findIndex((event) => event.type === 'rally_ended');

  return {
    startIndex,
    touchIndices,
    pointAwardIndex: pointAwardIndex >= 0 ? startIndex + pointAwardIndex : null,
    rallyEndedIndex: rallyEndedIndex >= 0 ? startIndex + rallyEndedIndex : null,
  };
}

function toPendingTouch(touch: BallTouch): PendingTouch | null {
  if (!touch.playerId || !touch.zone?.point || !touch.zone?.zoneId || !touch.zone?.gridCoordinate) {
    return null;
  }

  return {
    playerId: touch.playerId,
    teamSide: touch.teamSide,
    skill: touch.skill,
    evaluation: touch.evaluation,
    zone: {
      id: touch.zone.zoneId,
      kind: 'in_court',
      teamSide: touch.zone.teamSide ?? touch.teamSide,
      gridCoordinate: touch.zone.gridCoordinate,
      center: touch.zone.point,
      bounds: {
        x: touch.zone.point.x,
        y: touch.zone.point.y,
        width: 0,
        height: 0,
      },
    },
  };
}

function appendPointSequence(
  input: {
    liveMatch: LiveMatchState;
    config: ScoutingMatchConfig;
    baseEvents: MatchEvent[];
    pointTeam: TeamSide;
    reason: string;
    skipRotation?: boolean;
  },
) {
  const pointEvents = createPointProgressionEvents(
    input.liveMatch,
    input.config,
    input.pointTeam,
    input.reason,
    undefined,
    {
      skipRotation: input.skipRotation,
    },
  );

  return [
    ...input.baseEvents,
    ...pointEvents,
    ...(pointEvents.some((event) => event.type === 'set_ended')
      ? []
      : [buildRallyEndedEvent(input.liveMatch)]),
  ];
}

function findLatestUndoablePointWindow(events: MatchEvent[]) {
  const latestPointAwardIndex = events.findLastIndex((event) => event.type === 'point_awarded');
  if (latestPointAwardIndex < 0) {
    return null;
  }

  const trailingEvents = events.slice(latestPointAwardIndex + 1);
  const hasUnsupportedTrailingEvent = trailingEvents.some((event) => (
    event.type !== 'rally_ended' && event.type !== 'set_ended'
  ));
  if (hasUnsupportedTrailingEvent) {
    return null;
  }

  const latestRally = findLatestRallyWindow(events);
  if (!latestRally || latestRally.pointAwardIndex !== latestPointAwardIndex) {
    return null;
  }

  const shouldRemoveSyntheticRallyStart = latestRally.startIndex === latestPointAwardIndex - 1
    && events[latestRally.startIndex]?.type === 'rally_started'
    && latestRally.touchIndices.length === 0;

  return {
    startIndex: shouldRemoveSyntheticRallyStart ? latestRally.startIndex : latestPointAwardIndex,
  };
}

export function buildReplayCorrectionEventLog(liveMatch: LiveMatchState): MatchEvent[] | null {
  const latestRally = findLatestRallyWindow(liveMatch.eventLog);
  if (!latestRally) {
    return null;
  }

  return liveMatch.eventLog.slice(0, latestRally.startIndex);
}

export function getUndoLastPointAvailability(liveMatch: LiveMatchState | null): UndoLastPointAvailability {
  if (!liveMatch) {
    return { canApply: false };
  }

  const replayStatus = getLiveMatchReplayStatus(liveMatch.activeProjectId, liveMatch.eventLog);
  if (!replayStatus.canReplay) {
    return { canApply: false };
  }

  return {
    canApply: findLatestUndoablePointWindow(liveMatch.eventLog) !== null,
  };
}

export function buildUndoLastPointEventLog(liveMatch: LiveMatchState): MatchEvent[] | null {
  const latestPointWindow = findLatestUndoablePointWindow(liveMatch.eventLog);
  if (!latestPointWindow) {
    return null;
  }

  return liveMatch.eventLog.slice(0, latestPointWindow.startIndex);
}

export function buildManualPointEventLog(input: {
  liveMatch: LiveMatchState;
  config: ScoutingMatchConfig;
  pointTeam: TeamSide;
}): MatchEvent[] {
  const baseEvents = input.liveMatch.isRallyActive
    ? input.liveMatch.eventLog
    : [...input.liveMatch.eventLog, buildRallyStartedEvent()];

  return appendPointSequence({
    liveMatch: {
      ...input.liveMatch,
      isRallyActive: true,
    },
    config: input.config,
    baseEvents,
    pointTeam: input.pointTeam,
    reason: 'manual_point',
    skipRotation: true,
  });
}

export function getLatestVideoCheckContext(liveMatch: LiveMatchState): VideoCheckContext | null {
  const latestRally = findLatestRallyWindow(liveMatch.eventLog);
  const touchIndex = latestRally?.touchIndices.at(-1);
  if (touchIndex === undefined) {
    return null;
  }

  const touchEvent = liveMatch.eventLog[touchIndex];
  if (!touchEvent || touchEvent.type !== 'touch_recorded') {
    return null;
  }

  const proposedEvaluation = touchEvent.touch.evaluation === '#'
    ? '='
    : touchEvent.touch.evaluation === '='
      ? '#'
      : touchEvent.touch.evaluation;

  return {
    touchIndex,
    originalTouch: touchEvent.touch,
    proposedEvaluation,
  };
}

export function buildVideoCheckCorrectionEventLog(input: {
  liveMatch: LiveMatchState;
  config: ScoutingMatchConfig;
  updatedTouch: BallTouch;
  touchIndex: number;
}): MatchEvent[] | null {
  const pendingTouch = toPendingTouch(input.updatedTouch);
  if (!pendingTouch) {
    return null;
  }

  const baseEvents = [
    ...input.liveMatch.eventLog.slice(0, input.touchIndex),
    buildTouchRecordedEvent(input.updatedTouch),
  ];
  const outcome = resolveRallyOutcomeFromTouch(pendingTouch);

  if (outcome.kind !== 'point') {
    return baseEvents;
  }

  return appendPointSequence({
    liveMatch: input.liveMatch,
    config: input.config,
    baseEvents,
    pointTeam: outcome.pointTeam,
    reason: outcome.reason,
  });
}

export function buildRotationFaultCorrectionEventLog(input: {
  liveMatch: LiveMatchState;
  config: ScoutingMatchConfig;
}): MatchEvent[] | null {
  if (!input.liveMatch.servingTeam) {
    return null;
  }

  const latestRally = findLatestRallyWindow(input.liveMatch.eventLog);
  if (!latestRally) {
    return null;
  }

  const baseEvents = input.liveMatch.eventLog.slice(0, latestRally.startIndex + 1);

  return appendPointSequence({
    liveMatch: input.liveMatch,
    config: input.config,
    baseEvents,
    pointTeam: input.liveMatch.servingTeam,
    reason: 'rotation_fault',
  });
}

export function buildRedCardCorrectionEventLog(input: {
  liveMatch: LiveMatchState;
  config: ScoutingMatchConfig;
  penalizedTeam: TeamSide;
}): MatchEvent[] | null {
  const pointTeam = input.penalizedTeam === 'home' ? 'away' : 'home';
  const baseEvents = input.liveMatch.isRallyActive
    ? input.liveMatch.eventLog
    : [
        ...input.liveMatch.eventLog,
        buildRallyStartedEvent(),
      ];

  return appendPointSequence({
    liveMatch: {
      ...input.liveMatch,
      isRallyActive: true,
    },
    config: input.config,
    baseEvents,
    pointTeam,
    reason: 'red_card',
  });
}

export function getDirectPointWinnerFromPendingTouch(touch: PendingTouch): TeamSide | null {
  return getPointWinnerFromTouch(touch);
}
