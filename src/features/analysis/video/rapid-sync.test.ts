// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { VideoSyncPoint } from '@src/domain/video/types';
import { computeVideoSeconds } from './video-sync';
import { addRapidSyncPoint, buildRapidSyncQueue, getRapidSyncStartIndex, type RapidSyncEntry } from './rapid-sync';

const entry = (touchId: string, setNumber: number, rallyNumber: number, skill: string, clock: number | null): RapidSyncEntry => (
  { touchId, setNumber, rallyNumber, skill, eventClockSeconds: clock }
);
const entries = [
  entry('s1', 1, 1, 'serve', 100), entry('r1', 1, 1, 'receive', 102), entry('a1', 1, 1, 'attack', 105),
  entry('s2', 1, 2, 'serve', 130),
  entry('s3', 1, 3, 'serve', null),
  entry('s4', 2, 1, 'serve', 900), entry('s4b', 2, 1, 'serve', 905),
];

describe('rapid sync queue', () => {
  const queue = buildRapidSyncQueue(entries);

  it('keeps one syncable serve per rally, in match order', () => {
    expect(queue.map((e) => e.touchId)).toEqual(['s1', 's2', 's4']);
  });

  it('starts at the rally of the selected action', () => {
    expect(getRapidSyncStartIndex(queue, [], { setNumber: 1, rallyNumber: 2 })).toBe(1);
    // rally 3 has no syncable serve: the next one
    expect(getRapidSyncStartIndex(queue, [], { setNumber: 1, rallyNumber: 3 })).toBe(2);
  });

  it('otherwise starts after the last serve already synchronized', () => {
    expect(getRapidSyncStartIndex(queue, [], null)).toBe(0);
    const points = addRapidSyncPoint([], queue[0]!, '*01S', 40, 1);
    expect(getRapidSyncStartIndex(queue, points, null)).toBe(1);
  });
});

describe('rapid sync taps', () => {
  const queue = buildRapidSyncQueue(entries);

  it('one tap per rally lines up each rally, whatever the gap', () => {
    let points: VideoSyncPoint[] = [];
    points = addRapidSyncPoint(points, queue[0]!, '*01S', 40, 1);
    points = addRapidSyncPoint(points, queue[1]!, 'a02S', 78, 2); // the pause was 8 s longer on video
    expect(computeVideoSeconds(100, points, 'time-of-day')).toBe(40);
    expect(computeVideoSeconds(105, points, 'time-of-day')).toBe(45); // attack of rally 1 follows its serve
    expect(computeVideoSeconds(130, points, 'time-of-day')).toBe(78);
  });

  it('a second tap on the same serve replaces the first', () => {
    let points = addRapidSyncPoint([], queue[0]!, '*01S', 40, 1);
    points = addRapidSyncPoint(points, queue[0]!, '*01S', 43, 2);
    expect(points).toHaveLength(1);
    expect(points[0]!.videoSeconds).toBe(43);
    expect(points[0]!.scope).toBe('anchor');
  });

  it('leaves per-action corrections alone', () => {
    const correction: VideoSyncPoint = { id: 'c', touchId: 'a1', eventClockSeconds: 105, videoSeconds: 50, scope: 'single', createdAt: 0 };
    const points = addRapidSyncPoint([correction], queue[0]!, '*01S', 40, 1);
    expect(points).toContainEqual(correction);
  });

  it('bounds rapid sync taps to the current rally so later rallies do not shift', () => {
    let points = addRapidSyncPoint([], queue[0]!, '*01S', 40, 1, { nextEntry: queue[1] });
    // First tap established the baseline anchor; tapping rally 2 with a 15 s shift
    // aligns rally 2 without moving rally 3 (at clock 900) off the baseline.
    points = addRapidSyncPoint(points, queue[1]!, 'a02S', 85, 2, { nextEntry: queue[2] });
    expect(points.find((p) => p.touchId === 's2')?.untilEventClockSeconds).toBe(900);
    expect(computeVideoSeconds(130, points, 'time-of-day')).toBe(85);
    expect(computeVideoSeconds(135, points, 'time-of-day')).toBe(90);
    // Rally 3 (clock 900) still uses the baseline anchor (40 + 800 = 840), not 85 + 770 = 855.
    expect(computeVideoSeconds(900, points, 'time-of-day', 'step')).toBe(840);
    expect(computeVideoSeconds(900, points, 'time-of-day', 'linear')).toBe(840);
  });

  it('keeps DVW video times untouched for later rallies even on the first rapid tap', () => {
    const points = addRapidSyncPoint([], queue[0]!, '*01S', 40, 1, {
      nextEntry: queue[1],
      hasBaseline: true,
    });
    expect(computeVideoSeconds(100, points, 'video')).toBe(40);
    expect(computeVideoSeconds(105, points, 'video')).toBe(45);
    expect(computeVideoSeconds(130, points, 'video')).toBe(130);
  });

  it('allows an anchor placed inside a rapid-synced rally to override from that action on', () => {
    let points = addRapidSyncPoint([], queue[0]!, '*01S', 40, 1, { nextEntry: queue[1] });
    points = addRapidSyncPoint(points, queue[1]!, 'a02S', 85, 2, { nextEntry: queue[2] });
    const midRallyAnchor: VideoSyncPoint = {
      id: 'a-mid',
      touchId: 'a2',
      eventClockSeconds: 135,
      videoSeconds: 95,
      scope: 'anchor',
      createdAt: 3,
    };
    const next = [...points, midRallyAnchor];
    expect(computeVideoSeconds(130, next, 'time-of-day')).toBe(85);
    expect(computeVideoSeconds(135, next, 'time-of-day')).toBe(95);
    expect(computeVideoSeconds(140, next, 'time-of-day')).toBe(100);
  });
});
