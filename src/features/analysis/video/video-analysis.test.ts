/**
 * Video analysis tests: sync math, event index, filters.
 * Runs under ts-node/esm; value imports use relative paths only
 * (@src/ aliases are type-only).
 */
import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { BallTouch } from '@src/domain/touch/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { SkillEvaluation, SkillType, TeamSide, CourtPosition } from '@src/domain/common/enums';
import type { VideoSyncPoint } from '@src/domain/video/types';
import {
  computeVideoSeconds,
  getTouchEventClockSeconds,
  parseDataVolleyTimeToSeconds,
  resolveEventClockDomain,
} from './video-sync';
import { buildVideoEventIndex } from './video-event-index';
import { applyVideoEventFilters, createDefaultVideoEventFilters } from './video-filters';
import { buildClipIntervals, totalClipDurationSeconds } from './clip-export';

function createTouch(overrides: Partial<BallTouch> & { id: string; teamSide: TeamSide; skill: SkillType }): BallTouch {
  return {
    setNumber: 1,
    rallyNumber: 1,
    sequenceNumber: 1,
    createdAt: 1,
    ...overrides,
  };
}

function createLineup(teamSide: TeamSide, playerIds: string[], setterPlayerId: string): StartingLineup {
  return {
    teamSide,
    setterPlayerId,
    liberoPlayerIds: [],
    slots: playerIds.map((playerId, index) => ({
      courtPosition: (index + 1) as CourtPosition,
      playerId,
    })),
    displaySide: teamSide === 'home' ? 'left' : 'right',
  };
}

function createSyncPoint(overrides: Partial<VideoSyncPoint> & { eventClockSeconds: number; videoSeconds: number }): VideoSyncPoint {
  return {
    id: `sync-${overrides.eventClockSeconds}`,
    touchId: 'touch-anchor',
    createdAt: 0,
    ...overrides,
  };
}

describe('video-sync', () => {
  it('parses DataVolley times with dot and colon separators', () => {
    assert.strictEqual(parseDataVolleyTimeToSeconds('18.32.05'), 18 * 3600 + 32 * 60 + 5);
    assert.strictEqual(parseDataVolleyTimeToSeconds('18:32:05'), 18 * 3600 + 32 * 60 + 5);
    assert.strictEqual(parseDataVolleyTimeToSeconds('9.05'), 9 * 3600 + 5 * 60);
    assert.strictEqual(parseDataVolleyTimeToSeconds('not-a-time'), null);
    assert.strictEqual(parseDataVolleyTimeToSeconds(undefined), null);
  });

  it('resolves the clock domain by preferring DVW video times', () => {
    const withVideo = [createTouch({ id: 't1', teamSide: 'home', skill: 'serve', videoTimeSeconds: 12 })];
    const withTimeOfDay = [createTouch({ id: 't2', teamSide: 'home', skill: 'serve', recordedAtTime: '18.00.00' })];
    const withNothing = [createTouch({ id: 't3', teamSide: 'home', skill: 'serve', createdAt: 5 })];

    assert.strictEqual(resolveEventClockDomain(withVideo), 'video');
    assert.strictEqual(resolveEventClockDomain(withTimeOfDay), 'time-of-day');
    assert.strictEqual(resolveEventClockDomain(withNothing), 'none');
  });

  it('reads the event clock for the resolved domain', () => {
    const touch = createTouch({
      id: 't1',
      teamSide: 'home',
      skill: 'serve',
      videoTimeSeconds: 42,
      recordedAtTime: '18.00.10',
    });
    assert.strictEqual(getTouchEventClockSeconds(touch, 'video'), 42);
    assert.strictEqual(getTouchEventClockSeconds(touch, 'time-of-day'), 18 * 3600 + 10);
    assert.strictEqual(getTouchEventClockSeconds(touch, 'none'), null);
  });

  it('uses DVW video times directly when no sync points exist', () => {
    assert.strictEqual(computeVideoSeconds(125, [], 'video'), 125);
    assert.strictEqual(computeVideoSeconds(125, [], 'time-of-day'), null);
  });

  it('applies the offset of the nearest preceding sync point', () => {
    const syncPoints = [
      createSyncPoint({ eventClockSeconds: 100, videoSeconds: 10 }),
      createSyncPoint({ eventClockSeconds: 1000, videoSeconds: 950 }),
    ];
    // Before the first anchor: still uses the first anchor.
    assert.strictEqual(computeVideoSeconds(40, syncPoints, 'time-of-day'), 0);
    // Between the anchors: first anchor offset (-90).
    assert.strictEqual(computeVideoSeconds(400, syncPoints, 'time-of-day'), 310);
    // After the second anchor: second anchor offset (-50).
    assert.strictEqual(computeVideoSeconds(1200, syncPoints, 'time-of-day'), 1150);
  });
});

