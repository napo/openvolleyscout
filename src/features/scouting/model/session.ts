import { createActiveLineup } from '@src/domain/lineup';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { MatchProject } from '@src/domain/match/types';
import { normalizeScoutingMode } from '@src/domain/scouting';
import type { ScoutingMode, ScoutingSession } from '@src/domain/scouting/types';
import type { CompletedSetSummary } from '@src/domain/scouting/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { TeamSide } from '@src/domain/common/enums';
import {
  getCompletedSetsFromEvents,
  getMatchWinnerSide,
  getScoutingMatchStatus,
  isMatchComplete,
  mergeCompletedSets,
} from '@src/domain/scouting';
import type { LiveMatchState } from './index';
import { replayLiveMatchFromEvents, getLiveMatchReplayStatus, type ReplayStatus } from './replay';
import { normalizeActiveLineup } from './personnel';

export interface StartSetSessionInput {
  activeProjectId: string;
  setNumber: number;
  homeStartingLineup: StartingLineup;
  awayStartingLineup: StartingLineup;
  servingTeam: TeamSide;
  scoutingMode?: ScoutingMode;
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
    scoutingMode: normalizeScoutingMode(input.scoutingMode),
    currentSetNumber: input.setNumber,
    currentRallyNumber: 1,
    homeScore: 0,
    awayScore: 0,
    servingTeam: input.servingTeam,
    homeActiveLineup: createActiveLineup(input.homeStartingLineup, { servingTeam: input.servingTeam }),
    awayActiveLineup: createActiveLineup(input.awayStartingLineup, { servingTeam: input.servingTeam }),
    isSetStarted: true,
    isRallyActive: false,
    currentRallyTouches: [],
    currentRallyPointWinner: null,
    currentBallPath: null,
    completedSets: input.completedSets ?? [],
    matchStatus: 'in_progress',
    matchWinner: null,
    goldenSetScore: null,
    startedAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createScoutingSessionSnapshot(
  liveMatch: LiveMatchState,
  project?: MatchProject,
): ScoutingSession {
  const config = project?.scoutingConfig;
  const matchStatus = getScoutingMatchStatus({
    config,
    completedSets: liveMatch.completedSets,
    isSetStarted: liveMatch.isSetStarted,
    eventCount: liveMatch.eventLog.length,
  });
  const goldenSetScore = liveMatch.goldenSetScore ?? null;

  return {
    activeProjectId: liveMatch.activeProjectId,
    scoutingMode: normalizeScoutingMode(liveMatch.scoutingMode),
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
    currentBallPath: liveMatch.currentBallPath,
    completedSets: liveMatch.completedSets,
    matchStatus,
    matchWinner: getMatchWinnerSide({ config, completedSets: liveMatch.completedSets, goldenSetScore }),
    goldenSetScore,
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
  const completedSets = mergeCompletedSets(
    session?.completedSets,
    getCompletedSetsFromEvents(project.events),
  );

  if (replayedLiveMatch) {
    return {
      ...replayedLiveMatch,
      scoutingMode: normalizeScoutingMode(session?.scoutingMode ?? replayedLiveMatch.scoutingMode),
      completedSets,
      matchStatus: session?.matchStatus,
      matchWinner: session?.matchWinner,
      goldenSetScore: session?.goldenSetScore ?? null,
    };
  }

  if (!session?.isSetStarted) {
    return null;
  }

  return {
    activeProjectId: session.activeProjectId || project.metadata.id,
    scoutingMode: normalizeScoutingMode(session.scoutingMode),
    currentSetNumber: session.currentSetNumber,
    currentRallyNumber: session.currentRallyNumber,
    homeScore: session.homeScore,
    awayScore: session.awayScore,
    servingTeam: session.servingTeam,
    homeActiveLineup: session.homeActiveLineup ? normalizeActiveLineup(session.homeActiveLineup) : null,
    awayActiveLineup: session.awayActiveLineup ? normalizeActiveLineup(session.awayActiveLineup) : null,
    isSetStarted: session.isSetStarted,
    isRallyActive: session.isRallyActive,
    currentRallyTouches: session.currentRallyTouches,
    currentRallyPointWinner: session.currentRallyPointWinner,
    currentBallPath: session.currentBallPath,
    completedSets,
    matchStatus: session.matchStatus,
    matchWinner: session.matchWinner,
    goldenSetScore: session.goldenSetScore ?? null,
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
  const scoutingSession = createScoutingSessionSnapshot(liveMatch, project);
  const shouldCloseMatch = Boolean(project.scoutingConfig && isMatchComplete(project.scoutingConfig, scoutingSession.completedSets));

  return {
    ...project,
    phase: shouldCloseMatch ? 'closed' : liveMatch.isSetStarted ? 'scouting' : project.phase,
    events: liveMatch.eventLog,
    scoutingSession,
    updatedAt: liveMatch.updatedAt ?? project.updatedAt,
  };
}

function getSessionComparisonSnapshot(session: ScoutingSession) {
  return {
    activeProjectId: session.activeProjectId,
    scoutingMode: normalizeScoutingMode(session.scoutingMode),
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
    currentBallPath: session.currentBallPath,
    completedSets: session.completedSets,
    matchStatus: session.matchStatus,
    matchWinner: session.matchWinner,
    goldenSetScore: session.goldenSetScore,
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

  if (!persistedSession) {
    return false;
  }

  return JSON.stringify(getSessionComparisonSnapshot(persistedSession)) === JSON.stringify(
    getSessionComparisonSnapshot(createScoutingSessionSnapshot(liveMatch, project)),
  );
}
