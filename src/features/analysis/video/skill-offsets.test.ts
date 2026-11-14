// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { MatchEvent } from '@src/domain/events/types';
import type { VideoSyncPoint } from '@src/domain/video/types';
import { buildVideoEventIndex, computeEntryVideoSeconds, resolveIndexSyncPoints } from './video-event-index';
import { setSkillOffset } from './SkillOffsetsControl';

const touch = (id: string, seq: number, skill: 'serve' | 'receive' | 'set' | 'attack' | 'dig', video: number): MatchEvent => ({
  id: `e-${id}`,
  type: 'touch_recorded',
  createdAt: seq,
  touch: { id, setNumber: 1, rallyNumber: 1, sequenceNumber: seq, teamSide: 'home', playerId: 'p', skill, evaluation: '+', videoTimeSeconds: video, createdAt: seq },
} as MatchEvent);
const events = [touch('s', 1, 'serve', 100), touch('r', 2, 'receive', 101), touch('e', 3, 'set', 102), touch('a', 4, 'attack', 103), touch('d', 5, 'dig', 103)];
const index = buildVideoEventIndex(events);
const byId = (id: string) => index.entries.find((entry) => entry.touchId === id)!;

describe('per-skill offsets and linked corrections', () => {
  it('links receptions to their serve and digs to the attack', () => {
    expect(byId('r').linkedTouchId).toBe('s');
    expect(byId('d').linkedTouchId).toBe('a');
    expect(byId('e').linkedTouchId).toBeUndefined();
  });

  it('moves every action of a skill, except one carrying its own point', () => {
    const offsets = { serve: -2 };
    expect(computeEntryVideoSeconds(byId('s'), [], 'video', 'step', offsets)).toBe(98);
    expect(computeEntryVideoSeconds(byId('r'), [], 'video', 'step', offsets)).toBe(101);
    const pinned: VideoSyncPoint[] = [{ id: 'p', touchId: 's', eventClockSeconds: 100, videoSeconds: 105, scope: 'single', createdAt: 1 }];
    expect(computeEntryVideoSeconds(byId('s'), pinned, 'video', 'step', offsets)).toBe(105);
  });

  it('carries a correction on a serve to its reception', () => {
    const points: VideoSyncPoint[] = [{ id: 'p', touchId: 's', eventClockSeconds: 100, videoSeconds: 96, scope: 'single', createdAt: 1 }];
    const effective = resolveIndexSyncPoints(points, index);
    expect(computeEntryVideoSeconds(byId('r'), effective, 'video', 'step')).toBe(96);
    expect(computeEntryVideoSeconds(byId('e'), effective, 'video', 'step')).toBe(102);
  });

  it('keeps offsets tidy', () => {
    expect(setSkillOffset({ serve: -2 }, 'serve', 0)).toEqual({});
    expect(setSkillOffset({}, 'attack', -1.04)).toEqual({ attack: -1 });
    expect(setSkillOffset({}, 'dig', 40)).toEqual({ dig: 10 });
  });
});