describe('video-event-index', () => {
  const homePlayers = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  const awayPlayers = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];

  function buildEvents(): MatchEvent[] {
    let clock = 0;
    const next = () => {
      clock += 1;
      return clock;
    };
    const touchEvent = (touch: BallTouch): MatchEvent => ({
      id: `event-${touch.id}`,
      type: 'touch_recorded',
      createdAt: next(),
      touch,
    });

    return [
      {
        id: 'set-1',
        type: 'set_started',
        setNumber: 1,
        createdAt: next(),
        // Home setter starts in P1, away setter starts in P2.
        homeLineup: createLineup('home', homePlayers, 'h1'),
        awayLineup: createLineup('away', awayPlayers, 'a2'),
        servingTeam: 'home',
      },
      touchEvent(createTouch({
        id: 'serve-1', teamSide: 'home', skill: 'serve', evaluation: '-', playerId: 'h1', recordedAtTime: '18.00.00',
      })),
      touchEvent(createTouch({
        id: 'receive-1', teamSide: 'away', skill: 'receive', evaluation: '+', playerId: 'a5', sequenceNumber: 2, recordedAtTime: '18.00.02',
      })),
      touchEvent(createTouch({
        id: 'attack-1', teamSide: 'away', skill: 'attack', evaluation: '#', playerId: 'a4', sequenceNumber: 3, recordedAtTime: '18.00.05',
      })),
      {
        id: 'point-1', type: 'point_awarded', createdAt: next(), setNumber: 1, rallyNumber: 1, teamSide: 'away',
      },
      touchEvent(createTouch({
        id: 'serve-2', teamSide: 'away', skill: 'serve', evaluation: '=', playerId: 'a3', rallyNumber: 2, recordedAtTime: '18.00.40',
      })),
      {
        id: 'point-2', type: 'point_awarded', createdAt: next(), setNumber: 1, rallyNumber: 2, teamSide: 'home',
      },
    ];
  }

  it('classifies breakpoint/sideout phases from the serving team', () => {
    const index = buildVideoEventIndex(buildEvents());
    const [serve1, receive1, attack1, serve2] = index.entries;

    assert.strictEqual(index.entries.length, 4);
    assert.strictEqual(serve1.phase, 'breakpoint');
    assert.strictEqual(receive1.phase, 'sideout');
    assert.strictEqual(attack1.phase, 'sideout');
    // Away won the previous rally, so away serves rally 2.
    assert.strictEqual(serve2.phase, 'breakpoint');
    assert.strictEqual(serve2.servingTeam, 'away');
  });

  it('tracks rally winner and score before the rally', () => {
    const index = buildVideoEventIndex(buildEvents());
    const [serve1, , attack1, serve2] = index.entries;

    assert.strictEqual(serve1.rallyWinner, 'away');
    assert.strictEqual(attack1.rallyWinner, 'away');
    assert.strictEqual(serve1.homeScore, 0);
    assert.strictEqual(serve1.awayScore, 0);
    assert.strictEqual(serve2.homeScore, 0);
    assert.strictEqual(serve2.awayScore, 1);
    assert.strictEqual(serve2.rallyWinner, 'home');
  });

  it('tracks setter positions through rotations', () => {
    const index = buildVideoEventIndex(buildEvents());
    const [serve1, , , serve2] = index.entries;

    // Rally 1: home setter in P1, away setter in P2.
    assert.strictEqual(serve1.homeSetterPosition, 1);
    assert.strictEqual(serve1.awaySetterPosition, 2);
    assert.strictEqual(serve1.setterPosition, 1);
    // Away won serve, so away rotated: setter moves from P2 to P1.
    assert.strictEqual(serve2.awaySetterPosition, 1);
    assert.strictEqual(serve2.homeSetterPosition, 1);
    assert.strictEqual(serve2.setterPosition, 1);
  });

  it('prefers DVW setter positions stored on the touch', () => {
    const events = buildEvents().map((event) => (
      event.type === 'touch_recorded' && event.touch.id === 'serve-1'
        ? { ...event, touch: { ...event.touch, homeSetterPosition: 6, awaySetterPosition: 3 } }
        : event
    ));
    const index = buildVideoEventIndex(events);
    assert.strictEqual(index.entries[0].homeSetterPosition, 6);
    assert.strictEqual(index.entries[0].awaySetterPosition, 3);
  });

  it('finds the first serve as the calibration anchor', () => {
    const index = buildVideoEventIndex(buildEvents());
    assert.strictEqual(index.firstServeEntry?.touchId, 'serve-1');
    assert.deepStrictEqual(index.setNumbers, [1]);
    assert.strictEqual(index.clockDomain, 'time-of-day');
    assert.strictEqual(index.entries[0].eventClockSeconds, 18 * 3600);
  });

  it('filters entries by skill, phase, setter position and outcome', () => {
    const index = buildVideoEventIndex(buildEvents());

    const serves = applyVideoEventFilters(index.entries, {
      ...createDefaultVideoEventFilters(),
      skill: 'serve',
    });
    assert.deepStrictEqual(serves.map((entry) => entry.touchId), ['serve-1', 'serve-2']);

    const breakpointActions = applyVideoEventFilters(index.entries, {
      ...createDefaultVideoEventFilters(),
      phase: 'breakpoint',
    });
    assert.deepStrictEqual(breakpointActions.map((entry) => entry.touchId), ['serve-1', 'serve-2']);

    const awaySetterInP1 = applyVideoEventFilters(index.entries, {
      ...createDefaultVideoEventFilters(),
      team: 'away',
      setterPosition: 1,
    });
    assert.deepStrictEqual(awaySetterInP1.map((entry) => entry.touchId), ['serve-2']);

    const wonByTouchTeam = applyVideoEventFilters(index.entries, {
      ...createDefaultVideoEventFilters(),
      rallyOutcome: 'won',
    });
    assert.deepStrictEqual(wonByTouchTeam.map((entry) => entry.touchId), ['receive-1', 'attack-1']);

    const errorsOnly = applyVideoEventFilters(index.entries, {
      ...createDefaultVideoEventFilters(),
      evaluations: ['='] as SkillEvaluation[],
    });
    assert.deepStrictEqual(errorsOnly.map((entry) => entry.touchId), ['serve-2']);
  });
});

