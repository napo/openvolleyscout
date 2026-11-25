// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { useTranslation } from '@src/i18n';
import { ChipSelect, EvaluationChips, FilterGroup, FilterGroups } from '@src/components/filter-chips/FilterChips';
import type {
  SetterDistributionReceptionEval,
  SetterDistributionServeType,
  SetterDistributionViewConfig,
} from '@src/domain/opponent-report/types';
import type { ReportPlayer } from '../model/report-metrics';

const SERVE_TYPES: ReadonlyArray<{ value: SetterDistributionServeType; labelKey: 'setterViewServeJumpSpin' | 'setterViewServeJumpFloat' | 'setterViewServeFloat' | 'setterViewServeOther' }> = [
  { value: 'jump_spin', labelKey: 'setterViewServeJumpSpin' },
  { value: 'jump_float', labelKey: 'setterViewServeJumpFloat' },
  { value: 'float', labelKey: 'setterViewServeFloat' },
  { value: 'other', labelKey: 'setterViewServeOther' },
];

/** DataVolley serve start zones behind the end line (manual 13.2: 1, 9, 6, 7, 5). */
const SERVE_START_ZONES = ['1', '9', '6', '7', '5'] as const;
/** DataVolley reception arrival zones (deep 1/6/5, intermediate 9/8/7, short 2/3/4). */
const RECEPTION_ZONES = ['1', '6', '5', '9', '8', '7', '2', '3', '4'] as const;

const RECEPTION_EVALS: readonly SetterDistributionReceptionEval[] = ['#', '+', '!', '-'];

function getEffectiveReceptionEvals(view: SetterDistributionViewConfig): SetterDistributionReceptionEval[] {
  if (view.receptionEvaluations && view.receptionEvaluations.length > 0) {
    return [...view.receptionEvaluations];
  }
  if (view.receptionBand === 'positive') return ['#', '+'];
  if (view.receptionBand === 'negative') return ['!', '-'];
  return [...RECEPTION_EVALS];
}

interface SetterViewsEditorProps {
  views: readonly SetterDistributionViewConfig[] | undefined;
  receivers?: readonly ReportPlayer[];
  onChange: (nextViews: SetterDistributionViewConfig[] | undefined) => void;
}

