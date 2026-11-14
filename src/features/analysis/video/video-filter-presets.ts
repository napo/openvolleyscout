// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Saved Video analysis filter combinations ("#11 attacks", "poor receptions
 * in P1"). Kept in this browser only: a per-viewer convenience, shared by
 * every match and by the multi-match view.
 */
import type { VideoEventFilters } from './video-filters';

export interface VideoFilterPreset {
  id: string;
  name: string;
  filters: VideoEventFilters;
}

const STORAGE_KEY = 'openvolleyscout.videoFilterPresets';

export function loadVideoFilterPresets(): VideoFilterPreset[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is VideoFilterPreset => (
      typeof item === 'object' && item !== null
      && typeof (item as VideoFilterPreset).id === 'string'
      && typeof (item as VideoFilterPreset).name === 'string'
      && typeof (item as VideoFilterPreset).filters === 'object'
    ));
  } catch {
    return [];
  }
}

export function storeVideoFilterPresets(presets: readonly VideoFilterPreset[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Private mode or blocked storage: presets last until the page closes.
  }
}

/** Adds a preset, or replaces the one with the same name. */
export function upsertVideoFilterPreset(
  presets: readonly VideoFilterPreset[],
  name: string,
  filters: VideoEventFilters,
  now: number = Date.now(),
): VideoFilterPreset[] {
  const trimmed = name.trim();
  if (!trimmed) return [...presets];
  const existing = presets.find((preset) => preset.name.toLowerCase() === trimmed.toLowerCase());
  const preset: VideoFilterPreset = { id: existing?.id ?? `preset-${now}`, name: trimmed, filters: structuredClone(filters) };
  return existing
    ? presets.map((item) => (item.id === existing.id ? preset : item))
    : [...presets, preset].sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * The filters of a preset on the current match: players missing from this
 * match are dropped, every other field falls back to the defaults when absent.
 */
export function applyVideoFilterPreset(
  preset: VideoFilterPreset,
  defaults: VideoEventFilters,
  knownPlayerIds: ReadonlySet<string>,
): VideoEventFilters {
  const merged = { ...defaults, ...preset.filters };
  return { ...merged, playerIds: merged.playerIds.filter((id) => knownPlayerIds.has(id)) };
}
