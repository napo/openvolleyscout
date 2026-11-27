// SPDX-License-Identifier: AGPL-3.0-or-later
import type {
  AttackerDirectionPhase,
  AttackerDirectionViewConfig,
  SetterDistributionServeType,
  SetterDistributionViewConfig,
} from '@src/domain/opponent-report/types';

/**
 * "Draw separately": a view split by one of its filters becomes one view per
 * value (the chosen values, or every value when none is chosen), each drawn on
 * its own card. "Draw together" (no split) keeps one card for all values.
 */
export type AttackerSplitField = 'attackZones' | 'rotations' | 'phases';
export type SetterSplitField = 'serveStartZones' | 'receptionZones' | 'serveTypes' | 'setterCalls';

export const ATTACKER_SPLIT_VALUES: { [K in AttackerSplitField]: ReadonlyArray<NonNullable<AttackerDirectionViewConfig[K]>[number]> } = {
  attackZones: ['4', '3', '2', '6', '1', '5'],
  rotations: [1, 2, 3, 4, 5, 6],
  phases: ['after_receive', 'after_dig', 'high_ball', 'late_set'] as AttackerDirectionPhase[],
};

/** The setter calls have no fixed list: they are the ones found in the matches (see `collectSetterCallCodes`). */
export const SETTER_SPLIT_VALUES: { [K in Exclude<SetterSplitField, 'setterCalls'>]: ReadonlyArray<NonNullable<SetterDistributionViewConfig[K]>[number]> } = {
  serveStartZones: ['1', '9', '6', '7', '5'],
  receptionZones: ['1', '6', '5', '9', '8', '7', '2', '3', '4'],
  serveTypes: ['jump_spin', 'jump_float', 'float', 'other'] as SetterDistributionServeType[],
};

type SplittableView = { id: string; label: string; splitBy?: string };

function expand<V extends SplittableView>(
  views: readonly V[],
  allValues: Record<string, ReadonlyArray<string | number>>,
  valueLabel: (field: string, value: string | number) => string,
): V[] {
  return views.flatMap((view) => {
    const field = view.splitBy;
    if (!field || !allValues[field]) return [view];
    const chosen = (view as unknown as Record<string, Array<string | number> | undefined>)[field];
    const values = chosen && chosen.length > 0 ? chosen : allValues[field];
    if (values.length === 0) return [view];
    return values.map((value) => ({
      ...view,
      id: `${view.id}~${value}`,
      label: `${view.label} · ${valueLabel(field, value)}`,
      [field]: [value],
      splitBy: undefined,
    }));
  });
}

export function expandAttackerViews(
  views: readonly AttackerDirectionViewConfig[],
  valueLabel: (field: AttackerSplitField, value: string | number) => string,
): AttackerDirectionViewConfig[] {
  return expand(views, ATTACKER_SPLIT_VALUES, valueLabel as (field: string, value: string | number) => string);
}

export function expandSetterViews(
  views: readonly SetterDistributionViewConfig[],
  valueLabel: (field: SetterSplitField, value: string | number) => string,
  setterCallCodes: readonly string[] = [],
): SetterDistributionViewConfig[] {
  return expand(views, { ...SETTER_SPLIT_VALUES, setterCalls: setterCallCodes }, valueLabel as (field: string, value: string | number) => string);
}
