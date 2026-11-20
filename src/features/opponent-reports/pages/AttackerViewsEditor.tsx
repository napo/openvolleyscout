// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { AttackSubtype } from '@src/domain/touch/types';
import type {
  AttackerDirectionEvaluation,
  AttackerDirectionPhase,
  AttackerDirectionViewConfig,
  SetterDistributionReceptionEval,
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
const BLOCKER_COUNTS = [0, 1, 2, 3] as const;
const ATTACK_EVALS: readonly AttackerDirectionEvaluation[] = ['#', '+', '!', '-', '/', '='];

interface AttackerViewsEditorProps {
  views: readonly AttackerDirectionViewConfig[] | undefined;
  combinationCodes?: readonly string[];
  onChange: (nextViews: AttackerDirectionViewConfig[] | undefined) => void;
}

export function AttackerViewsEditor({ views, combinationCodes = [], onChange }: AttackerViewsEditorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const defaultViews = (): AttackerDirectionViewConfig[] => [
    { id: 'all', label: t('opponentReportAttackAll') },
  ];

  const activeViews: AttackerDirectionViewConfig[] = views && views.length > 0 ? [...views] : defaultViews();

  const patchView = (index: number, patch: Partial<AttackerDirectionViewConfig>) => {
    const next = activeViews.map((v, i) => (i === index ? { ...v, ...patch } : v));
    onChange(next);
  };

  const toggleItem = <T,>(
    index: number,
    field: keyof AttackerDirectionViewConfig,
    value: T,
    allValues?: readonly T[],
  ) => {
    const current = (activeViews[index][field] as readonly T[] | undefined) ?? [];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    const normalized = next.length === 0 || (allValues && next.length === allValues.length)
      ? undefined
      : next;
    patchView(index, { [field]: normalized } as Partial<AttackerDirectionViewConfig>);
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
          combinationCodes: base.combinationCodes ? [...base.combinationCodes] : undefined,
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
              const recEvals = view.receptionEvaluations ?? [];
              const isRecAll = recEvals.length === 0;
              const isRecPositive = recEvals.length === 2 && recEvals.includes('#') && recEvals.includes('+');
              const isRecNegative = recEvals.length === 2 && recEvals.includes('!') && recEvals.includes('-');
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

                  <div className="setter-views-editor__filters">
                    <div className="setter-views-editor__group">
                      <span className="setter-views-editor__group-label">{t('attackerViewPhaseLabel')}</span>
                      <div className="setter-views-editor__chips">
                        <button
                          type="button"
                          className={`setter-views-editor__chip${!view.phases?.length ? ' is-active' : ''}`}
                          onClick={() => patchView(index, { phases: undefined })}
                        >
                          {t('setterViewReceptionAll')}
                        </button>
                        {PHASES.map((phase) => (
                          <button
                            key={phase.value}
                            type="button"
                            className={`setter-views-editor__chip${view.phases?.includes(phase.value) ? ' is-active' : ''}`}
                            onClick={() => toggleItem(index, 'phases', phase.value)}
                          >
                            {t(phase.labelKey)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="setter-views-editor__group">
                      <span className="setter-views-editor__group-label">{t('setterViewReceptionLabel')}</span>
                      <div className="setter-views-editor__chips">
                        <button
                          type="button"
                          className={`setter-views-editor__chip${isRecAll ? ' is-active' : ''}`}
                          onClick={() => patchView(index, { receptionEvaluations: undefined })}
                        >
                          {t('setterViewReceptionAll')}
                        </button>
                        <button
                          type="button"
                          className={`setter-views-editor__chip${isRecPositive ? ' is-active' : ''}`}
                          onClick={() => patchView(index, { receptionEvaluations: ['#', '+'] })}
                        >
                          {t('setterViewReceptionPositive')}
                        </button>
                        <button
                          type="button"
                          className={`setter-views-editor__chip${isRecNegative ? ' is-active' : ''}`}
                          onClick={() => patchView(index, { receptionEvaluations: ['!', '-'] })}
                        >
                          {t('setterViewReceptionNegative')}
                        </button>
                        {RECEPTION_EVALS.map((code) => (
                          <button
                            key={code}
                            type="button"
                            className={`setter-views-editor__chip${recEvals.includes(code) ? ' is-active' : ''}`}
                            onClick={() => toggleItem(index, 'receptionEvaluations', code, RECEPTION_EVALS)}
                          >
                            {`R${code}`}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="setter-views-editor__group">
                      <span className="setter-views-editor__group-label">{t('opponentReportColRotation')}</span>
                      <div className="setter-views-editor__chips">
                        <button
                          type="button"
                          className={`setter-views-editor__chip${!view.rotations?.length ? ' is-active' : ''}`}
                          onClick={() => patchView(index, { rotations: undefined })}
                        >
                          {t('setterViewReceptionAll')}
                        </button>
                        {ROTATIONS.map((rot) => (
                          <button
                            key={rot}
                            type="button"
                            className={`setter-views-editor__chip${view.rotations?.includes(rot) ? ' is-active' : ''}`}
                            onClick={() => toggleItem(index, 'rotations', rot, ROTATIONS)}
                          >
                            {`P${rot}`}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="setter-views-editor__group">
                      <span className="setter-views-editor__group-label">{t('opponentReportAttackZone')}</span>
                      <div className="setter-views-editor__chips">
                        <button
                          type="button"
                          className={`setter-views-editor__chip${!view.attackZones?.length ? ' is-active' : ''}`}
                          onClick={() => patchView(index, { attackZones: undefined })}
                        >
                          {t('setterViewReceptionAll')}
                        </button>
                        {ATTACK_ZONES.map((zone) => (
                          <button
                            key={zone}
                            type="button"
                            className={`setter-views-editor__chip${view.attackZones?.includes(zone) ? ' is-active' : ''}`}
                            onClick={() => toggleItem(index, 'attackZones', zone, ATTACK_ZONES)}
                          >
                            {`Z${zone}`}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="setter-views-editor__group">
                      <span className="setter-views-editor__group-label">{t('opponentReportAttackType')}</span>
                      <div className="setter-views-editor__chips">
                        <button
                          type="button"
                          className={`setter-views-editor__chip${!view.attackSubtypes?.length ? ' is-active' : ''}`}
                          onClick={() => patchView(index, { attackSubtypes: undefined })}
                        >
                          {t('setterViewReceptionAll')}
                        </button>
                        {ATTACK_SUBTYPES.map((st) => (
                          <button
                            key={st.value}
                            type="button"
                            className={`setter-views-editor__chip${view.attackSubtypes?.includes(st.value) ? ' is-active' : ''}`}
                            onClick={() => toggleItem(index, 'attackSubtypes', st.value, ATTACK_SUBTYPES.map((item) => item.value))}
                          >
                            {`${t(st.labelKey)} (${st.value})`}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="setter-views-editor__group">
                      <span className="setter-views-editor__group-label">{t('opponentReportAttackBlockers')}</span>
                      <div className="setter-views-editor__chips">
                        <button
                          type="button"
                          className={`setter-views-editor__chip${!view.blockers?.length ? ' is-active' : ''}`}
                          onClick={() => patchView(index, { blockers: undefined })}
                        >
                          {t('setterViewReceptionAll')}
                        </button>
                        {BLOCKER_COUNTS.map((count) => (
                          <button
                            key={count}
                            type="button"
                            className={`setter-views-editor__chip${view.blockers?.includes(count) ? ' is-active' : ''}`}
                            onClick={() => toggleItem(index, 'blockers', count, BLOCKER_COUNTS)}
                          >
                            {String(count)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="setter-views-editor__group">
                      <span className="setter-views-editor__group-label">{t('attackerViewEvaluationLabel')}</span>
                      <div className="setter-views-editor__chips">
                        <button
                          type="button"
                          className={`setter-views-editor__chip${!view.evaluations?.length ? ' is-active' : ''}`}
                          onClick={() => patchView(index, { evaluations: undefined })}
                        >
                          {t('setterViewReceptionAll')}
                        </button>
                        {ATTACK_EVALS.map((code) => (
                          <button
                            key={code}
                            type="button"
                            className={`setter-views-editor__chip${view.evaluations?.includes(code) ? ' is-active' : ''}`}
                            onClick={() => toggleItem(index, 'evaluations', code, ATTACK_EVALS)}
                          >
                            {code}
                          </button>
                        ))}
                      </div>
                    </div>

                    {combinationCodes.length > 0 ? (
                      <div className="setter-views-editor__group">
                        <span className="setter-views-editor__group-label">{t('attackerViewBaseLabel')}</span>
                        <div className="setter-views-editor__chips">
                          <button
                            type="button"
                            className={`setter-views-editor__chip${!view.combinationCodes?.length ? ' is-active' : ''}`}
                            onClick={() => patchView(index, { combinationCodes: undefined })}
                          >
                            {t('setterViewReceptionAll')}
                          </button>
                          {combinationCodes.map((code) => (
                            <button
                              key={code}
                              type="button"
                              className={`setter-views-editor__chip${view.combinationCodes?.includes(code) ? ' is-active' : ''}`}
                              onClick={() => toggleItem(index, 'combinationCodes', code, combinationCodes)}
                            >
                              {code}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
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
