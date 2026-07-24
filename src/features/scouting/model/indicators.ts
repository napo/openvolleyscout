// src/features/scouting/model/indicators.ts
//
// Configurable skill performance indicators.
//
// The default configuration (DATAVOLLEY_OV1_INDICATORS) mirrors
// openvolley/volleyreport `R/indicators.R` for style "ov1", which in turn
// reflects the DataVolley / FIVB efficiency definitions:
//
//   attack_eff    = (kills − errors − blocked) / attacks
//   serve_eff     = (ace + positive − negative − error) / serves
//   reception_eff = (perfect + positive − poor − error) / receptions
//
// Everything is expressed as weighted sums of the six DataVolley evaluation
// symbols, so a user (or a Season config) can redefine any formula — including
// the per-symbol weights, exactly like DataVolley's "Efficienza" table.
//
// Indicators return raw ratios (or null when undefined), matching the existing
// `safeDivide` convention in match-stats.ts. Percentage rounding stays in the
// report layer.

import type { SkillStats } from './match-stats';

export type EvaluationSymbol = '#' | '+' | '!' | '-' | '/' | '=';

/** The six DataVolley evaluation symbols, in conventional display order. */
export const EVALUATION_SYMBOLS: readonly EvaluationSymbol[] = ['#', '+', '!', '-', '/', '='];

/** Skills that have a meaningful efficiency / rate indicator. */
export type IndicatorSkill = 'serve' | 'receive' | 'attack' | 'block' | 'dig' | 'set' | 'freeball';

/** Map each evaluation symbol to its counter field on SkillStats. */
const SYMBOL_FIELD: Record<EvaluationSymbol, keyof SkillStats> = {
  '#': 'hash',
  '+': 'plus',
  '!': 'exclamation',
  '-': 'minus',
  '/': 'slash',
  '=': 'equal',
};

/** Read the count for a single evaluation symbol from a SkillStats record. */
export function symbolCount(stats: SkillStats, symbol: EvaluationSymbol): number {
  const value = stats[SYMBOL_FIELD[symbol]];
  return typeof value === 'number' ? value : 0;
}

/**
 * Canonical best→worst color for each evaluation symbol — a single green→red
 * gradient shared by every chart that breaks values down by evaluation (the
 * Priorities drill-down stacked bar, the direction heatmap arrows), so the
 * same color always means the same evaluation across the app.
 */
export const EVALUATION_SYMBOL_COLOR: Record<EvaluationSymbol, string> = {
  '#': '#16a34a',
  '+': '#86efac',
  '!': '#fbbf24',
  '-': '#fb923c',
  '/': '#f87171',
  '=': '#dc2626',
};

/** Neutral fallback for touches with no recorded evaluation. */
export const EVALUATION_SYMBOL_COLOR_NEUTRAL = '#6b7280';

export function evaluationSymbolColor(symbol: EvaluationSymbol | undefined): string {
  return symbol ? EVALUATION_SYMBOL_COLOR[symbol] : EVALUATION_SYMBOL_COLOR_NEUTRAL;
}

/**
 * Efficiency = (Σ weight·count over positive symbols − Σ weight·count over
 * negative symbols) / total. Symbols not listed contribute 0. `weights` lets a
 * single symbol carry a non-unit coefficient (DataVolley "Efficienza" style);
 * when omitted every listed symbol weighs 1.
 */
export interface EfficiencyDefinition {
  positive: EvaluationSymbol[];
  negative: EvaluationSymbol[];
  weights?: Partial<Record<EvaluationSymbol, number>>;
}

/** A simple rate = (Σ listed symbol counts) / total — e.g. reception Pos%, attack K%. */
export interface RateDefinition {
  symbols: EvaluationSymbol[];
}

