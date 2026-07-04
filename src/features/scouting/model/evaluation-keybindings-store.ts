import { create } from 'zustand';
import type { SkillEvaluation } from '@src/domain/common/enums';

const STORAGE_KEY = 'openvolleyscout.evaluationKeyBindings';

// Display order follows the DataVolley manuals (best to worst, then errors).
export const EVALUATION_CODES: SkillEvaluation[] = ['#', '+', '!', '-', '/', '='];

export type EvaluationKeyBindings = Record<SkillEvaluation, string>;

export type SetKeyBindingResult = { ok: true } | { ok: false; reason: 'duplicate' | 'digit' };

function getDefaultEvaluationKeyBindings(): EvaluationKeyBindings {
  return { '#': '#', '+': '+', '!': '!', '-': '-', '/': '/', '=': '=' };
}

export function isDigitKey(key: string): boolean {
  return key.length === 1 && key >= '0' && key <= '9';
}

function normalizeEvaluationKeyBindings(value: unknown): EvaluationKeyBindings {
  const defaults = getDefaultEvaluationKeyBindings();
  if (typeof value !== 'object' || value === null) {
    return defaults;
  }

  const record = value as Record<string, unknown>;
  const usedKeys = new Set<string>();
  const result = { ...defaults };

  EVALUATION_CODES.forEach((code) => {
    const candidate = record[code];
    if (typeof candidate === 'string' && candidate.length === 1 && !isDigitKey(candidate) && !usedKeys.has(candidate)) {
      result[code] = candidate;
    }
    usedKeys.add(result[code]);
  });

  return result;
}

function readStoredEvaluationKeyBindings(): EvaluationKeyBindings | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return normalizeEvaluationKeyBindings(JSON.parse(rawValue));
  } catch {
    return null;
  }
}

function writeStoredEvaluationKeyBindings(bindings: EvaluationKeyBindings) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
}

interface EvaluationKeyBindingsState {
  keyBindings: EvaluationKeyBindings;
  setKeyBinding: (code: SkillEvaluation, key: string) => SetKeyBindingResult;
  resetKeyBindings: () => void;
}

export const useEvaluationKeyBindingsStore = create<EvaluationKeyBindingsState>((set, get) => ({
  keyBindings: readStoredEvaluationKeyBindings() ?? getDefaultEvaluationKeyBindings(),
  setKeyBinding: (code, key) => {
    if (isDigitKey(key)) {
      return { ok: false, reason: 'digit' };
    }

    const current = get().keyBindings;
    const isDuplicate = EVALUATION_CODES.some((other) => other !== code && current[other] === key);
    if (isDuplicate) {
      return { ok: false, reason: 'duplicate' };
    }

    const next = { ...current, [code]: key };
    set({ keyBindings: next });
    writeStoredEvaluationKeyBindings(next);
    return { ok: true };
  },
  resetKeyBindings: () => {
    const defaults = getDefaultEvaluationKeyBindings();
    set({ keyBindings: defaults });
    writeStoredEvaluationKeyBindings(defaults);
  },
}));

/**
 * Resolves which evaluation code a pressed key should type, per the user's
 * configured bindings. Reads the store directly (not a hook) since callers
 * are keydown handlers, not render paths.
 */
export function getEvaluationForKey(key: string): SkillEvaluation | null {
  const { keyBindings } = useEvaluationKeyBindingsStore.getState();
  return EVALUATION_CODES.find((code) => keyBindings[code] === key) ?? null;
}
