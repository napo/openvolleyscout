// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CSSProperties, ReactNode } from 'react';
import type { SkillEvaluation, SkillType } from '@src/domain/common/enums';
import {
  getEvaluationColor,
  getEvaluationInk,
  getEvaluationScale,
  getEvaluationTint,
} from '@src/domain/touch/evaluation-scale';
import './filter-chips.css';

/**
 * Building blocks of the filters (tactical report look): a group per category,
 * chips to pick several values with an "All" chip that clears the group, and
 * evaluation chips in each skill's order and colours. Each screen composes only
 * the groups that make sense in its context.
 */

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
}

/** Several values at once; none chosen means all. With `single`, one value at a time. */
export function ChipSelect<T extends string | number>({ options, selected, onChange, allLabel, label, single = false }: {
  options: readonly ChipOption<T>[];
  selected: readonly T[];
  onChange: (next: T[]) => void;
  allLabel: string;
  /** A small label before the chips, when a group holds several rows. */
  label?: string;
  single?: boolean;
}) {
  const toggle = (value: T) => {
    if (single) {
      onChange(selected.includes(value) ? [] : [value]);
      return;
    }
    const next = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
    // Every value chosen is the same as none: back to "All".
    onChange(next.length === options.length ? [] : next);
  };
  return (
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
      {options.map((option) => {
        const active = selected.includes(option.value);
        return (
          <button
            key={String(option.value)}
            type="button"
            className={`filter-chips__chip${active ? ' is-active' : ''}`}
            aria-pressed={active}
            onClick={() => toggle(option.value)}
          >
            {option.label}
          </button>
        );
      })}
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

/** Evaluation chips in the order of the skill's scale (the serve's differs), in its colours. */
export function EvaluationChips({ skill, selected, onChange, allLabel, label, evaluations }: {
  skill: SkillType | null;
  selected: readonly SkillEvaluation[];
  onChange: (next: SkillEvaluation[]) => void;
  allLabel: string;
  label?: string;
  /** Restricts the symbols shown (still in the skill's order). */
  evaluations?: readonly SkillEvaluation[];
}) {
  const scale = getEvaluationScale(skill).filter((evaluation) => !evaluations || evaluations.includes(evaluation));
  const toggle = (evaluation: SkillEvaluation) => {
    const next = selected.includes(evaluation) ? selected.filter((item) => item !== evaluation) : [...selected, evaluation];
    onChange(next.length === scale.length ? [] : next);
  };
  return (
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
  );
}
