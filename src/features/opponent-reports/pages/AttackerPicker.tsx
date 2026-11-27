// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { useTranslation } from '@src/i18n';

interface PickerView {
  id?: string;
  label?: string;
  attackers: ReadonlyArray<{ key: string; label: string; attacks: number }>;
}

interface AttackerPickerProps {
  views: readonly PickerView[];
  /** Athletes in the report for a view. */
  selected: (viewId: string | undefined) => ReadonlySet<string>;
  onChangeView: (viewId: string | undefined, keys: string[]) => void;
  /** Puts the same athletes in every view, replacing what each view had. */
  onApplyAll: (keys: string[]) => void;
}

/** Athletes with a checkbox and, beside the name, their actions in this section. */
export function AthleteChecks({ athletes, chosen, onToggle, countLabel }: {
  athletes: ReadonlyArray<{ key: string; label: string; attacks: number }>;
  chosen: ReadonlySet<string>;
  onToggle: (key: string) => void;
  countLabel?: (n: number) => string;
}) {
  const { t } = useTranslation();
  return (
    <div className="attacker-picker__athletes">
      {athletes.map((athlete) => (
        <label key={athlete.key}>
          <input type="checkbox" checked={chosen.has(athlete.key)} onChange={() => onToggle(athlete.key)} />
          {athlete.label} <small>{countLabel ? countLabel(athlete.attacks) : t('attackerPickerAttacks', { n: athlete.attacks })}</small>
        </label>
      ))}
    </div>
  );
}

/** Which athletes "Block and defence" prints: for the whole section, and for each view. */
export function AttackerPicker({ views, selected, onChangeView, onApplyAll }: AttackerPickerProps) {
  const { t } = useTranslation();
  // Every athlete of the section, with her attacks in the view that counts the most of them.
  const all = new Map<string, PickerView['attackers'][number]>();
  views.forEach((view) => view.attackers.forEach((athlete) => {
    if ((all.get(athlete.key)?.attacks ?? -1) < athlete.attacks) all.set(athlete.key, athlete);
  }));
  const athletes = [...all.values()].sort((a, b) => b.attacks - a.attacks || a.label.localeCompare(b.label));
  const [sectionChoice, setSectionChoice] = useState<Set<string>>(() => new Set(views.flatMap((view) => [...selected(view.id)])));
  const toggle = (set: ReadonlySet<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  };
  const single = views.length === 1;

  return (
    <section className="attacker-picker" aria-label={t('attackerPickerTitle')}>
      <h4>{t('attackerPickerTitle')}</h4>
      {single ? (
        <AthleteChecks
          athletes={athletes}
          chosen={selected(views[0].id)}
          onToggle={(key) => onChangeView(views[0].id, [...toggle(selected(views[0].id), key)])}
        />
      ) : (
        <>
          <p className="opponent-report__hint">{t('attackerPickerSectionHint')}</p>
          <AthleteChecks athletes={athletes} chosen={sectionChoice} onToggle={(key) => setSectionChoice((current) => toggle(current, key))} />
          <button type="button" className="btn-primary btn-small" onClick={() => onApplyAll([...sectionChoice])}>
            {t('attackerPickerApplyAll')}
          </button>
          {views.map((view) => (
            <details key={view.id ?? 'all'} className="attacker-picker__view">
              <summary>{view.label} <small>{t('attackerPickerChosenCount', { n: selected(view.id).size, total: view.attackers.length })}</small></summary>
              <AthleteChecks
                athletes={view.attackers}
                chosen={selected(view.id)}
                onToggle={(key) => onChangeView(view.id, [...toggle(selected(view.id), key)])}
              />
            </details>
          ))}
        </>
      )}
    </section>
  );
}
