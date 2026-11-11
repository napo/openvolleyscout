// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Scale and colours of the evaluations, shared by live scouting and every
 * statistic. Same scales and palette as VolleyReport (its
 * src/report/evaluation-colors.ts), so the two programs read alike.
 *
 * A colour belongs to a place on the scale of the skill, not to a symbol:
 * the serve "/" (the reception comes straight back) is second best and light
 * green, the reception "/" is orange.
 */
import type { SkillEvaluation, SkillType } from '../common/enums';

/** From best to worst, as in the DataVolley tables. */
export const EVALUATION_SCALE_DEFAULT: readonly SkillEvaluation[] = ['#', '+', '!', '-', '/', '='];

/**
 * Serve: "/" is second, then "+" and "!", mirroring the reception left to
 * the opponent ("+" leaves a reception "-", "!" a reception "!").
 */
export const EVALUATION_SCALE_SERVE: readonly SkillEvaluation[] = ['#', '/', '+', '!', '-', '='];

/** Scale of a skill from the most to the least favourable, over all six symbols. */
export function getEvaluationScale(skill: SkillType | null | undefined): readonly SkillEvaluation[] {
  return skill === 'serve' ? EVALUATION_SCALE_SERVE : EVALUATION_SCALE_DEFAULT;
}

/** From the most to the least favourable place on a scale. */
export const EVALUATION_SCALE_COLORS = ['#00ff00', '#90ee90', '#adff2f', '#ffff99', '#f79646', '#ff0000'] as const;

/** Ink for a label drawn inside a fill: dark on the light fills, white on red. */
export const EVALUATION_SCALE_INKS = ['#383838', '#383838', '#383838', '#383838', '#383838', '#ffffff'] as const;

/** Neutral colour for a touch with no evaluation. */
export const EVALUATION_COLOR_NEUTRAL = '#6b7280';

/** Place of an evaluation on the scale of its skill, 0 = most favourable. */
export function getEvaluationPlace(skill: SkillType | null | undefined, evaluation: SkillEvaluation): number {
  return getEvaluationScale(skill).indexOf(evaluation);
}

export function getEvaluationColor(skill: SkillType | null | undefined, evaluation: SkillEvaluation | null | undefined): string {
  if (!evaluation) return EVALUATION_COLOR_NEUTRAL;
  return EVALUATION_SCALE_COLORS[getEvaluationPlace(skill, evaluation)] ?? EVALUATION_COLOR_NEUTRAL;
}

/** Text colour to use on top of getEvaluationColor. */
export function getEvaluationInk(skill: SkillType | null | undefined, evaluation: SkillEvaluation | null | undefined): string {
  if (!evaluation) return '#ffffff';
  return EVALUATION_SCALE_INKS[getEvaluationPlace(skill, evaluation)] ?? '#383838';
}

/**
 * The colour mixed with white (CSS colour), for button and cell backgrounds
 * where the full colour would be too loud under dark text.
 */
export function getEvaluationTint(skill: SkillType | null | undefined, evaluation: SkillEvaluation, strength = 0.55): string {
  const hex = getEvaluationColor(skill, evaluation);
  const channel = (index: number) => Math.round(255 * (1 - strength) + strength * parseInt(hex.slice(index, index + 2), 16));
  return `rgb(${channel(1)}, ${channel(3)}, ${channel(5)})`;
}

/** Inline style of a small evaluation symbol drawn on its colour (tooltips, legends). */
export function getEvaluationChipStyle(skill: SkillType | null | undefined, evaluation: SkillEvaluation): {
  background: string;
  color: string;
  padding: string;
  borderRadius: string;
} {
  return {
    background: getEvaluationColor(skill, evaluation),
    color: getEvaluationInk(skill, evaluation),
    padding: '0 0.35em',
    borderRadius: '0.25em',
  };
}
