import type { TeamSide, SkillEvaluation } from '@src/domain/common/enums';
import type { ManualCorrectionKind, MatchEvent } from '@src/domain/events/types';
import { isSetComplete } from '@src/domain/scouting';
import type { BallTouch } from '@src/domain/touch/types';
import type { LiveMatchState } from './index';
import { buildRallyEndedEvent, buildRallyStartedEvent, buildTouchRecordedEvent } from './rally';
import { buildSetEndedEvent, createPointProgressionEvents } from './progression';
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

function findLastEventIndex(
  events: readonly MatchEvent[],
  predicate: (event: MatchEvent) => boolean,
): number {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (predicate(events[index])) {
      return index;
    }
  }

  return -1;
}

function findLatestRallyWindow(events: MatchEvent[]): RallyWindow | null {
  const startIndex = findLastEventIndex(events, (event) => event.type === 'rally_started');
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
    source: touch.source,
    touchOrigin: touch.touchOrigin,
    advancedDetails: touch.advancedDetails,
    requiredExplicitInput: touch.requiredExplicitInput,
    inferredCandidate: touch.inferredCandidate,
    pendingInference: touch.pendingInference,
    inferenceReason: touch.inferenceReason,
    inferredFromTouchId: touch.inferredFromTouchId,
    ballDirection: touch.ballDirection,
    trajectory: touch.trajectory,
    zone: {
      id: touch.zone.zoneId,
      index: 0,
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
  const latestPointAwardIndex = findLastEventIndex(events, (event) => event.type === 'point_awarded');
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
  penalizedTeam?: TeamSide;
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
    pointTeam: input.penalizedTeam
      ? input.penalizedTeam === 'home' ? 'away' : 'home'
      : input.liveMatch.servingTeam,
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

function createManualCorrectionEventId() {
  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Scorer's correction between rallies: +1/-1 point, rotate a team forward or
 * back, or give a team the serve (DataVolley score/rotation keys, Click&Scout
 * "Modifica"). A point added that completes the set also closes it. Returns
 * null when the correction cannot apply (rally in progress, score already 0,
 * no lineup to rotate).
 */
export function buildManualCorrectionEventLog(input: {
  liveMatch: LiveMatchState;
  config: ScoutingMatchConfig;
  teamSide: TeamSide;
  correction: ManualCorrectionKind;
  createdAt?: number;
}): MatchEvent[] | null {
  const { liveMatch, teamSide, correction } = input;
  if (!liveMatch.isSetStarted || liveMatch.isRallyActive) {
    return null;
  }

  const createdAt = input.createdAt ?? Date.now();
  const event: MatchEvent = {
    id: createManualCorrectionEventId(),
    type: 'manual_correction',
    createdAt,
    setNumber: liveMatch.currentSetNumber,
    rallyNumber: liveMatch.currentRallyNumber,
    teamSide,
    correction,
  };
  const nextEventLog = [...liveMatch.eventLog, event];
  const replayed = getLiveMatchReplayStatus(liveMatch.activeProjectId, nextEventLog);
  if (!replayed.canReplay) {
    return null;
  }

  if (correction !== 'point_added') {
    return nextEventLog;
  }

  const scores = {
    homeScore: liveMatch.homeScore + (teamSide === 'home' ? 1 : 0),
    awayScore: liveMatch.awayScore + (teamSide === 'away' ? 1 : 0),
  };
  if (!isSetComplete(input.config, liveMatch.currentSetNumber, scores.homeScore, scores.awayScore)) {
    return nextEventLog;
  }

  const winningTeam: TeamSide = scores.homeScore > scores.awayScore ? 'home' : 'away';
  return [...nextEventLog, buildSetEndedEvent(liveMatch, winningTeam, scores, createdAt)];
}

