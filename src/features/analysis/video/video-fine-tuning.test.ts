// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { VideoSyncPoint } from '@src/domain/video/types';
import { getFineTuneAction, nudgeActionSyncPoint } from './video-fine-tuning';
import { applyVideoFilterPreset, upsertVideoFilterPreset } from './video-filter-presets';
import { createDefaultVideoChainFilters } from './video-chain-filters';

const key = (k: string, shiftKey = false) => ({ key: k, shiftKey, ctrlKey: false, metaKey: false, altKey: false, target: null });

describe('fine tuning', () => {
  it('maps Q / W and Shift + arrows', () => {
    expect(getFineTuneAction(key('q'))).toEqual({ kind: 'nudge', seconds: -0.5 });
    expect(getFineTuneAction(key('W', true))).toEqual({ kind: 'nudge', seconds: 0.1 });
    expect(getFineTuneAction(key('ArrowLeft', true))).toEqual({ kind: 'frame', direction: -1 });
    expect(getFineTuneAction(key('ArrowLeft'))).toBeNull();
    expect(getFineTuneAction({ ...key('q'), ctrlKey: true })).toBeNull();
  });

  it('turns a nudge into a correction on that action only', () => {
    const points = nudgeActionSyncPoint([], { touchId: 't', label: 'a', eventClockSeconds: 50 }, 100, -0.5, 7);
    expect(points).toEqual([{ id: 'sync-t-7', touchId: 't', label: 'a', eventClockSeconds: 50, videoSeconds: 99.5, scope: 'single', createdAt: 7 }]);
    const again = nudgeActionSyncPoint(points, { touchId: 't', eventClockSeconds: 50 }, 99.5, -0.5, 9);
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ id: 'sync-t-7', videoSeconds: 99 });
  });

  it('moves an anchor without changing its scope', () => {
    const anchor: VideoSyncPoint = { id: 'x', touchId: 't', eventClockSeconds: 50, videoSeconds: 100, scope: 'anchor', createdAt: 1 };
    const [moved] = nudgeActionSyncPoint([anchor], { touchId: 't', eventClockSeconds: 50 }, 100, 0.5);
    expect(moved).toMatchObject({ scope: 'anchor', videoSeconds: 100.5 });
  });
});

describe('saved filters', () => {
  it('replaces a preset with the same name and drops players of other matches', () => {
    const defaults = createDefaultVideoChainFilters();
    let presets = upsertVideoFilterPreset([], 'Attacks #11', { ...defaults, chain: ['attack'], attributes: { attack: { playerIds: ['p11'] } } }, 1);
    presets = upsertVideoFilterPreset(presets, 'attacks #11', { ...defaults, chain: ['serve', 'attack'], attributes: { attack: { playerIds: ['p11', 'p4'] } } }, 2);
    expect(presets).toHaveLength(1);
    const applied = applyVideoFilterPreset(presets[0]!, new Set(['p4']));
    expect(applied.chain).toEqual(['serve', 'attack']);
    expect(applied.attributes.attack?.playerIds).toEqual(['p4']);
  });

  it('converts presets saved before the chain filters', () => {
    const legacy = { id: 'old', name: 'Old', filters: { skills: ['attack'], playerIds: ['p4', 'p9'], evaluations: ['#'], phase: 'breakpoint' } };
    const applied = applyVideoFilterPreset(legacy as never, new Set(['p4']));
    expect(applied).toMatchObject({ chain: ['attack'], phases: ['break_point', 'transition_break_point'], attributes: { attack: { playerIds: ['p4'], evaluations: ['#'] } } });
  });

  it('brings back only the team choices the view can show', () => {
    const defaults = createDefaultVideoChainFilters();
    const studied = upsertVideoFilterPreset([], 'Studied', { ...defaults, team: 'focus' }, 1)[0]!;
    const home = upsertVideoFilterPreset([], 'Home', { ...defaults, team: 'home' }, 1)[0]!;
    const both = upsertVideoFilterPreset([], 'Both', { ...defaults, team: 'all' }, 1)[0]!;
    const legacy = { id: 'old', name: 'Old', filters: { team: 'all', skills: ['attack'] } };
    expect(applyVideoFilterPreset(studied, new Set(), 'match').team).toBe('all');
    expect(applyVideoFilterPreset(home, new Set(), 'match').team).toBe('home');
    expect(applyVideoFilterPreset(studied, new Set(), 'matches').team).toBe('focus');
    expect(applyVideoFilterPreset(home, new Set(), 'matches').team).toBe('focus');
    expect(applyVideoFilterPreset(both, new Set(), 'matches').team).toBe('all');
    // Old presets over several matches only ever showed the team studied.
    expect(applyVideoFilterPreset(legacy as never, new Set(), 'matches').team).toBe('focus');
    expect(applyVideoFilterPreset(legacy as never, new Set(), 'match').team).toBe('all');
  });
});
