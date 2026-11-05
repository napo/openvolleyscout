import { create } from 'zustand';
import { DEFAULT_THRESHOLDS, TRAFFIC_METRICS, type OpponentReportThresholds } from './traffic-light';

const STORAGE_KEY = 'openvolleyscout.opponentReportThresholds';

function isValid(value: unknown): value is OpponentReportThresholds {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<OpponentReportThresholds>;
  return typeof candidate.minSample === 'number'
    && !!candidate.metrics
    && TRAFFIC_METRICS.every((metric) => {
      const threshold = candidate.metrics?.[metric];
      return threshold && typeof threshold.green === 'number' && typeof threshold.red === 'number';
    });
}

function read(): OpponentReportThresholds {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as unknown;
    return isValid(stored) ? stored : DEFAULT_THRESHOLDS;
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

function write(value: OpponentReportThresholds) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage blocked: the thresholds last for this session only.
  }
}

interface ThresholdsState {
  thresholds: OpponentReportThresholds;
  setThresholds: (value: OpponentReportThresholds) => void;
  reset: () => void;
}

/** Traffic-light thresholds of the opponent reports, kept on this device. */
export const useOpponentReportThresholds = create<ThresholdsState>((set) => ({
  thresholds: typeof window === 'undefined' ? DEFAULT_THRESHOLDS : read(),
  setThresholds: (value) => {
    write(value);
    set({ thresholds: value });
  },
  reset: () => {
    write(DEFAULT_THRESHOLDS);
    set({ thresholds: DEFAULT_THRESHOLDS });
  },
}));
