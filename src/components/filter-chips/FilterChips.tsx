// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CSSProperties, ReactNode } from 'react';
import type { SkillEvaluation, SkillType } from '@src/domain/common/enums';
import {
  getEvaluationColor,
  getEvaluationInk,
  getEvaluationScale,
  getEvaluationTint,
} from '@src/domain/touch/evaluation-scale';
import { useTranslation } from '@src/i18n';
import './filter-chips.css';

/**
 * Building blocks of the filters (tactical report look): a group per category,
 * chips to pick several values with an "All" chip that clears the group, and
 * evaluation chips in each skill's order and colours. Each screen composes only
 * the groups that make sense in its context.
 */

/** "Reset filters (n)": shown by every analysis tab with filters, only while some filter is set. */
export function ResetFiltersButton({ count, onReset }: { count: number; onReset: () => void }) {
  const { t } = useTranslation();
  if (count <= 0) return null;
  return (
    <button type="button" className="filter-chips__reset" onClick={onReset} aria-label={t('resetFilters')}>
      {t('resetFilters')} ({count})
    </button>
  );
}

export function FilterGroups({ children }: { children: ReactNode }) {
  return <div className="filter-chips__groups">{children}</div>;
}

export function FilterGroup({ title, active = false, wide = false, children }: {
  title: string;
  /** Highlights the group when something in it is chosen. */
  active?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`filter-chips__group${active ? ' is-filtered' : ''}${wide ? ' filter-chips__group--wide' : ''}`}>
      <span className="filter-chips__group-title">{title}</span>
      {children}
    </div>
  );
}

export interface ChipOption<T> {
  value: T;
  label: string;
  /** Shown on hover, for short labels such as DataVolley letters. */
  title?: string;
  /** A small pictogram before the label (for example a skill icon). */
  icon?: ReactNode;
  /** Shows only the icon; the label is read on hover and by screen readers. */
  iconOnly?: boolean;
  /** Marks the chip in yellow (for example the athletes whose role is setter). */
  highlight?: boolean;
  /** A small number after the label (for example how many receptions the athlete made). */
  count?: number;
}

/** Zones as they sit on a half court, net at the top: front row 4 3 2, then 7 8 9, back row 5 6 1. */
const COURT_ZONE_ORDER = ['4', '3', '2', '7', '8', '9', '5', '6', '1'] as const;
/** Serve start zones along the end line, left to right as seen from behind the server. */
const BASELINE_ZONE_ORDER = ['5', '7', '6', '9', '1'] as const;

/**
 * Several values at once; none chosen means all. With `single`, one value at a time.
 * Without `allLabel` there is no "All" chip and, with `single`, a value always stays chosen.
 * The "All" chip sits on its own row, above the values. With `layout="court"` the values are
 * DataVolley zones drawn as a 3x3 half court (net at the top); with `layout="baseline"` they are
 * serve start zones along the end line.
 */
export function ChipSelect<T extends string | number>({ options, selected, onChange, allLabel, label, single = false, layout = 'row' }: {
  options: readonly ChipOption<T>[];
  selected: readonly T[];
  onChange: (next: T[]) => void;
  allLabel?: string;
  /** A small label before the chips, when a group holds several rows. */
  label?: string;
  single?: boolean;
  layout?: 'row' | 'court' | 'baseline';
}) {
  const toggle = (value: T) => {
    if (single) {
      if (selected.includes(value)) {
        if (allLabel !== undefined) onChange([]);
      } else {
        onChange([value]);
      }
      return;
    }
    const next = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
    // Every value chosen is the same as none: back to "All".
    onChange(next.length === options.length ? [] : next);
  };
  const chip = (option: ChipOption<T>) => {
    const active = selected.includes(option.value);
    return (
      <button
        key={String(option.value)}
        type="button"
        className={`filter-chips__chip${option.iconOnly && option.icon ? ' filter-chips__chip--icon' : ''}${option.highlight ? ' filter-chips__chip--highlight' : ''}${active ? ' is-active' : ''}`}
        aria-pressed={active}
        aria-label={option.iconOnly && option.icon ? option.label : undefined}
        title={option.title ?? (option.icon ? option.label : undefined)}
        onClick={() => toggle(option.value)}
      >
        {option.icon ? <span className="filter-chips__icon" aria-hidden="true">{option.icon}</span> : null}
        {option.iconOnly && option.icon ? null : option.label}
        {option.count !== undefined ? <small className="filter-chips__count">{option.count}</small> : null}
      </button>
    );
  };
  const zoneOrder = layout === 'court' ? COURT_ZONE_ORDER : layout === 'baseline' ? BASELINE_ZONE_ORDER : null;
  const values = zoneOrder ? (
    <div className={`filter-chips__zones filter-chips__zones--${layout}`}>
      {zoneOrder.map((zone) => {
        const option = options.find((item) => String(item.value) === zone);
        return option ? chip(option) : <span key={zone} className="filter-chips__zone-empty" aria-hidden="true" />;
      })}
    </div>
  ) : (
    <div className="filter-chips__row">{options.map(chip)}</div>
  );
  if (!label && allLabel === undefined) return values;
  return (
    <div className="filter-chips__select">
      <div className="filter-chips__row">
        {label ? <span className="filter-chips__row-label">{label}</span> : null}
        {allLabel !== undefined ? (
          <button
            type="button"
            className={`filter-chips__chip${selected.length === 0 ? ' is-active' : ''}`}
            aria-pressed={selected.length === 0}
            onClick={() => onChange([])}
          >
            {allLabel}
          </button>
        ) : null}
      </div>
      {values}
    </div>
  );
}

