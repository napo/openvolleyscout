import assert from 'node:assert';
import { test } from 'vitest';
import type { MatchEvent } from '@src/domain/events/types';
import type { MatchProject } from '@src/domain/match/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { TeamSide, CourtPosition } from '@src/domain/common/enums';
import { getLiveMatchReplayStatus, replayLiveMatchFromEvents } from '@src/features/scouting/model/replay';
import { buildSetStartedEvent, createLiveMatchStateFromProject, syncProjectWithLiveMatch } from '@src/features/scouting/model/session';
import { buildPointAwardedEvent, buildRallyEndedEvent, buildRallyStartedEvent, buildTouchRecordedEvent } from '@src/features/scouting/model/rally';
import { mergeMatchProjects } from './match-project-merge';

const ACTIVE_PROJECT_ID = 'match-1';

function makeLineup(teamSide: TeamSide, prefix: string): StartingLineup {
  return {
    teamSide,
    liberoPlayerIds: [],
    slots: [1, 2, 3, 4, 5, 6].map((courtPosition) => ({
      courtPosition: courtPosition as CourtPosition,
      playerId: `${prefix}${courtPosition}`,
    })),
    displaySide: teamSide === 'home' ? 'left' : 'right',
  };
}

/** Appends one full serve-ace rally (rally_started -> touch -> point -> rally_ended) using the real production builders. */
function appendServeAceRally(events: MatchEvent[], winner: TeamSide, createdAt: number): MatchEvent[] {
  let liveMatch = replayLiveMatchFromEvents(ACTIVE_PROJECT_ID, events);
  if (!liveMatch) throw new Error('fixture setup: replay failed before rally_started');
  const rallyStarted = buildRallyStartedEvent(createdAt);

  liveMatch = replayLiveMatchFromEvents(ACTIVE_PROJECT_ID, [...events, rallyStarted]);
  if (!liveMatch) throw new Error('fixture setup: replay failed after rally_started');
  const touch = buildTouchRecordedEvent({
    id: `touch-${createdAt}`,
    setNumber: liveMatch.currentSetNumber,
    rallyNumber: liveMatch.currentRallyNumber,
    sequenceNumber: 0,
    teamSide: liveMatch.servingTeam ?? 'home',
    skill: 'serve',
    createdAt: createdAt + 1,
  });

  liveMatch = replayLiveMatchFromEvents(ACTIVE_PROJECT_ID, [...events, rallyStarted, touch]);
  if (!liveMatch) throw new Error('fixture setup: replay failed after touch_recorded');
  const pointAwarded = buildPointAwardedEvent(liveMatch, winner, undefined, createdAt + 2);

  liveMatch = replayLiveMatchFromEvents(ACTIVE_PROJECT_ID, [...events, rallyStarted, touch, pointAwarded]);
  if (!liveMatch) throw new Error('fixture setup: replay failed after point_awarded');
  const rallyEnded = buildRallyEndedEvent(liveMatch, createdAt + 3);

  return [...events, rallyStarted, touch, pointAwarded, rallyEnded];
}

function buildBaseEvents(): MatchEvent[] {
  const setStarted = buildSetStartedEvent({
    activeProjectId: ACTIVE_PROJECT_ID,
    setNumber: 1,
    homeStartingLineup: makeLineup('home', 'h'),
    awayStartingLineup: makeLineup('away', 'a'),
    servingTeam: 'home',
    createdAt: 1000,
  });

  const events = appendServeAceRally([setStarted], 'home', 2000);
  const status = getLiveMatchReplayStatus(ACTIVE_PROJECT_ID, events);
  assert.strictEqual(status.canReplay, true, 'fixture must itself be a valid, replayable event log');
  return events;
}

