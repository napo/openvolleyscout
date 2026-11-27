// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { useTranslation, type TranslationKey } from '@src/i18n';
import { SplitToggle } from './SplitToggle';
import { attackerViewFilterLabel } from '../model/attacker-view-label';
import { AttackBallTypeChips, BaseCodeTable, ChipSelect, EvaluationChips, FilterGroup, FilterGroups } from '@src/components/filter-chips/FilterChips';
import type { AttackSubtype } from '@src/domain/touch/types';
import {
  normalizeAttackerDirectionView,
  type AttackerDirectionEvaluation,
  type AttackerDirectionPhase,
  type AttackerDirectionViewConfig,
  type SetterDistributionReceptionEval,
} from '@src/domain/opponent-report/types';

const PHASES: ReadonlyArray<{
  value: AttackerDirectionPhase;
  labelKey: 'opponentReportAttackAfterReceive' | 'opponentReportAttackAfterDig' | 'opponentReportAttackHighBall' | 'opponentReportAttackLateSet';
}> = [
  { value: 'after_receive', labelKey: 'opponentReportAttackAfterReceive' },
  { value: 'after_dig', labelKey: 'opponentReportAttackAfterDig' },
  { value: 'high_ball', labelKey: 'opponentReportAttackHighBall' },
  { value: 'late_set', labelKey: 'opponentReportAttackLateSet' },
];

const RECEPTION_EVALS: readonly SetterDistributionReceptionEval[] = ['#', '+', '!', '-'];
const ROTATIONS = [1, 2, 3, 4, 5, 6] as const;
const ATTACK_ZONES = ['4', '3', '2', '6', '1', '5'] as const;
const ATTACK_SUBTYPES: ReadonlyArray<{
  value: AttackSubtype;
  labelKey: 'attackSubtypeHard' | 'attackSubtypePlaced' | 'attackSubtypeTip';
}> = [
  { value: 'H', labelKey: 'attackSubtypeHard' },
  { value: 'P', labelKey: 'attackSubtypePlaced' },
  { value: 'T', labelKey: 'attackSubtypeTip' },
];
const BLOCKER_COUNTS = [0, 1, 2, 3, 4] as const; // 4 = open block (DataVolley players-at-net value)

interface AttackerViewsEditorProps {
  views: readonly AttackerDirectionViewConfig[] | undefined;
  /** Base: the setter calls (K1, KC, ...) of the sets before the attacks found in the matches. */
  setterCallCodes?: readonly string[];
  /** The attacks' own combination codes (X5, V5, ...) found in the matches. */
  combinationCodes?: readonly string[];
  onChange: (nextViews: AttackerDirectionViewConfig[] | undefined) => void;
}