describe('clip-export', () => {
  it('builds padded intervals sorted by time, skipping unsyncable entries', () => {
    const intervals = buildClipIntervals([
      { videoSeconds: 120, label: 'a' },
      { videoSeconds: null, label: 'skipped' },
      { videoSeconds: 40, label: 'b' },
    ], 3, 5);
    assert.deepStrictEqual(intervals, [
      { startSeconds: 37, endSeconds: 45, labels: [{ startSeconds: 37, endSeconds: 45, text: 'b' }] },
      { startSeconds: 117, endSeconds: 125, labels: [{ startSeconds: 117, endSeconds: 125, text: 'a' }] },
    ]);
  });

  it('clamps the clip start at zero and enforces a one-second minimum', () => {
    assert.deepStrictEqual(
      buildClipIntervals([{ videoSeconds: 2, label: 'a' }], 5, 4),
      [{ startSeconds: 0, endSeconds: 6, labels: [{ startSeconds: 0, endSeconds: 6, text: 'a' }] }],
    );
    assert.deepStrictEqual(
      buildClipIntervals([{ videoSeconds: 10, label: 'a' }], 0, 0),
      [{ startSeconds: 10, endSeconds: 11, labels: [{ startSeconds: 10, endSeconds: 11, text: 'a' }] }],
    );
  });

  it('merges overlapping clips keeping each code on its own window', () => {
    const intervals = buildClipIntervals([
      { videoSeconds: 100, label: 'a' },
      { videoSeconds: 104, label: 'b' },
      { videoSeconds: 130, label: 'c' },
    ], 3, 5);
    assert.deepStrictEqual(intervals, [
      {
        startSeconds: 97,
        endSeconds: 109,
        labels: [
          { startSeconds: 97, endSeconds: 105, text: 'a' },
          { startSeconds: 101, endSeconds: 109, text: 'b' },
        ],
      },
      {
        startSeconds: 127,
        endSeconds: 135,
        labels: [{ startSeconds: 127, endSeconds: 135, text: 'c' }],
      },
    ]);
    assert.strictEqual(totalClipDurationSeconds(intervals), 20);
  });
});
