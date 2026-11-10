import { create } from 'zustand';

export type TrendsFeatureId = 'priorities' | 'similarity' | 'season-trend' | 'competition' | 'rally-model';

export const TRENDS_FEATURE_IDS: TrendsFeatureId[] = [
  'priorities',
  'similarity',
  'season-trend',
  'competition',
  'rally-model',
];

const STORAGE_PREFIX = 'openvolleyscout.experimentalFeatures.trends.';

function readStoredFlag(id: TrendsFeatureId): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(STORAGE_PREFIX + id) === 'true';
}

function writeStoredFlag(id: TrendsFeatureId, value: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_PREFIX + id, String(value));
}

/** Experimental live-scouting aids (not part of the Trends tab). */
export type ScoutingFeatureId = 'predict-attacker';

export const SCOUTING_FEATURE_IDS: ScoutingFeatureId[] = ['predict-attacker'];

const SCOUTING_STORAGE_PREFIX = 'openvolleyscout.experimentalFeatures.scouting.';

function readScoutingFlag(id: ScoutingFeatureId): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(SCOUTING_STORAGE_PREFIX + id) === 'true';
  } catch {
    return false;
  }
}

function writeScoutingFlag(id: ScoutingFeatureId, value: boolean) {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(SCOUTING_STORAGE_PREFIX + id, String(value));
  } catch {
    // Storage unavailable: the choice lasts for this session only.
  }
}

interface ExperimentalFeaturesState {
  trendsFeatures: Record<TrendsFeatureId, boolean>;
  setTrendsFeatureEnabled: (id: TrendsFeatureId, value: boolean) => void;
  scoutingFeatures: Record<ScoutingFeatureId, boolean>;
  setScoutingFeatureEnabled: (id: ScoutingFeatureId, value: boolean) => void;
}

export const useExperimentalFeaturesStore = create<ExperimentalFeaturesState>((set) => ({
  trendsFeatures: Object.fromEntries(
    TRENDS_FEATURE_IDS.map((id) => [id, readStoredFlag(id)]),
  ) as Record<TrendsFeatureId, boolean>,
  setTrendsFeatureEnabled: (id, value) => {
    set((state) => ({ trendsFeatures: { ...state.trendsFeatures, [id]: value } }));
    writeStoredFlag(id, value);
  },
  scoutingFeatures: Object.fromEntries(
    SCOUTING_FEATURE_IDS.map((id) => [id, readScoutingFlag(id)]),
  ) as Record<ScoutingFeatureId, boolean>,
  setScoutingFeatureEnabled: (id, value) => {
    set((state) => ({ scoutingFeatures: { ...state.scoutingFeatures, [id]: value } }));
    writeScoutingFlag(id, value);
  },
}));

export function useIsAnyTrendsFeatureEnabled(): boolean {
  return useExperimentalFeaturesStore((state) => TRENDS_FEATURE_IDS.some((id) => state.trendsFeatures[id]));
}