export interface IndicatorConfig {
  efficiency: Partial<Record<IndicatorSkill, EfficiencyDefinition>>;
  positiveRate: Partial<Record<IndicatorSkill, RateDefinition>>;
  /** attack K% and any other "winning-touch" rate */
  killRate: Partial<Record<IndicatorSkill, RateDefinition>>;
}

/**
 * Default configuration: volleyreport "ov1" / DataVolley.
 *
 * SkillStats symbol mapping recap: '#'→hash, '+'→plus, '!'→exclamation,
 * '-'→minus, '/'→slash, '='→equal.
 *
 * IMPORTANT — symbol↔category decode caveat:
 * The classification of '/', '-' and '!' is convention-dependent. These defaults
 * follow `indicators.R` as closely as the symbols allow:
 *   • attack: kill '#', blocked '/', error '='.
 *   • serve:  ace '#', positive '+' and '/', negative '-', error '='.
 *   • reception: perfect '#', positive '+', overpasses (poor) '/', error '=' →
 *     efficiency penalizes '/' and '=' as negative.
 * Reception Pos% does not include '/' (only perfect + positive).
 */
export const DATAVOLLEY_OV1_INDICATORS: IndicatorConfig = {
  efficiency: {
    attack: { positive: ['#'], negative: ['/', '='] },
    serve: { positive: ['#', '+', '/'], negative: ['-', '='] },
    receive: { positive: ['#', '+'], negative: ['/', '-', '='] },
  },
  positiveRate: {
    receive: { symbols: ['#', '+'] },
    serve: { symbols: ['#', '+'] },
  },
  killRate: {
    attack: { symbols: ['#'] },
  },
};

function ratio(numerator: number, total: number): number | null {
  return total > 0 ? numerator / total : null;
}

/** Efficiency for one skill given its definition. Returns null when total is 0. */
export function skillEfficiency(stats: SkillStats, def: EfficiencyDefinition | undefined): number | null {
  if (!def) return null;
  const weight = (symbol: EvaluationSymbol) => def.weights?.[symbol] ?? 1;
  const positive = def.positive.reduce((sum, symbol) => sum + symbolCount(stats, symbol) * weight(symbol), 0);
  const negative = def.negative.reduce((sum, symbol) => sum + symbolCount(stats, symbol) * weight(symbol), 0);
  return ratio(positive - negative, stats.total);
}

/** Simple rate (Pos%, K%, …) for one skill given its definition. */
export function skillRate(stats: SkillStats, def: RateDefinition | undefined): number | null {
  if (!def) return null;
  const numerator = def.symbols.reduce((sum, symbol) => sum + symbolCount(stats, symbol), 0);
  return ratio(numerator, stats.total);
}

/**
 * Bind a config into named helpers matching the report's column names.
 * Use the result everywhere instead of inlining formulas, so a single config
 * drives the per-player table, the per-set summary and their totals.
 */
export function makeIndicators(config: IndicatorConfig = DATAVOLLEY_OV1_INDICATORS) {
  return {
    config,
    serveEfficiency: (stats: SkillStats) => skillEfficiency(stats, config.efficiency.serve),
    receptionEfficiency: (stats: SkillStats) => skillEfficiency(stats, config.efficiency.receive),
    attackEfficiency: (stats: SkillStats) => skillEfficiency(stats, config.efficiency.attack),
    blockEfficiency: (stats: SkillStats) => skillEfficiency(stats, config.efficiency.block),
    digEfficiency: (stats: SkillStats) => skillEfficiency(stats, config.efficiency.dig),
    setEfficiency: (stats: SkillStats) => skillEfficiency(stats, config.efficiency.set),
    servePositiveRate: (stats: SkillStats) => skillRate(stats, config.positiveRate.serve),
    receptionPositiveRate: (stats: SkillStats) => skillRate(stats, config.positiveRate.receive),
    attackKillRate: (stats: SkillStats) => skillRate(stats, config.killRate.attack),
  };
}

export type Indicators = ReturnType<typeof makeIndicators>;