export function AttackerViewsEditor({ views, setterCallCodes = [], combinationCodes = [], onChange }: AttackerViewsEditorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const all = t('setterViewReceptionAll');

  const defaultViews = (): AttackerDirectionViewConfig[] => [
    { id: 'all', label: t('opponentReportAttackAll') },
  ];

  // Older views keep K codes among the combinations: show them under Base, saved split at the next edit.
  const activeViews: AttackerDirectionViewConfig[] = views && views.length > 0 ? views.map(normalizeAttackerDirectionView) : defaultViews();

  const patchView = (index: number, patch: Partial<AttackerDirectionViewConfig>) => {
    const next = activeViews.map((view, i) => {
      if (i !== index) return view;
      const updated = { ...view, ...patch };
      const automaticLabel = attackerViewFilterLabel(view, t) || t('opponentReportAttackAll');
      if (patch.label === undefined && view.label === automaticLabel) {
        updated.label = attackerViewFilterLabel(updated, t) || t('opponentReportAttackAll');
      }
      return updated;
    });
    onChange(next);
  };

  // None chosen means all: an empty choice is stored as no filter.
  const setField = (index: number, field: keyof AttackerDirectionViewConfig, next: readonly unknown[]) => {
    patchView(index, { [field]: next.length > 0 ? [...next] : undefined } as Partial<AttackerDirectionViewConfig>);
  };

  const addView = (base?: AttackerDirectionViewConfig) => {
    const id = `atk-view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const entry: AttackerDirectionViewConfig = base
      ? {
          ...base,
          id,
          label: `${base.label} (${activeViews.length + 1})`,
          phases: base.phases ? [...base.phases] : undefined,
          receptionEvaluations: base.receptionEvaluations ? [...base.receptionEvaluations] : undefined,
          rotations: base.rotations ? [...base.rotations] : undefined,
          attackZones: base.attackZones ? [...base.attackZones] : undefined,
          evaluations: base.evaluations ? [...base.evaluations] : undefined,
          blockers: base.blockers ? [...base.blockers] : undefined,
          attackSubtypes: base.attackSubtypes ? [...base.attackSubtypes] : undefined,
          setterCalls: base.setterCalls ? [...base.setterCalls] : undefined,
          combinationCodes: base.combinationCodes ? [...base.combinationCodes] : undefined,
          attackBallTypes: base.attackBallTypes ? [...base.attackBallTypes] : undefined,
        }
      : {
          id,
          label: t('attackerViewNewLabel', { n: activeViews.length + 1 }),
        };
    onChange([...activeViews, entry]);
  };

  const removeView = (index: number) => {
    if (activeViews.length <= 1) return;
    onChange(activeViews.filter((_, i) => i !== index));
  };

  const moveView = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= activeViews.length) return;
    const next = [...activeViews];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange(next);
  };

  return (
    <div className="setter-views-editor">
      <div className="setter-views-editor__header">
        <button
          type="button"
          className="btn-secondary btn-small"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
        >
          {t('attackerViewsConfigure')} ({activeViews.length})
        </button>
        {views && views.length > 0 ? (
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={() => onChange(undefined)}
          >
            {t('setterViewsResetDefault')}
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="setter-views-editor__body">
          <p className="opponent-report__hint">{t('attackerViewsHint')}</p>
          <div className="setter-views-editor__list">
            {activeViews.map((view, index) => {
              return (
                <div key={view.id} className="setter-views-editor__card">
                  <div className="setter-views-editor__row">
                    <label className="setter-views-editor__label-field">
                      <span>{t('setterViewLabel')}</span>
                      <input
                        type="text"
                        value={view.label}
                        onChange={(event) => patchView(index, { label: event.target.value })}
                      />
                    </label>
                    <div className="setter-views-editor__actions">
                      <button
                        type="button"
                        className="btn-secondary btn-small"
                        disabled={index === 0}
                        onClick={() => moveView(index, -1)}
                        title={t('setterViewMoveUp')}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-small"
                        disabled={index === activeViews.length - 1}
                        onClick={() => moveView(index, 1)}
                        title={t('setterViewMoveDown')}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-small"
                        onClick={() => addView(view)}
                      >
                        {t('setterViewDuplicate')}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-small"
                        disabled={activeViews.length <= 1}
                        onClick={() => removeView(index)}
                      >
                        {t('setterViewDelete')}
                      </button>
                    </div>
                  </div>

                  <FilterGroups>
                    <FilterGroup title={t('videoAttackSituation')} active={Boolean(view.phases?.length)}>
                      <SplitToggle separate={view.splitBy === 'phases'} onChange={(separate) => patchView(index, { splitBy: separate ? 'phases' : undefined })} />
                      <ChipSelect
                        allLabel={all}
                        // "High ball" gave way to the attack type H: it stays only on views that already use it.
                        options={PHASES.filter((phase) => phase.value !== 'high_ball' || view.phases?.includes('high_ball')).map((phase) => ({ value: phase.value, label: t(phase.labelKey) }))}
                        selected={view.phases ?? []}
                        onChange={(next) => setField(index, 'phases', next)}
                      />
                    </FilterGroup>

                    <FilterGroup title={t('setterViewReceptionLabel')} active={Boolean(view.receptionEvaluations?.length)}>
                      <EvaluationChips
                        skill="receive"
                        allLabel={all}
                        evaluations={RECEPTION_EVALS}
                        presets={[
                          { label: t('setterViewReceptionPositive'), value: ['#', '+'], tone: 'positive' },
                          { label: t('setterViewReceptionNegative'), value: ['!', '-'], tone: 'negative' },
                        ]}
                        selected={view.receptionEvaluations ?? []}
                        onChange={(next) => setField(index, 'receptionEvaluations', next as SetterDistributionReceptionEval[])}
                      />
                    </FilterGroup>

                    <FilterGroup title={t('opponentReportColRotation')} active={Boolean(view.rotations?.length)}>
                      <SplitToggle separate={view.splitBy === 'rotations'} onChange={(separate) => patchView(index, { splitBy: separate ? 'rotations' : undefined })} />
                      <ChipSelect
                        allLabel={all}
                        options={ROTATIONS.map((rot) => ({ value: rot, label: `P${rot}` }))}
                        selected={view.rotations ?? []}
                        onChange={(next) => setField(index, 'rotations', next)}
                      />
                    </FilterGroup>

                    <FilterGroup title={t('opponentReportAttackZone')} active={Boolean(view.attackZones?.length)}>
                      <SplitToggle separate={view.splitBy === 'attackZones'} onChange={(separate) => patchView(index, { splitBy: separate ? 'attackZones' : undefined })} />
                      <ChipSelect
                        allLabel={all}
                        layout="court"
            options={ATTACK_ZONES.map((zone) => ({ value: zone, label: `Z${zone}` }))}
                        selected={view.attackZones ?? []}
                        onChange={(next) => setField(index, 'attackZones', next)}
                      />
                    </FilterGroup>

                    <FilterGroup title={t('attackerViewAttackBallTypeLabel')} active={Boolean(view.attackBallTypes?.length)}>
                      <SplitToggle separate={view.splitBy === 'attackBallTypes'} onChange={(separate) => patchView(index, { splitBy: separate ? 'attackBallTypes' : undefined })} />
                      <AttackBallTypeChips
                        allLabel={all}
                        selected={view.attackBallTypes ?? []}
                        onChange={(next) => setField(index, 'attackBallTypes', next)}
                      />
                    </FilterGroup>

                    <FilterGroup title={t('opponentReportAttackType')} active={Boolean(view.attackSubtypes?.length)}>
                      <ChipSelect
                        allLabel={all}
                        options={ATTACK_SUBTYPES.map((st) => ({ value: st.value, label: `${t(st.labelKey)} (${st.value})` }))}
                        selected={view.attackSubtypes ?? []}
                        onChange={(next) => setField(index, 'attackSubtypes', next)}
                      />
                    </FilterGroup>

                    <FilterGroup title={t('opponentReportAttackBlockers')} active={Boolean(view.blockers?.length)}>
                      <ChipSelect
                        allLabel={all}
                        options={BLOCKER_COUNTS.map((count) => ({ value: count, label: String(count), title: t(`numBlockers${count}` as TranslationKey) }))}
                        selected={view.blockers ?? []}
                        onChange={(next) => setField(index, 'blockers', next)}
                      />
                    </FilterGroup>

                    <FilterGroup title={t('attackerViewEvaluationLabel')} active={Boolean(view.evaluations?.length)}>
                      <EvaluationChips
                        skill="attack"
                        allLabel={all}
                        selected={view.evaluations ?? []}
                        onChange={(next) => setField(index, 'evaluations', next as AttackerDirectionEvaluation[])}
                      />
                    </FilterGroup>

                    {/* Base and Combination are two filters crossed with AND. A group stays visible while it has a choice. */}
                    {setterCallCodes.length > 0 || view.setterCalls?.length ? (
                      <FilterGroup title={t('baseFilterLabel')} active={Boolean(view.setterCalls?.length)} wide>
                        <BaseCodeTable
                          allLabel={all}
                          codes={setterCallCodes}
                          selected={view.setterCalls ?? []}
                          onChange={(next) => setField(index, 'setterCalls', next)}
                        />
                      </FilterGroup>
                    ) : null}

                    {combinationCodes.length > 0 || view.combinationCodes?.length ? (
                      <FilterGroup title={t('combination')} active={Boolean(view.combinationCodes?.length)} wide>
                        <BaseCodeTable
                          allLabel={all}
                          codes={combinationCodes}
                          selected={view.combinationCodes ?? []}
                          onChange={(next) => setField(index, 'combinationCodes', next)}
                        />
                      </FilterGroup>
                    ) : null}
                  </FilterGroups>
                </div>
              );
            })}
          </div>
          <div className="setter-views-editor__footer">
            <button type="button" className="btn-primary btn-small" onClick={() => addView()}>
              {t('attackerViewsAdd')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
