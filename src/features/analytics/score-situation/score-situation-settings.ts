// SPDX-License-Identifier: AGPL-3.0-or-later
//
// What "close finish", "leading" and "trailing" mean in the analysis filters (dashboards, video)
// and what "late in the set" means in the tactical report. Set in Settings > Analysis and kept in
// this browser, like the efficiency definitions.
//
// Runs under ts-node / esbuild scripts too: no browser APIs without a guard.

export interface ScoreSituationSettings {
  /** A set to 25 is in its final phase from this score (either team). */
  closeFrom: number;
  /** The same in a deciding set to 15. */
  closeFromDecidingSet: number;
  /** Close finish: largest gap between the teams. */
  closeMaxGap: number;
  /** Leading / trailing: smallest gap. */
  leadMinGap: number;
}

export const DEFAULT_SCORE_SITUATION_SETTINGS: Readonly<ScoreSituationSettings> = {
  closeFrom: 20,
  closeFromDecidingSet: 12,
  closeMaxGap: 2,
  leadMinGap: 1,
};

const LIMITS: Record<keyof ScoreSituationSettings, [number, number]> = {
  closeFrom: [1, 24],
  closeFromDecidingSet: [1, 14],
  closeMaxGap: [0, 10],
  leadMinGap: [1, 10],
};

const STORAGE_KEY = 'openvolleyscout.scoreSituationSettings';

let current: ScoreSituationSettings | null = null;
const listeners = new Set<() => void>();

function sanitize(value: unknown): ScoreSituationSettings {
  const result = { ...DEFAULT_SCORE_SITUATION_SETTINGS };
  if (typeof value !== 'object' || value === null) return result;
  for (const key of Object.keys(LIMITS) as (keyof ScoreSituationSettings)[]) {
    const raw = (value as Record<string, unknown>)[key];
    const [min, max] = LIMITS[key];
    if (typeof raw === 'number' && Number.isInteger(raw) && raw >= min && raw <= max) result[key] = raw;
  }
  return result;
}

/** The rules in force: the defaults, with what the user saved on top. */
export function getScoreSituationSettings(): ScoreSituationSettings {
  if (current) return current;
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    current = sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    current = { ...DEFAULT_SCORE_SITUATION_SETTINGS };
  }
  return current;
}

export function setScoreSituationSettings(patch: Partial<ScoreSituationSettings>): void {
  const next = sanitize({ ...getScoreSituationSettings(), ...patch });
  current = next;
  try {
    if (typeof window !== 'undefined') {
      const isDefault = (Object.keys(next) as (keyof ScoreSituationSettings)[])
        .every((key) => next[key] === DEFAULT_SCORE_SITUATION_SETTINGS[key]);
      if (isDefault) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
  listeners.forEach((listener) => listener());
}

export function resetScoreSituationSettings(): void {
  setScoreSituationSettings({ ...DEFAULT_SCORE_SITUATION_SETTINGS });
}

export function subscribeScoreSituationSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function scoreSituationLimits(key: keyof ScoreSituationSettings): [number, number] {
  return LIMITS[key];
}

/** Whether the score (before a rally) is in the final phase of the set: either team from `closeFrom` on. */
export function isLateInSet(home: number, away: number, setTargetPoints: number | undefined): boolean {
  const settings = getScoreSituationSettings();
  const from = setTargetPoints === 15 ? settings.closeFromDecidingSet : settings.closeFrom;
  return Math.max(home, away) >= from;
}
