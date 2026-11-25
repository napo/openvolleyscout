// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Saved Video analysis filter combinations ("#11 attacks", "poor receptions
 * in P1"). Kept in this browser only: a per-viewer convenience, shared by
 * every match and by the multi-match view.
 */
import { toVideoChainFilters, type VideoChainFilters, type VideoTeamScope } from './video-chain-filters';

/** Where a preset is applied: one match (home/away) or several (the team studied/its opponents). */
export type VideoFilterPresetView = 'match' | 'matches';

const VIEW_TEAMS: Record<VideoFilterPresetView, readonly VideoTeamScope[]> = {
  match: ['all', 'home', 'away'],
  matches: ['all', 'focus', 'opponent'],
};

export interface VideoFilterPreset {
  id: string;
  name: string;
  /** Chain filters; presets saved before them hold the old filters, converted when applied. */
  filters: VideoChainFilters;
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
  filters: VideoChainFilters,
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
 * The filters of a preset on the current view (old presets converted): players
 * missing from it are dropped, every other field falls back to the defaults.
 * Presets are shared by both views, so a team the view cannot show becomes
 * "all" on one match and "the team studied" over several matches; old presets
 * over several matches always meant the team studied, and keep that meaning.
 */
export function applyVideoFilterPreset(
  preset: VideoFilterPreset,
  knownPlayerIds: ReadonlySet<string>,
  view: VideoFilterPresetView = 'match',
): VideoChainFilters {
  const converted = toVideoChainFilters(preset.filters);
  const isLegacy = !Array.isArray((preset.filters as Partial<VideoChainFilters> | null)?.chain);
  const fallbackTeam: VideoTeamScope = view === 'match' ? 'all' : 'focus';
  const keepsTeam = VIEW_TEAMS[view].includes(converted.team) && !(isLegacy && view === 'matches');
  const filters = { ...converted, team: keepsTeam ? converted.team : fallbackTeam };
  const attributes = Object.fromEntries(Object.entries(filters.attributes).map(([skill, attributes]) => [
    skill,
    attributes ? { ...attributes, playerIds: (attributes.playerIds ?? []).filter((id) => knownPlayerIds.has(id)) } : attributes,
  ]));
  return { ...filters, attributes };
}
