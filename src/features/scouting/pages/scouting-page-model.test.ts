// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  VIDEO_NOTICE_STORAGE_KEY,
  formatCurrentEventLabel,
  getLatestPointTeamSide,
  readDismissedVideoNotices,
  resolveVideoHiddenReason,
  writeDismissedVideoNotices,
} from './scouting-page-model';

const t = (key: string) => `t:${key}`;

describe('formatCurrentEventLabel', () => {
  it('maps known event types and falls back to waiting for the set', () => {
    expect(formatCurrentEventLabel('point_awarded', t as never)).toBe('t:pointAwarded');
    expect(formatCurrentEventLabel('substitution_made', t as never)).toBe('t:substitution');
    expect(formatCurrentEventLabel(undefined, t as never)).toBe('t:waitingToStartSet');
    expect(formatCurrentEventLabel('unknown', t as never)).toBe('t:waitingToStartSet');
  });
});

describe('getLatestPointTeamSide', () => {
  it('returns the team of the last point_awarded event, or null', () => {
    const log = [
      { type: 'point_awarded', teamSide: 'home' },
      { type: 'rally_ended' },
      { type: 'point_awarded', teamSide: 'away' },
      { type: 'touch_recorded' },
    ] as never;
    expect(getLatestPointTeamSide(log)).toBe('away');
    expect(getLatestPointTeamSide([{ type: 'rally_ended' }] as never)).toBeNull();
    expect(getLatestPointTeamSide(undefined)).toBeNull();
  });
});

describe('dismissed video notices storage', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  function stubStorage(initial?: string) {
    const store = new Map<string, string>(initial === undefined ? [] : [[VIDEO_NOTICE_STORAGE_KEY, initial]]);
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } } });
    return store;
  }

  it('round-trips the reasons', () => {
    stubStorage();
    writeDismissedVideoNotices(['small-screen']);
    expect(readDismissedVideoNotices()).toEqual(['small-screen']);
  });

  it('ignores unknown reasons and corrupt values', () => {
    stubStorage('["small-screen","bogus",3]');
    expect(readDismissedVideoNotices()).toEqual(['small-screen']);
    stubStorage('not json');
    expect(readDismissedVideoNotices()).toEqual([]);
  });

  it('does not throw when storage is unavailable', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } } });
    expect(readDismissedVideoNotices()).toEqual([]);
    expect(() => writeDismissedVideoNotices(['small-screen'])).not.toThrow();
  });
});

describe('resolveVideoHiddenReason', () => {
  const base = { isLiveRally: true, isSmartphoneLandscape: false, isSmartphonePortrait: false, isTagInputLiveRally: false, hasVideoSidebarSpace: true };

  it('hides nothing outside the live rally or when there is room', () => {
    expect(resolveVideoHiddenReason({ ...base, isLiveRally: false, isSmartphonePortrait: true })).toBeNull();
    expect(resolveVideoHiddenReason(base)).toBeNull();
  });

  it('a smartphone in either orientation is a small screen', () => {
    expect(resolveVideoHiddenReason({ ...base, isSmartphoneLandscape: true })).toBe('small-screen');
    expect(resolveVideoHiddenReason({ ...base, isSmartphonePortrait: true })).toBe('small-screen');
  });

  it('Tags input without sidebar space is a narrow screen; small screen wins over it', () => {
    expect(resolveVideoHiddenReason({ ...base, isTagInputLiveRally: true, hasVideoSidebarSpace: false })).toBe('tag-narrow-screen');
    expect(resolveVideoHiddenReason({ ...base, isTagInputLiveRally: true, hasVideoSidebarSpace: false, isSmartphonePortrait: true })).toBe('small-screen');
    expect(resolveVideoHiddenReason({ ...base, isTagInputLiveRally: true })).toBeNull();
  });
});