export function SetterViewsEditor({ views, receivers = [], onChange }: SetterViewsEditorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const all = t('setterViewFilterAll');

  const defaultViews = (): SetterDistributionViewConfig[] => [
    { id: 'positive', label: t('opponentReportSetterPositiveBand'), receptionBand: 'positive' },
    { id: 'negative', label: t('opponentReportSetterNegativeBand'), receptionBand: 'negative' },
  ];

  const activeViews: SetterDistributionViewConfig[] = views && views.length > 0 ? [...views] : defaultViews();

  const patchView = (index: number, patch: Partial<SetterDistributionViewConfig>) => {
    const next = activeViews.map((v, i) => (i === index ? { ...v, ...patch } : v));
    onChange(next);
  };

  // The symbols chosen, or none when the view keeps every reception (band "all").
  const selectedReceptionEvals = (view: SetterDistributionViewConfig): SetterDistributionReceptionEval[] => {
    const effective = getEffectiveReceptionEvals(view);
    return effective.length === RECEPTION_EVALS.length ? [] : effective;
  };

  // Saved as a band when it is one (positive, negative, all), so older reports keep reading it.
  const setReceptionEvals = (index: number, next: readonly SetterDistributionReceptionEval[]) => {
    const ordered = RECEPTION_EVALS.filter((code) => next.includes(code));
    if (ordered.length === 0 || ordered.length === RECEPTION_EVALS.length) {
      patchView(index, { receptionBand: 'all', receptionEvaluations: undefined });
    } else if (ordered.length === 2 && ordered[0] === '#' && ordered[1] === '+') {
      patchView(index, { receptionBand: 'positive', receptionEvaluations: undefined });
    } else if (ordered.length === 2 && ordered[0] === '!' && ordered[1] === '-') {
      patchView(index, { receptionBand: 'negative', receptionEvaluations: undefined });
    } else {
      patchView(index, { receptionBand: 'all', receptionEvaluations: ordered });
    }
  };

  const addView = (base?: SetterDistributionViewConfig) => {
    const id = `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const entry: SetterDistributionViewConfig = base
      ? {
          ...base,
          id,
          label: `${base.label} (${activeViews.length + 1})`,
          receptionEvaluations: base.receptionEvaluations ? [...base.receptionEvaluations] : undefined,
          serveTypes: base.serveTypes ? [...base.serveTypes] : undefined,
          serveStartZones: base.serveStartZones ? [...base.serveStartZones] : undefined,
          receptionZones: base.receptionZones ? [...base.receptionZones] : undefined,
          receiverKeys: base.receiverKeys ? [...base.receiverKeys] : undefined,
        }
      : {
          id,
          label: t('setterViewNewLabel', { n: activeViews.length + 1 }),
          receptionBand: 'all',
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
          {t('setterViewsConfigure')} ({activeViews.length})
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
          <p className="opponent-report__hint">{t('setterViewsHint')}</p>
          <div className="setter-views-editor__list">
            {activeViews.map((view, index) => (
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
                  <FilterGroup title={t('setterViewReceptionLabel')} active={selectedReceptionEvals(view).length > 0}>
                    <EvaluationChips
                      skill="receive"
                      allLabel={t('setterViewReceptionAll')}
                      evaluations={RECEPTION_EVALS}
                      presets={[
                        { label: t('setterViewReceptionPositive'), value: ['#', '+'] },
                        { label: t('setterViewReceptionNegative'), value: ['!', '-'] },
                      ]}
                      selected={selectedReceptionEvals(view)}
                      onChange={(next) => setReceptionEvals(index, next as SetterDistributionReceptionEval[])}
                    />
                  </FilterGroup>

                  <FilterGroup title={t('setterViewServeTypeLabel')} active={Boolean(view.serveTypes?.length)}>
                    <ChipSelect
                      allLabel={all}
                      options={SERVE_TYPES.map((st) => ({ value: st.value, label: t(st.labelKey) }))}
                      selected={view.serveTypes ?? []}
                      onChange={(next) => patchView(index, { serveTypes: next.length > 0 ? next : undefined })}
                    />
                  </FilterGroup>

                  <FilterGroup title={t('setterViewServeStartLabel')} active={Boolean(view.serveStartZones?.length)}>
                    <ChipSelect
                      allLabel={all}
                      options={SERVE_START_ZONES.map((zone) => ({ value: zone, label: `Z${zone}` }))}
                      selected={view.serveStartZones ?? []}
                      onChange={(next) => patchView(index, { serveStartZones: next.length > 0 ? next : undefined })}
                    />
                  </FilterGroup>

                  <FilterGroup title={t('setterViewReceptionZonesLabel')} active={Boolean(view.receptionZones?.length)}>
                    <ChipSelect
                      allLabel={all}
                      options={RECEPTION_ZONES.map((zone) => ({ value: zone, label: `Z${zone}` }))}
                      selected={view.receptionZones ?? []}
                      onChange={(next) => patchView(index, { receptionZones: next.length > 0 ? next : undefined })}
                    />
                  </FilterGroup>

                  {receivers.length > 0 ? (
                    <FilterGroup title={t('setterViewReceiversLabel')} active={Boolean(view.receiverKeys?.length)} wide>
                      <ChipSelect
                        allLabel={all}
                        options={receivers.map((player) => ({ value: player.key, label: `#${player.jersey} ${player.name}`.trim() }))}
                        selected={view.receiverKeys ?? []}
                        onChange={(next) => patchView(index, { receiverKeys: next.length > 0 ? next : undefined })}
                      />
                    </FilterGroup>
                  ) : null}
                </FilterGroups>
              </div>
            ))}
          </div>
          <div className="setter-views-editor__footer">
            <button
              type="button"
              className="btn-primary btn-small"
              onClick={() => addView()}
            >
              + {t('setterViewsAdd')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
