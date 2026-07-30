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

interface ExperimentalFeaturesState {
  trendsFeatures: Record<TrendsFeatureId, boolean>;
  setTrendsFeatureEnabled: (id: TrendsFeatureId, value: boolean) => void;
}

export const useExperimentalFeaturesStore = create<ExperimentalFeaturesState>((set) => ({
  trendsFeatures: Object.fromEntries(
    TRENDS_FEATURE_IDS.map((id) => [id, readStoredFlag(id)]),
  ) as Record<TrendsFeatureId, boolean>,
  setTrendsFeatureEnabled: (id, value) => {
    set((state) => ({ trendsFeatures: { ...state.trendsFeatures, [id]: value } }));
    writeStoredFlag(id, value);
  },
}));

export function useIsAnyTrendsFeatureEnabled(): boolean {
  return useExperimentalFeaturesStore((state) => TRENDS_FEATURE_IDS.some((id) => state.trendsFeatures[id]));
}