/**
 * Base / combination codes as a table: the letter in the first cell of a row and the codes that
 * start with it in the cells after it (C: 5 6 D F; K: 1 2 C E). Several codes can be chosen, and a
 * click on the letter takes or leaves the whole row. None chosen means all.
 */
export function BaseCodeTable({ codes, selected, onChange, allLabel, label }: {
  codes: readonly string[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  allLabel: string;
  /** A small label before "All", when the table is not in a group of its own. */
  label?: string;
}) {
  const rows = new Map<string, string[]>();
  codes.forEach((code) => {
    const letter = code.charAt(0);
    rows.set(letter, [...(rows.get(letter) ?? []), code]);
  });
  const emit = (next: string[]) => onChange(next.length === codes.length ? [] : next);
  const toggle = (code: string) => emit(selected.includes(code) ? selected.filter((item) => item !== code) : [...selected, code]);
  const toggleRow = (rowCodes: readonly string[]) => {
    const whole = rowCodes.every((code) => selected.includes(code));
    emit(whole ? selected.filter((code) => !rowCodes.includes(code)) : [...new Set([...selected, ...rowCodes])]);
  };
  return (
    <div className="filter-chips__select">
      <div className="filter-chips__row">
        {label ? <span className="filter-chips__row-label">{label}</span> : null}
        <button
          type="button"
          className={`filter-chips__chip${selected.length === 0 ? ' is-active' : ''}`}
          aria-pressed={selected.length === 0}
          onClick={() => onChange([])}
        >
          {allLabel}
        </button>
      </div>
      <table className="filter-chips__base-table">
        <tbody>
          {[...rows.entries()].map(([letter, rowCodes]) => {
            const whole = rowCodes.every((code) => selected.includes(code));
            return (
              <tr key={letter}>
                <th scope="row">
                  <button
                    type="button"
                    className={`filter-chips__chip filter-chips__chip--letter${whole ? ' is-active' : ''}`}
                    aria-pressed={whole}
                    onClick={() => toggleRow(rowCodes)}
                  >
                    {letter}
                  </button>
                </th>
                {rowCodes.map((code) => (
                  <td key={code}>
                    <button
                      type="button"
                      className={`filter-chips__chip${selected.includes(code) ? ' is-active' : ''}`}
                      aria-pressed={selected.includes(code)}
                      aria-label={code}
                      title={code}
                      onClick={() => toggle(code)}
                    >
                      {code.slice(1)}
                    </button>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Style of an evaluation chip: the skill's colour, full when chosen, tinted otherwise. */
export function evaluationChipStyle(skill: SkillType | null | undefined, evaluation: SkillEvaluation, active: boolean): CSSProperties {
  const color = getEvaluationColor(skill, evaluation);
  if (active) {
    return { background: color, borderColor: color, color: getEvaluationInk(skill, evaluation) };
  }
  return { background: getEvaluationTint(skill, evaluation, 0.24), borderColor: color, color: '#1e293b' };
}

export interface EvaluationPreset {
  label: string;
  value: readonly SkillEvaluation[];
  /** Colours the chip: intense green for the positive group, intense red for the negative one. */
  tone?: 'positive' | 'negative';
}

/**
 * Evaluation chips in the order of the skill's scale (the serve's differs), in its colours.
 * Optional presets (for example positive and negative reception) pick several symbols at once.
 */
export function EvaluationChips({ skill, selected, onChange, allLabel, label, evaluations, presets = [] }: {
  skill: SkillType | null;
  selected: readonly SkillEvaluation[];
  onChange: (next: SkillEvaluation[]) => void;
  allLabel: string;
  label?: string;
  /** Restricts the symbols shown (still in the skill's order). */
  evaluations?: readonly SkillEvaluation[];
  presets?: readonly EvaluationPreset[];
}) {
  const scale = getEvaluationScale(skill).filter((evaluation) => !evaluations || evaluations.includes(evaluation));
  const isPreset = (value: readonly SkillEvaluation[]) => (
    value.length === selected.length && value.every((evaluation) => selected.includes(evaluation))
  );
  const toggle = (evaluation: SkillEvaluation) => {
    const next = selected.includes(evaluation) ? selected.filter((item) => item !== evaluation) : [...selected, evaluation];
    onChange(next.length === scale.length ? [] : next);
  };
  // "All" and the groups of symbols (positive, negative) on the first row, the symbols on the second.
  return (
    <div className="filter-chips__select">
      <div className="filter-chips__row">
        {label ? <span className="filter-chips__row-label">{label}</span> : null}
        <button
          type="button"
          className={`filter-chips__chip${selected.length === 0 ? ' is-active' : ''}`}
          aria-pressed={selected.length === 0}
          onClick={() => onChange([])}
        >
          {allLabel}
        </button>
        {presets.map((preset) => {
          const active = isPreset(preset.value);
          return (
            <button
              key={preset.label}
              type="button"
              className={`filter-chips__chip${preset.tone ? ` filter-chips__chip--${preset.tone}` : ''}${active ? ' is-active' : ''}`}
              aria-pressed={active}
              onClick={() => onChange(scale.filter((evaluation) => preset.value.includes(evaluation)))}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="filter-chips__row">
        {scale.map((evaluation) => {
          const active = selected.includes(evaluation);
          return (
            <button
              key={evaluation}
              type="button"
              className={`filter-chips__chip filter-chips__chip--eval${active ? ' is-active' : ''}`}
              style={evaluationChipStyle(skill, evaluation, active)}
              aria-pressed={active}
              onClick={() => toggle(evaluation)}
            >
              {evaluation}
            </button>
          );
        })}
      </div>
    </div>
  );
}
