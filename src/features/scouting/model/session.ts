import { createActiveLineup } from '@src/domain/lineup';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { MatchProject } from '@src/domain/match/types';
import type { ScoutingSession } from '@src/domain/scouting/types';
import type { CompletedSetSummary } from '@src/domain/scouting/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { TeamSide } from '@src/domain/common/enums';
import type { LiveMatchState } from './index';
import { replayLiveMatchFromEvents, getLiveMatchReplayStatus, type ReplayStatus } from './replay';

export interface StartSetSessionInput {
  activeProjectId: string;
  setNumber: number;
  homeStartingLineup: StartingLineup;
  awayStartingLineup: StartingLineup;
  servingTeam: TeamSide;
  existingEvents?: MatchEvent[];
  completedSets?: CompletedSetSummary[];
  createdAt?: number;
}

function createEventId() {
  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function buildSetStartedEvent(input: StartSetSessionInput): MatchEvent {
  return {
    id: createEventId(),
    type: 'set_started',
    setNumber: input.setNumber,
    createdAt: input.createdAt ?? Date.now(),
    homeLineup: input.homeStartingLineup,
    awayLineup: input.awayStartingLineup,
    servingTeam: input.servingTeam,
  };
}

export function createScoutingSessionFromSetStart(input: StartSetSessionInput): ScoutingSession {
  const timestamp = input.createdAt ?? Date.now();

  return {
    activeProjectId: input.activeProjectId,
    currentSetNumber: input.setNumber,
    currentRallyNumber: 1,
    homeScore: 0,
    awayScore: 0,
    servingTeam: input.servingTeam,
    homeActiveLineup: createActiveLineup(input.homeStartingLineup),
    awayActiveLineup: createActiveLineup(input.awayStartingLineup),
    isSetStarted: true,
    isRallyActive: false,
    currentRallyTouches: [],
    currentRallyPointWinner: null,
    completedSets: input.completedSets ?? [],
    startedAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createScoutingSessionSnapshot(liveMatch: LiveMatchState): ScoutingSession {
  return {
    activeProjectId: liveMatch.activeProjectId,
    currentSetNumber: liveMatch.currentSetNumber,
    currentRallyNumber: liveMatch.currentRallyNumber,
    homeScore: liveMatch.homeScore,
    awayScore: liveMatch.awayScore,
    servingTeam: liveMatch.servingTeam,
    homeActiveLineup: liveMatch.homeActiveLineup,
    awayActiveLineup: liveMatch.awayActiveLineup,
    isSetStarted: liveMatch.isSetStarted,
    isRallyActive: liveMatch.isRallyActive,
    currentRallyTouches: liveMatch.currentRallyTouches,
    currentRallyPointWinner: liveMatch.currentRallyPointWinner,
    completedSets: liveMatch.completedSets,
    startedAt: liveMatch.startedAt,
    updatedAt: liveMatch.updatedAt,
  };
}

export function createLiveMatchStateFromSetStart(
  input: StartSetSessionInput,
  event: MatchEvent = buildSetStartedEvent(input),
): LiveMatchState {
  return {
    ...createScoutingSessionFromSetStart(input),
    eventLog: [...(input.existingEvents ?? []), event],
  };
}

export function createLiveMatchStateFromProject(project: MatchProject | null | undefined): LiveMatchState | null {
  const session = project?.scoutingSession;
  if (!project) {
    return null;
  }

  const replayedLiveMatch = replayLiveMatchFromEvents(project.metadata.id, project.events);
  if (replayedLiveMatch) {
    return {
      ...replayedLiveMatch,
      completedSets: session?.completedSets ?? [],
    };
  }

  if (!session?.isSetStarted) {
    return null;
  }

  return {
    activeProjectId: session.activeProjectId || project.metadata.id,
    currentSetNumber: session.currentSetNumber,
    currentRallyNumber: session.currentRallyNumber,
    homeScore: session.homeScore,
    awayScore: session.awayScore,
    servingTeam: session.servingTeam,
    homeActiveLineup: session.homeActiveLineup,
    awayActiveLineup: session.awayActiveLineup,
    isSetStarted: session.isSetStarted,
    isRallyActive: session.isRallyActive,
    currentRallyTouches: session.currentRallyTouches,
    currentRallyPointWinner: session.currentRallyPointWinner,
    completedSets: session.completedSets,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    eventLog: project.events,
  };
}

export function getProjectReplayStatus(project: MatchProject | null | undefined): ReplayStatus {
  if (!project) {
    return {
      canReplay: false,
      reason: 'invalid_sequence',
    };
  }

  return getLiveMatchReplayStatus(project.metadata.id, project.events);
}

export function syncProjectWithLiveMatch(project: MatchProject, liveMatch: LiveMatchState): MatchProject {
  return {
    ...project,
    phase: liveMatch.isSetStarted ? 'scouting' : project.phase,
    events: liveMatch.eventLog,
    scoutingSession: createScoutingSessionSnapshot(liveMatch),
    updatedAt: liveMatch.updatedAt ?? project.updatedAt,
  };
}

function getSessionComparisonSnapshot(session: ScoutingSession) {
  return {
    activeProjectId: session.activeProjectId,
    currentSetNumber: session.currentSetNumber,
    currentRallyNumber: session.currentRallyNumber,
    homeScore: session.homeScore,
    awayScore: session.awayScore,
    servingTeam: session.servingTeam,
    homeActiveLineup: session.homeActiveLineup,
    awayActiveLineup: session.awayActiveLineup,
    isSetStarted: session.isSetStarted,
    isRallyActive: session.isRallyActive,
    currentRallyTouches: session.currentRallyTouches,
    currentRallyPointWinner: session.currentRallyPointWinner,
    completedSets: session.completedSets,
    updatedAt: session.updatedAt,
  };
}

export function isProjectSyncedWithLiveMatch(project: MatchProject, liveMatch: LiveMatchState): boolean {
  const persistedSession = project.scoutingSession;
  const lastPersistedEventId = project.events.at(-1)?.id ?? null;
  const lastLiveEventId = liveMatch.eventLog.at(-1)?.id ?? null;

  if (project.events.length !== liveMatch.eventLog.length || lastPersistedEventId !== lastLiveEventId) {
    return false;
  }

  return JSON.stringify(getSessionComparisonSnapshot(persistedSession)) === JSON.stringify(
    getSessionComparisonSnapshot(createScoutingSessionSnapshot(liveMatch)),
  );
}
