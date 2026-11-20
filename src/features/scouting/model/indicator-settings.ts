// SPDX-License-Identifier: AGPL-3.0-or-later
//
// What counts as positive and as negative in the efficiency of serve, reception and attack.
//
// The defaults are the DataVolley definitions (DATAVOLLEY_OV1_INDICATORS). The user can move each
// evaluation symbol (#, +, !, -, /, =) to "positive", "neutral" or "negative" in Settings > Analysis;
// the choice is kept in this browser and every efficiency in the app reads it from here.
//
// Runs under ts-node / esbuild scripts too: relative imports only, and no browser APIs without a guard.

import {
  DATAVOLLEY_OV1_INDICATORS,
  EVALUATION_SYMBOLS,
  makeIndicators,
  type EfficiencyDefinition,
  type EvaluationSymbol,
  type IndicatorConfig,
} from './indicators';

/** The skills whose efficiency is made of evaluation symbols (the block uses another denominator). */
export const EDITABLE_EFFICIENCY_SKILLS = ['serve', 'receive', 'attack'] as const;
export type EditableEfficiencySkill = (typeof EDITABLE_EFFICIENCY_SKILLS)[number];

export type SymbolRole = 'positive' | 'neutral' | 'negative';

const STORAGE_KEY = 'openvolleyscout.efficiencyDefinitions';

type SavedDefinitions = Partial<Record<EditableEfficiencySkill, EfficiencyDefinition>>;

let saved: SavedDefinitions | null = null;
let cachedConfig: IndicatorConfig | null = null;
const listeners = new Set<() => void>();

const isSymbol = (value: unknown): value is EvaluationSymbol => (
  typeof value === 'string' && (EVALUATION_SYMBOLS as readonly string[]).includes(value)
);

/** A definition is usable when its symbols are known and none is both positive and negative. */
export function sanitizeEfficiencyDefinition(value: unknown): EfficiencyDefinition | null {
  if (typeof value !== 'object' || value === null) return null;
  const { positive, negative } = value as { positive?: unknown; negative?: unknown };
  if (!Array.isArray(positive) || !Array.isArray(negative)) return null;
  const pos = [...new Set(positive.filter(isSymbol))];
  const neg = [...new Set(negative.filter(isSymbol))];
  if (pos.some((symbol) => neg.includes(symbol))) return null;
  return { positive: pos, negative: neg };
}

function readSaved(): SavedDefinitions {
  if (saved) return saved;
  saved = {};
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed === 'object' && parsed !== null) {
      for (const skill of EDITABLE_EFFICIENCY_SKILLS) {
        const definition = sanitizeEfficiencyDefinition((parsed as Record<string, unknown>)[skill]);
        if (definition) saved[skill] = definition;
      }
    }
  } catch {
    // Storage unavailable or corrupt: the defaults apply.
  }
  return saved;
}

function persist(next: SavedDefinitions): void {
  saved = next;
  cachedConfig = null;
  try {
    if (typeof window !== 'undefined') {
      if (Object.keys(next).length === 0) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
  listeners.forEach((listener) => listener());
}

/** The indicator configuration in force: the defaults, with the user's efficiency rules on top. */
export function getActiveIndicatorConfig(): IndicatorConfig {
  if (cachedConfig) return cachedConfig;
  cachedConfig = {
    ...DATAVOLLEY_OV1_INDICATORS,
    efficiency: { ...DATAVOLLEY_OV1_INDICATORS.efficiency, ...readSaved() },
  };
  return cachedConfig;
}

/** The indicators (efficiency, positive rate, kill rate) bound to the configuration in force. */
export function getActiveIndicators() {
  return makeIndicators(getActiveIndicatorConfig());
}

export function getEfficiencyDefinition(skill: EditableEfficiencySkill): EfficiencyDefinition {
  return getActiveIndicatorConfig().efficiency[skill] ?? DATAVOLLEY_OV1_INDICATORS.efficiency[skill]!;
}

export function getDefaultEfficiencyDefinition(skill: EditableEfficiencySkill): EfficiencyDefinition {
  return DATAVOLLEY_OV1_INDICATORS.efficiency[skill]!;
}

/** Saves the rule of one skill; a rule equal to the default is simply forgotten. */
export function setEfficiencyDefinition(skill: EditableEfficiencySkill, definition: EfficiencyDefinition): boolean {
  const clean = sanitizeEfficiencyDefinition(definition);
  if (!clean) return false;
  const next = { ...readSaved() };
  if (sameDefinition(clean, getDefaultEfficiencyDefinition(skill))) delete next[skill];
  else next[skill] = clean;
  persist(next);
  return true;
}

export function resetEfficiencyDefinitions(): void {
  persist({});
}

export function isEfficiencyCustomized(skill?: EditableEfficiencySkill): boolean {
  const current = readSaved();
  return skill ? Boolean(current[skill]) : Object.keys(current).length > 0;
}

export function subscribeIndicatorSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Forgets what was read from storage (tests, and after the storage was changed from outside). */
export function reloadIndicatorSettings(): void {
  saved = null;
  cachedConfig = null;
  listeners.forEach((listener) => listener());
}

function sameDefinition(a: EfficiencyDefinition, b: EfficiencyDefinition): boolean {
  const key = (list: readonly string[]) => [...list].sort().join('');
  return key(a.positive) === key(b.positive) && key(a.negative) === key(b.negative);
}

export function symbolRole(definition: EfficiencyDefinition, symbol: EvaluationSymbol): SymbolRole {
  if (definition.positive.includes(symbol)) return 'positive';
  if (definition.negative.includes(symbol)) return 'negative';
  return 'neutral';
}

/** The definition that puts each symbol where the roles say. */
export function definitionFromRoles(roles: Record<EvaluationSymbol, SymbolRole>): EfficiencyDefinition {
  return {
    positive: EVALUATION_SYMBOLS.filter((symbol) => roles[symbol] === 'positive'),
    negative: EVALUATION_SYMBOLS.filter((symbol) => roles[symbol] === 'negative'),
  };
}

/** Human formula of a definition, e.g. "(# + + − - − =) / total". */
export function describeEfficiency(definition: EfficiencyDefinition): string {
  const join = (symbols: readonly EvaluationSymbol[]) => symbols.join(' + ');
  const positive = join(definition.positive) || '0';
  const negative = join(definition.negative);
  return negative ? `(${positive} - (${negative})) / total` : `(${positive}) / total`;
}