function buildProject(events: MatchEvent[]): MatchProject {
  return {
    metadata: { id: ACTIVE_PROJECT_ID, format: 'best_of_5', schemaVersion: 4 },
    homeTeam: { id: 'home-team', code: 'HOM', name: 'Home', players: [], staff: { headCoach: '', assistantCoach: '' } },
    awayTeam: { id: 'away-team', code: 'AWY', name: 'Away', players: [], staff: { headCoach: '', assistantCoach: '' } },
    homeSelection: {
      teamId: 'home-team',
      teamName: 'Home',
      source: 'manual_entry',
      staff: { headCoach: '', assistantCoach: '' },
      roster: [],
    },
    awaySelection: {
      teamId: 'away-team',
      teamName: 'Away',
      source: 'manual_entry',
      staff: { headCoach: '', assistantCoach: '' },
      roster: [],
    },
    phase: 'scouting',
    events,
    createdAt: 100,
    updatedAt: 200,
  };
}

test('remote continuation merges cleanly and recomputes scoutingSession from the merged events', () => {
  const baseEvents = buildBaseEvents();
  const remoteEvents = appendServeAceRally(baseEvents, 'away', 3000);

  const base = buildProject(baseEvents);
  const local = buildProject(baseEvents); // unchanged on this device
  const remote = buildProject(remoteEvents);

  const result = mergeMatchProjects(base, local, remote);

  assert.strictEqual(result.status, 'merged');
  assert.deepStrictEqual(result.merged?.events, remoteEvents);

  // "Recompute, don't merge" for session state: the merged project's session
  // must match what the real session helpers produce directly from the
  // merged events, not something hand-carried from either side.
  const liveMatch = createLiveMatchStateFromProject({ ...result.merged!, scoutingSession: undefined });
  const expected = syncProjectWithLiveMatch({ ...result.merged!, scoutingSession: undefined }, liveMatch!);
  assert.deepStrictEqual(result.merged?.scoutingSession, expected.scoutingSession);
});

test('both sides continuing the same open set blocks the merge with a divergence conflict', () => {
  const baseEvents = buildBaseEvents();
  const localEvents = appendServeAceRally(baseEvents, 'home', 3000);
  const remoteEvents = appendServeAceRally(baseEvents, 'away', 3000);

  const base = buildProject(baseEvents);
  const local = buildProject(localEvents);
  const remote = buildProject(remoteEvents);

  const result = mergeMatchProjects(base, local, remote);

  assert.strictEqual(result.status, 'blocked');
  assert.strictEqual(result.blockedReason, 'open_set_divergence');
  assert.strictEqual(result.divergenceConflicts.length, 1);
  assert.strictEqual(result.divergenceConflicts[0].setNumber, 1);
});

test('two not-yet-started matches (no set_started at all) merge cleanly instead of being blocked as unreplayable', () => {
  const base = buildProject([]);
  const local = buildProject([]);
  const remote = buildProject([]);

  const result = mergeMatchProjects(base, local, remote);

  assert.strictEqual(result.status, 'merged');
  assert.deepStrictEqual(result.merged?.events, []);
  // normalizeMatchProject backfills a sensible "not started" session default
  // rather than leaving it undefined — the point of this test is just that
  // the merge isn't rejected as `unreplayable_sequence`.
  assert.strictEqual(result.merged?.scoutingSession?.isSetStarted, false);
  assert.strictEqual(result.merged?.scoutingSession?.matchStatus, 'not_started');
});

test('resolving the divergence lets the merge proceed', () => {
  const baseEvents = buildBaseEvents();
  const localEvents = appendServeAceRally(baseEvents, 'home', 3000);
  const remoteEvents = appendServeAceRally(baseEvents, 'away', 3000);

  const base = buildProject(baseEvents);
  const local = buildProject(localEvents);
  const remote = buildProject(remoteEvents);

  const result = mergeMatchProjects(base, local, remote, { 1: 'local' });

  assert.strictEqual(result.status, 'merged');
  assert.deepStrictEqual(result.merged?.events, localEvents);
});
